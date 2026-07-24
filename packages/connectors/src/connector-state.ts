/**
 * Connector state events (WS-B / B2 in docs/REFACTOR-PLAN.md).
 *
 * Connectors have never had an event surface, so the UI discovered connection
 * state by asking on a timer. This adds the smallest surface that removes the
 * need to ask: a status signal a connector can emit at its real transitions.
 *
 * Two deliberate scope limits:
 *
 *  - **Status only.** Session-context changes (role, warehouse, billing
 *    project) are shaped by app-level types, so they are emitted at the app's
 *    connector registry rather than from this package. Keeping them out here
 *    preserves the dependency direction — packages never import from apps.
 *
 *  - **Not a bus.** One event type, no topics, no wildcard subscribe. The
 *    registry is what fans this out to consumers.
 *
 * Subscribers bind to a connector *instance*, which is short-lived: every
 * reconnect builds a new connector. Instance subscriptions are therefore for
 * the registry to hold, not for UI code — see ConnectorRegistry.forwardFrom.
 */

/** Where a connector's connection currently stands. */
export type ConnectorStatus = 'connected' | 'disconnected' | 'error'

/**
 * Why the status changed. This exists because the distinction is
 * load-bearing downstream: a `disconnected` caused by an invalidated
 * credential must evict cached catalog metadata, while a transient network
 * failure must not — an eviction on a flaky network wipes autocomplete.
 */
export type ConnectorStatusReason =
  /** Explicit user action: Disconnect, revoke. */
  | 'manual'
  /** Credential is no longer valid: 401, refused refresh, revoked session. */
  | 'auth'
  /** Connection succeeded. */
  | 'connected'

export interface ConnectorStateEvent {
  status: ConnectorStatus
  reason?: ConnectorStatusReason
}

export type ConnectorStateListener = (event: ConnectorStateEvent) => void

/** A connector that announces its own state transitions. */
export interface ConnectorStateSource {
  onStateChange(listener: ConnectorStateListener): () => void
}

/**
 * Composable emitter. Connectors hold one and expose `onStateChange` from it;
 * they call `emit` at their real transition points.
 *
 * Repeated statuses are dropped. Emit points are spread across connect,
 * disconnect, token refresh and the request-failure path, so without dedupe a
 * single logical transition could fire several times — and a repeated
 * `disconnected` is a repeated catalog eviction downstream.
 */
export class ConnectorStateEmitter implements ConnectorStateSource {
  private readonly listeners = new Set<ConnectorStateListener>()
  private last: ConnectorStatus | null = null

  onStateChange(listener: ConnectorStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Announce a transition. Returns whether it was actually delivered. */
  emit(status: ConnectorStatus, reason?: ConnectorStatusReason): boolean {
    if (this.last === status) return false
    this.last = status
    const event: ConnectorStateEvent = { status, reason }
    // Snapshot: a listener may unsubscribe during dispatch.
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch {
        // A failing subscriber must not stop the others being told, and must
        // not propagate into the connector's own control flow.
      }
    }
    return true
  }

  /**
   * Forget the last status so the next emit always fires. Used when a
   * connector is torn down and its slot may be refilled.
   */
  reset(): void {
    this.last = null
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

/**
 * Decide whether an HTTP failure means the credential is dead or the network
 * merely misbehaved.
 *
 * This classification is part of the emit contract, not an implementation
 * detail. Downstream, a `disconnected` triggers a catalog eviction; emitting
 * one for a 503 or a rate-limit would wipe the user's autocomplete metadata
 * every time the network hiccuped, on a connection that is still perfectly
 * valid. So the rule is deliberately narrow: only statuses that mean "this
 * credential will not work again without re-authenticating" count.
 *
 * 403 is *not* auth-invalidation: it means the session is valid but lacks a
 * permission, so the connection stays up.
 */
export function classifyAuthFailure(
  httpStatus: number,
): 'auth' | 'transient' {
  return httpStatus === 401 ? 'auth' : 'transient'
}

/** Narrow an arbitrary connector to one that emits state. */
export function isConnectorStateSource(
  connector: unknown,
): connector is ConnectorStateSource {
  return (
    typeof connector === 'object' &&
    connector !== null &&
    typeof (connector as ConnectorStateSource).onStateChange === 'function'
  )
}
