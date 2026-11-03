/**
 * Durable network-device context for Sessions whose Workspace targets an
 * inventory device. The plugin appends a model-visible snapshot to the Session
 * log when the target changes and on a bounded refresh interval, so replay
 * reconstructs exactly what the model saw. Device model, token, and
 * cache effects: one short context message per injection; the refresh keeps a
 * long conversation aware of the target without repeating the snapshot on
 * every step.
 * @module @deepseek-ai/dsh-device-context
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { WorkspaceTarget } from '@deepseek-ai/dsh-workspace'
import { z as zod } from 'zod'

/** Cordis plugin identity used as the message source kind. */
export const name = 'device-context'

/** Services required before an injection can be scheduled. */
export const inject = ['agents', 'sessionProjections']

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /**
     * One durable device snapshot injected before a model request.
     * @persistenceAttribution
     */
    'device-context': { kind: 'device-context'; deviceId: string } & ContextFormed
  }
}

/** Request-preparation refresh policy. */
export interface Config {
  /**
   * Minimum milliseconds between device snapshots in one Session. Defaults to
   * 600000 (10 minutes); 0 injects whenever the target changes or a turn starts
   * without an earlier injection in the open turn.
   */
  refreshIntervalMs?: number
}

/** Validated refresh policy. */
export const Config: z<Config> = z.object({
  refreshIntervalMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(600_000),
})

const deviceContextState = zod.object({
  /** Device identity of the last injected snapshot, or null before the first injection. */
  deviceId: zod.string().nullable(),
  /** Wall-clock time of the last injected snapshot, or null. */
  injectedAt: zod.number().nullable(),
})

type DeviceContextState = zod.infer<typeof deviceContextState>

/** Reject intervals outside the exact-millisecond range. */
function refreshInterval(config: Config): number {
  const value = config.refreshIntervalMs ?? 600_000
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`device-context: refreshIntervalMs must be a non-negative safe integer, got ${String(value)}`)
  }
  return value
}

/**
 * Render one device snapshot for the model.
 * @param target - device target adopted by the Session's Workspace.
 * @returns a compact, evidence-oriented context message.
 */
export function renderDeviceContext(target: WorkspaceTarget): string {
  const facts = [
    `device_id: ${target.deviceId}`,
    `name: ${target.name}`,
    ...target.vendor === undefined ? [] : [`vendor: ${target.vendor}`],
    ...target.driverType === undefined ? [] : [`driver: ${target.driverType}`],
    ...target.host === undefined ? [] : [`management: ${target.host}${target.port === undefined ? '' : `:${String(target.port)}`}`],
    ...target.sshPort === undefined ? [] : [`ssh_port: ${String(target.sshPort)}`],
  ]
  return 'Current network device — '
    + `${facts.join('; ')}.\n`
    + 'Use this device_id for device inventory and MCP tools unless the user names another device. '
    + 'Prefer read-only discovery, quote the evidence you used, and state the target, expected impact, '
    + 'and rollback before asking to perform a disruptive change.'
}

/**
 * Resolve the device target of the Session's current directory.
 * @param ctx - plugin context carrying the Workspace registry when composed.
 * @param agent - Session being prepared.
 * @returns the device target, or undefined when the workspace is a plain directory.
 */
async function deviceTargetOf(ctx: Context, agent: Agent): Promise<WorkspaceTarget | undefined> {
  const cwd = agent.session.header.cwd
  if (cwd === undefined) return undefined
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return undefined
  try {
    const workspace = await registry.resolveByPath(cwd)
    return workspace?.target
  } catch (error: unknown) {
    ctx.logger.warn(`device-context: workspace lookup for '${cwd}' failed: ${String(error)}`)
    return undefined
  }
}

/**
 * Register the device-context projection and pre-step injection.
 * @param ctx - plugin context.
 * @param config - refresh policy.
 * @returns after the projection is registered.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const interval = refreshInterval(config)
  const projection = await ctx.sessionProjections.register({
    key: 'deviceContext',
    stateVersion: 1,
    stateSchema: deviceContextState,
    init: (): DeviceContextState => ({ deviceId: null, injectedAt: null }),
    apply: (state, event) => {
      if (event.type !== 'user/message') return state
      const source = event.data.source
      if (source.kind !== name) return state
      return { deviceId: source.deviceId, injectedAt: event.time }
    },
  })

  ctx.on('agent/pre-step', async ({ agent, step, signal }, next): Promise<PreStepDecision> => {
    ctx.fiber.assertActive()
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const target = await deviceTargetOf(ctx, agent)
    if (target === undefined) return decision
    const state = projection.stateOf(agent.session)
    const now = Date.now()
    const refreshDue = state.injectedAt === null
      || (interval > 0 && now >= state.injectedAt && now - state.injectedAt >= interval)
    const targetChanged = state.deviceId !== target.deviceId
    // A new turn without any injection in the open turn still receives the
    // snapshot, so a compacted history cannot leave the model guessing.
    if (!targetChanged && !refreshDue && step > 1) return decision
    const text = renderDeviceContext(target)
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: name,
            form: 'snapshot',
            sections: [{ name, text }],
            deviceId: target.deviceId,
          },
        }),
      ],
    }
  }, { prepend: true })
}
