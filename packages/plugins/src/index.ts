// Plugin host API

/** Command handler function type */
export type CommandHandler<TArgs extends unknown[] = unknown[], TReturn = unknown> =
  (...args: TArgs) => Promise<TReturn> | TReturn

/** Event handler function type */
export type EventHandler<TPayload = unknown> = (payload: TPayload) => void

/** Schema returned from getSchema */
export interface PluginSchema {
  tables: Array<{ name: string; columns?: unknown[] }>
}

export type PluginContext = {
  registerCommand: <TArgs extends unknown[] = unknown[], TReturn = unknown>(
    id: string,
    handler: CommandHandler<TArgs, TReturn>
  ) => void
  onEvent: <TPayload = unknown>(name: string, handler: EventHandler<TPayload>) => void
  getSchema: () => Promise<PluginSchema>
}

export type Plugin = (ctx: PluginContext) => void

// Simple host that runs plugins
export class PluginHost {
  private commands = new Map<string, CommandHandler>()

  async load(plugin: Plugin): Promise<void> {
    const ctx: PluginContext = {
      registerCommand: (id, handler) => this.commands.set(id, handler),
      onEvent: (_name, _handler) => { /* no-op in scaffold */ },
      getSchema: async () => ({ tables: [] })
    }
    plugin(ctx)
  }

  async runCommand<TReturn = unknown>(id: string, ...args: unknown[]): Promise<TReturn> {
    const fn = this.commands.get(id)
    if (!fn) throw new Error('command not found:' + id)
    return await fn(...args) as TReturn
  }
}
