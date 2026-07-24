/**
 * BigQueryLifecycle — connect, restore, reconnect, disconnect.
 *
 * Extracted from StreamingQueryService (WS-A / A7b in docs/REFACTOR-PLAN.md),
 * the plan's highest-risk move because it carries mutable connection state.
 *
 * Ownership note: the plan puts lifecycle orchestration "in the registry".
 * It lives in its own class that the registry owns rather than inside
 * ConnectorRegistry itself — same ownership, without growing the registry into
 * a second god object. The registry stays about slots, selection and events.
 *
 * What deliberately does *not* move down into the connector: the credential
 * store and the OAuth redirect URI. Those are composition-root concerns, and
 * pushing them into BigQueryConnector would make the connector depend on
 * browser location and app storage.
 *
 * Every path that changes connection state announces it, because the UI is now
 * event-driven and a silent transition is a stale UI.
 */

import {
	BigQueryConnector,
	type CloudConnector,
	type EncryptedCredentialStore,
} from "./lifecycle-deps";
import { createLogger } from "../../utils/logger";
import type { ConnectorRegistry } from "./connector-registry";

const logger = createLogger("BigQueryLifecycle");

/** Shape of the OAuth client persisted under OAUTH_CONFIG_KEY. */
interface StoredOAuthConfig {
	clientId?: string;
	clientSecret?: string;
}

/** Cleared on explicit disconnect so the next load doesn't auto-restore. */
const AUTO_CONNECT_KEY = "bigquery-auto-connect";
const OAUTH_CONFIG_KEY = "bigquery-oauth-config";
const TOKEN_KEY = "bigquery-token";

export class BigQueryLifecycle {
	constructor(
		private readonly registry: ConnectorRegistry,
		private readonly getCredentialStore: () => EncryptedCredentialStore | null,
	) {}

	isConnected(): boolean {
		const connector = this.registry.get("bigquery");
		if (!connector) return false;
		if (
			"isConnected" in connector &&
			typeof connector.isConnected === "function"
		) {
			return (connector as CloudConnector).isConnected?.() ?? false;
		}
		return false;
	}

	/** Interactive setup: persists the OAuth client and runs the consent flow. */
	async setup(clientId: string, clientSecret: string): Promise<void> {
		const credentialStore = this.requireCredentialStore();

		// Persist OAuth client credentials for auto-reconnect
		await credentialStore.save(OAUTH_CONFIG_KEY, { clientId, clientSecret });

		const bigquery = new BigQueryConnector(
			credentialStore,
			clientId,
			clientSecret,
		);
		await bigquery.connect({
			options: {
				redirectUri: `${window.location.origin}/oauth-callback`,
			},
		});
		this.adopt(bigquery);
	}

	/**
	 * Connect with a pre-minted access token (`gcloud auth print-access-token`).
	 *
	 * No OAuth client, no consent screen, no Cloud Console work. The token is
	 * short-lived and carries no refresh token, so this is the low-ceremony
	 * path for trying BigQuery out rather than the one to live on.
	 */
	async setupWithAccessToken(accessToken: string): Promise<void> {
		const credentialStore = this.requireCredentialStore();
		const bigquery = new BigQueryConnector(credentialStore, "", undefined, {
			mode: "token",
			accessToken,
		});
		await bigquery.saveAccessToken();
		this.adopt(bigquery);
	}

	/** Rehydrate a previous session from stored credentials at app start. */
	async restore(): Promise<boolean> {
		const credentialStore = this.getCredentialStore();
		if (!credentialStore) {
			logger.debug("No credential store available for BigQuery restoration");
			return false;
		}

		try {
			const oauthConfig = (await credentialStore.load(
				OAUTH_CONFIG_KEY,
			)) as StoredOAuthConfig | null;
			if (!oauthConfig || !oauthConfig.clientId || !oauthConfig.clientSecret) {
				logger.debug(
					"No valid OAuth config found - skipping BigQuery restoration",
				);
				return false;
			}

			const token = await credentialStore.load(TOKEN_KEY);
			if (!token) {
				logger.debug("No token found - skipping BigQuery restoration");
				return false;
			}

			const bigquery = new BigQueryConnector(
				credentialStore,
				oauthConfig.clientId,
				oauthConfig.clientSecret,
			);

			// Load token into memory so isConnected() returns true
			if (
				"initializeFromStorage" in bigquery &&
				typeof bigquery.initializeFromStorage === "function"
			) {
				const hasToken = await bigquery.initializeFromStorage();
				if (!hasToken) {
					logger.debug("BigQuery token not found or invalid in storage");
					return false;
				}
			}

			this.adopt(bigquery);
			logger.info("BigQuery connection restored from storage");
			return true;
		} catch (error) {
			logger.error("Failed to restore BigQuery connection", error);
			return false;
		}
	}

	/** Re-establish a dropped connection without user interaction. */
	async reconnect(): Promise<boolean> {
		const credentialStore = this.getCredentialStore();
		if (!credentialStore) {
			logger.debug("Cannot reconnect - credential store not initialized");
			return false;
		}

		if (this.isConnected()) {
			logger.debug("BigQuery already connected");
			return true;
		}

		try {
			const config = (await credentialStore.load(
				OAUTH_CONFIG_KEY,
			)) as StoredOAuthConfig | null;
			if (!config || !config.clientId) {
				logger.debug("No stored BigQuery OAuth config found");
				return false;
			}

			logger.debug("Found stored OAuth config, attempting reconnect...");

			const bigqueryConnector = new BigQueryConnector(
				credentialStore,
				config.clientId,
				config.clientSecret,
			);

			if (
				"isConnected" in bigqueryConnector &&
				typeof bigqueryConnector.isConnected === "function"
			) {
				if (bigqueryConnector.isConnected()) {
					this.adopt(bigqueryConnector);
					logger.info("BigQuery reconnected successfully");
					return true;
				}
			}

			logger.debug("BigQuery credentials expired or invalid");
			return false;
		} catch (error) {
			logger.error("Failed to reconnect to BigQuery", error);
			return false;
		}
	}

	/** Explicit user disconnect: revoke, forget credentials, stop auto-connect. */
	async disconnect(): Promise<void> {
		const connector = this.registry.get("bigquery");
		if (!connector) return;

		if ("revoke" in connector && typeof connector.revoke === "function") {
			await (connector as CloudConnector).revoke?.();
		}

		this.registry.delete("bigquery");
		this.announce();

		const credentialStore = this.getCredentialStore();
		if (credentialStore) {
			await credentialStore.save(OAUTH_CONFIG_KEY, null);
		}
		// Mirror Snowflake's revoke(): also clear the auto-connect flag so the
		// next page load doesn't try to restore a connection the user just
		// explicitly removed.
		try {
			localStorage.removeItem(AUTO_CONNECT_KEY);
		} catch {
			// localStorage may be unavailable in some test envs
		}
	}

	/** Install a freshly built connector and announce the resulting state. */
	private adopt(connector: BigQueryConnector): void {
		this.registry.set("bigquery", connector);
		this.announce();
	}

	private announce(): void {
		const connected = this.isConnected();
		this.registry.emitStatus(
			"bigquery",
			connected ? "connected" : "disconnected",
			connected ? "connected" : "manual",
		);
	}

	private requireCredentialStore(): EncryptedCredentialStore {
		const store = this.getCredentialStore();
		if (!store) {
			throw new Error("Credential store not initialized");
		}
		return store;
	}
}
