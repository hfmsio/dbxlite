/**
 * ConnectorRegistry — which connectors exist, which one is active, and a
 * change signal keyed by slot.
 *
 * Extracted from StreamingQueryService (WS-A / A7a in docs/REFACTOR-PLAN.md).
 * This is the *core* only: the Map, the active selection, the mode, and the
 * event seam. Connection lifecycle orchestration (setupBigQuery, restore,
 * reconnect, the credential store, the OAuth redirect) deliberately stays on
 * the service until A7b/A7c.
 *
 * ## Why events live here rather than on connectors
 *
 * Every reconnect constructs a fresh connector — `new BigQueryConnector(...)`
 * — and disconnect deletes the slot outright. A subscription bound to a
 * connector *instance* therefore dangles after the next reconnect, and the
 * connect edge happens inside the setup call before any consumer could hold
 * the new instance. Consumers don't hold connectors anyway; they ask the
 * facade (`isBigQueryConnected()`, `getSnowflakeConnector()`).
 *
 * So the registry owns the event surface, keyed by connector *slot*, and
 * re-emits across instance swaps. That is the same ownership model
 * `onSchemaChange` already uses, and the reason WS-B depends on this PR.
 */

import {
	type BaseConnector,
	type ConnectorStatus,
	type ConnectorStatusReason,
	isConnectorStateSource,
} from "@ide/connectors";
import type { ConnectorType } from "../../types/data-source";
import { createLogger } from "../../utils/logger";
import { ConnectorMode } from "./connector-mode";

const logger = createLogger("ConnectorRegistry");

export type ConnectorEvent =
	| {
			type: "statusChange";
			connector: ConnectorType;
			status: ConnectorStatus;
			/**
			 * Why the status changed. Consumers that evict cached state on
			 * disconnect must check this: only an `auth` (or `manual`) ending
			 * invalidates the catalog, never a transient network failure.
			 */
			reason?: ConnectorStatusReason;
	  }
	| {
			/**
			 * The connector's session context (role, warehouse, database,
			 * billing project) may have changed. Deliberately payload-free:
			 * consumers re-read from their catalog provider, exactly as they
			 * did when polling. That keeps this module free of app-level view
			 * types and keeps the event a trigger rather than a second source
			 * of truth.
			 */
			type: "sessionContextChange";
			connector: ConnectorType;
	  };

export type ConnectorEventHandler = (event: ConnectorEvent) => void;

export class ConnectorRegistry {
	private readonly connectors = new Map<ConnectorType, BaseConnector>();
	private active: ConnectorType = "duckdb";
	private readonly handlers = new Set<ConnectorEventHandler>();
	/**
	 * Last status emitted per slot, so a repeated status is dropped. Without
	 * this a re-emitting caller could fire a spurious `disconnected`, which
	 * downstream is a catalog-eviction edge.
	 */
	private readonly lastStatus = new Map<ConnectorType, ConnectorStatus>();

	readonly mode = new ConnectorMode();

	/**
	 * Detach handles for the per-instance subscriptions this registry holds,
	 * so replacing or removing a connector cannot leak the old one's listener.
	 */
	private readonly forwarding = new Map<ConnectorType, () => void>();

	// --- membership -------------------------------------------------------

	/**
	 * Put a connector in a slot, taking over event forwarding for it. Any
	 * previous occupant's subscription is detached first: reconnects build a
	 * fresh connector, and a stale subscription would both leak and let a dead
	 * instance speak for a live slot.
	 */
	set(type: ConnectorType, connector: BaseConnector): void {
		this.detach(type);
		this.connectors.set(type, connector);

		if (isConnectorStateSource(connector)) {
			const off = connector.onStateChange((event) => {
				// Re-emit on the stable slot key. Consumers subscribed to the
				// registry never see the instance swap underneath them.
				this.emitStatus(type, event.status, event.reason);
			});
			this.forwarding.set(type, off);
		}
	}

	delete(type: ConnectorType): boolean {
		this.detach(type);
		this.lastStatus.delete(type);
		return this.connectors.delete(type);
	}

	private detach(type: ConnectorType): void {
		const off = this.forwarding.get(type);
		if (off) {
			off();
			this.forwarding.delete(type);
		}
	}

	get(type: ConnectorType): BaseConnector | null {
		return this.connectors.get(type) ?? null;
	}

	has(type: ConnectorType): boolean {
		return this.connectors.has(type);
	}

	// --- active selection -------------------------------------------------

	/**
	 * Set the user's current selection — the connector the Run button targets.
	 * Throws when the slot is empty, which is what callers rely on to detect a
	 * connector that was never initialized.
	 */
	setActive(type: ConnectorType): void {
		if (!this.connectors.has(type)) {
			throw new Error(`Connector ${type} not initialized`);
		}
		this.active = type;
	}

	getActiveType(): ConnectorType {
		return this.active;
	}

	getActive(): BaseConnector {
		const connector = this.connectors.get(this.active);
		if (!connector) {
			throw new Error(`No active connector available`);
		}
		return connector;
	}

	// --- event surface ----------------------------------------------------

	/**
	 * Subscribe to connector state changes. Same shape as the existing
	 * `onSchemaChange`: returns its own unsubscribe.
	 */
	onConnectorState(handler: ConnectorEventHandler): () => void {
		this.handlers.add(handler);
		return () => {
			this.handlers.delete(handler);
		};
	}

	/**
	 * Announce a status transition for a slot. Repeats are dropped, so callers
	 * can emit unconditionally at their transition points.
	 */
	emitStatus(
		connector: ConnectorType,
		status: ConnectorStatus,
		reason?: ConnectorStatusReason,
	): void {
		if (this.lastStatus.get(connector) === status) return;
		this.lastStatus.set(connector, status);
		this.emit({ type: "statusChange", connector, status, reason });
	}

	/** Announce a session-context change (role, warehouse, billing project). */
	emitSessionContext(connector: ConnectorType): void {
		this.emit({ type: "sessionContextChange", connector });
	}

	/** How many subscribers are attached. Exposed for leak assertions. */
	get listenerCount(): number {
		return this.handlers.size;
	}

	private emit(event: ConnectorEvent): void {
		// Snapshot: a handler may unsubscribe (or subscribe) during dispatch.
		for (const handler of [...this.handlers]) {
			try {
				handler(event);
			} catch (err) {
				// One bad subscriber must not stop the others from being told.
				logger.warn("Connector event handler threw", err);
			}
		}
	}
}
