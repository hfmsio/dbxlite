/**
 * SnowflakeLifecycle — connect, restore, reconfigure, disconnect.
 *
 * Extracted from StreamingQueryService (WS-A / A7c in docs/REFACTOR-PLAN.md).
 * Mirror of BigQueryLifecycle, with two Snowflake-specific wrinkles preserved
 * exactly:
 *
 *  - **Two auth shapes.** OAuth (popup + client id/secret) and PAT (a bearer
 *    token, no popup, no admin setup). Stored configs written before PAT
 *    existed carry no `authMode`, so a missing one still means OAuth.
 *  - **Reconfiguration without re-auth.** Changing warehouse/role/database/
 *    schema keeps the session; it only moves the session context, which is why
 *    it announces a context change rather than a status change.
 */

import {
	type CloudConnector,
	type EncryptedCredentialStore,
	SnowflakeConnector,
} from "./lifecycle-deps";
import { createLogger } from "../../utils/logger";
import type { ConnectorRegistry } from "./connector-registry";

const logger = createLogger("SnowflakeLifecycle");

const CONFIG_KEY = "snowflake-config";
const PAT_KEY = "snowflake-pat";
const TOKEN_KEY = "snowflake-token";

/** UI-facing setup options; the auth discriminator is mapped from these. */
export interface SnowflakeSetupOptions {
	account: string;
	/** OAuth client ID. Required when auth.mode is "oauth" (or omitted). */
	clientId?: string;
	/**
	 * OAuth client secret. Optional — omit for `OAUTH_CLIENT_TYPE = 'PUBLIC'`
	 * (PKCE-only), which is recommended for browser deployments since secrets
	 * are recoverable by any same-origin script.
	 */
	clientSecret?: string;
	/** Defaults to OAuth, for call sites that pass clientId at the top level. */
	auth?: { mode: "oauth" } | { mode: "pat"; token: string };
	warehouse: string;
	role?: string;
	database?: string;
	schema?: string;
}

type ConnectorAuth =
	| { mode: "oauth"; clientId: string; clientSecret?: string }
	| { mode: "pat"; token: string };

type StoredConfig = Partial<SnowflakeSetupOptions> & {
	authMode?: "oauth" | "pat";
};

export class SnowflakeLifecycle {
	constructor(
		private readonly registry: ConnectorRegistry,
		private readonly getCredentialStore: () => EncryptedCredentialStore | null,
	) {}

	isConnected(): boolean {
		const connector = this.registry.get("snowflake");
		if (!connector) return false;
		if (
			"isConnected" in connector &&
			typeof connector.isConnected === "function"
		) {
			return (connector as CloudConnector).isConnected?.() ?? false;
		}
		return false;
	}

	/** Interactive setup. OAuth runs the popup flow; PAT connects directly. */
	async setup(opts: SnowflakeSetupOptions): Promise<void> {
		const credentialStore = this.getCredentialStore();
		if (!credentialStore) {
			throw new Error("Credential store not initialized");
		}

		// Map the UI-facing options to the connector's auth discriminator.
		// PAT mode bypasses the OAuth popup; OAuth (default) keeps the
		// existing flow.
		const auth: ConnectorAuth =
			opts.auth?.mode === "pat"
				? { mode: "pat", token: opts.auth.token }
				: {
						mode: "oauth",
						clientId: opts.clientId ?? "",
						clientSecret: opts.clientSecret,
					};

		const sf = new SnowflakeConnector({
			credentialStore,
			account: opts.account,
			auth,
			warehouse: opts.warehouse,
			role: opts.role,
			database: opts.database,
			schema: opts.schema,
		});
		await sf.connect({ options: {} });
		this.adopt(sf);
	}

	/** Rehydrate a previous session from stored credentials at app start. */
	async restore(): Promise<boolean> {
		const credentialStore = this.getCredentialStore();
		if (!credentialStore) {
			logger.debug("No credential store available for Snowflake restoration");
			return false;
		}

		try {
			const config = (await credentialStore.load(
				CONFIG_KEY,
			)) as StoredConfig | null;
			if (!config || !config.account) {
				logger.debug("No valid Snowflake config in storage");
				return false;
			}
			// Configs written before PAT support carry no authMode.
			const storedMode = config.authMode ?? "oauth";

			let auth: ConnectorAuth;
			if (storedMode === "pat") {
				const pat = (await credentialStore.load(PAT_KEY)) as string | null;
				if (!pat) {
					logger.debug("PAT mode but no token in storage");
					return false;
				}
				auth = { mode: "pat", token: pat };
			} else {
				const token = await credentialStore.load(TOKEN_KEY);
				if (!token || !config.clientId) {
					logger.debug("No valid Snowflake OAuth token/clientId in storage");
					return false;
				}
				auth = {
					mode: "oauth",
					clientId: config.clientId,
					clientSecret: config.clientSecret,
				};
			}

			const sf = new SnowflakeConnector({
				credentialStore,
				account: config.account,
				auth,
				warehouse: config.warehouse ?? "",
				role: config.role,
				database: config.database,
				schema: config.schema,
			});
			const ok = await sf.initializeFromStorage();
			if (!ok) {
				logger.debug("Snowflake initializeFromStorage returned false");
				return false;
			}

			this.adopt(sf);
			logger.info("Snowflake connection restored from storage", {
				authMode: storedMode,
			});
			return true;
		} catch (error) {
			logger.error("Failed to restore Snowflake connection", error);
			return false;
		}
	}

	/**
	 * Change warehouse/database/schema/role without re-authenticating. The
	 * session survives, so this is a context change rather than a status one —
	 * and it is the only path that moves the values the context chips display.
	 */
	async updateConfig(config: {
		warehouse?: string;
		database?: string;
		schema?: string;
		role?: string;
	}): Promise<void> {
		const sf = this.getConnector();
		if (!sf) {
			throw new Error("Snowflake connector not initialized");
		}
		await sf.updateConfig(config);
		this.registry.emitSessionContext("snowflake");
	}

	/** Explicit user disconnect: revoke and empty the slot. */
	async disconnect(): Promise<void> {
		const connector = this.registry.get("snowflake");
		if (!connector) return;

		if ("revoke" in connector && typeof connector.revoke === "function") {
			await (connector as CloudConnector).revoke?.();
		}

		this.registry.delete("snowflake");
		this.announce();
	}

	/** The live connector, narrowed. Null when the slot is empty or foreign. */
	getConnector(): SnowflakeConnector | null {
		const connector = this.registry.get("snowflake");
		return connector instanceof SnowflakeConnector ? connector : null;
	}

	private adopt(connector: SnowflakeConnector): void {
		this.registry.set("snowflake", connector);
		this.announce();
		this.registry.emitSessionContext("snowflake");
	}

	private announce(): void {
		const connected = this.isConnected();
		this.registry.emitStatus(
			"snowflake",
			connected ? "connected" : "disconnected",
			connected ? "connected" : "manual",
		);
	}
}
