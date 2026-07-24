/**
 * Unit tests for the connector state emitter (WS-B / B2).
 */

import { describe, expect, it, vi } from 'vitest'
import {
  ConnectorStateEmitter,
  classifyAuthFailure,
  isConnectorStateSource,
} from '../connector-state'

describe('ConnectorStateEmitter', () => {
  it('delivers an emitted status to subscribers', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('connected', 'connected')

    expect(listener).toHaveBeenCalledWith({
      status: 'connected',
      reason: 'connected',
    })
  })

  it('carries the reason through, which downstream uses to decide on eviction', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('disconnected', 'auth')

    expect(listener).toHaveBeenCalledWith({
      status: 'disconnected',
      reason: 'auth',
    })
  })

  it('reports whether an emit was delivered', () => {
    const emitter = new ConnectorStateEmitter()

    expect(emitter.emit('connected')).toBe(true)
    expect(emitter.emit('connected')).toBe(false)
  })

  it('drops a repeated status', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('disconnected')
    emitter.emit('disconnected')
    emitter.emit('disconnected')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('delivers a genuine transition', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('connected')
    emitter.emit('disconnected')
    emitter.emit('connected')

    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('dedupes on status alone, ignoring a changed reason', () => {
    // Otherwise a transient failure followed by an auth failure would emit
    // twice and evict the catalog on the second.
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('disconnected', 'manual')
    emitter.emit('disconnected', 'auth')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('re-arms after reset', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    emitter.onStateChange(listener)

    emitter.emit('connected')
    emitter.reset()
    emitter.emit('connected')

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('notifies every subscriber', () => {
    const emitter = new ConnectorStateEmitter()
    const a = vi.fn()
    const b = vi.fn()
    emitter.onStateChange(a)
    emitter.onStateChange(b)

    emitter.emit('connected')

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops delivering after unsubscribe', () => {
    const emitter = new ConnectorStateEmitter()
    const listener = vi.fn()
    const off = emitter.onStateChange(listener)

    off()
    emitter.emit('connected')

    expect(listener).not.toHaveBeenCalled()
    expect(emitter.listenerCount).toBe(0)
  })

  it('does not let a throwing subscriber break the connector or its peers', () => {
    const emitter = new ConnectorStateEmitter()
    const good = vi.fn()
    emitter.onStateChange(() => {
      throw new Error('subscriber blew up')
    })
    emitter.onStateChange(good)

    expect(() => emitter.emit('connected')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('tolerates unsubscribing during dispatch', () => {
    const emitter = new ConnectorStateEmitter()
    const second = vi.fn()
    const off = emitter.onStateChange(() => off())
    emitter.onStateChange(second)

    expect(() => emitter.emit('connected')).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('isConnectorStateSource', () => {
  it('accepts an emitter-backed connector', () => {
    const emitter = new ConnectorStateEmitter()
    const connector = {
      onStateChange: emitter.onStateChange.bind(emitter),
    }

    expect(isConnectorStateSource(connector)).toBe(true)
  })

  it('rejects a connector without the method', () => {
    expect(isConnectorStateSource({ query: () => {} })).toBe(false)
  })

  it.each([[null], [undefined], ['duckdb'], [42]])(
    'rejects the non-object %s',
    (value) => {
      expect(isConnectorStateSource(value)).toBe(false)
    },
  )
})

describe('classifyAuthFailure', () => {
  it('treats 401 as credential invalidation', () => {
    expect(classifyAuthFailure(401)).toBe('auth')
  })

  it.each([[403], [429], [500], [502], [503], [504], [0]])(
    'treats %i as transient, so it cannot evict the catalog',
    (status) => {
      // 403 is deliberately transient: the session is valid, it just lacks a
      // permission. Emitting `disconnected` there would drop a live connection.
      expect(classifyAuthFailure(status)).toBe('transient')
    },
  )
})
