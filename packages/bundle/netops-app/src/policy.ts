/**
 * Volatile NetOps execution policy. The emergency host-shell switch opens one
 * bounded window; expiry closes it without a restart or a config edit.
 * @module @deepseek-ai/dsh-netops-app/policy
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'

/** Volatile execution policy consumed by the NetOps approval guard. */
export interface NetOpsPolicy {
  /**
   * Report whether host shell commands may run now.
   * @returns true only while an unexpired emergency window is open.
   */
  allowsHostShell(): boolean
  /**
   * Report the remaining lifetime of the open emergency window.
   * @returns whole seconds left, or 0 when no window is open.
   */
  hostShellRemainingSeconds(): number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Volatile NetOps execution policy; absent outside the netops policy row. */
    netopsPolicy: NetOpsPolicy
  }
}

/** Stable Cordis plugin name. */
export const name = 'netops-policy'

/** Emergency host-shell policy. */
export interface Config {
  /** Open one emergency host-shell window on each false-to-true transition. */
  allowHostShellEmergency: Volatile<boolean>
  /** Maximum lifetime of one emergency window, in seconds. */
  hostShellEmergencyTtlSeconds: number
}

/** Validated emergency host-shell policy. */
export const Config = z.object({
  allowHostShellEmergency: z.boolean().default(false).volatile(),
  hostShellEmergencyTtlSeconds: z.number().step(1).min(1).max(3600).default(300),
})

/**
 * Provide the volatile policy service. A window opens when the switch is on at
 * activation or changes from off to on, and closes at its deadline or when the
 * switch turns off. The switch itself is not rewritten; consumers ask the
 * service, so a stale `true` value cannot grant shell access after expiry.
 * @param ctx - plugin context.
 * @param config - validated policy configuration.
 */
export function apply(ctx: Context, config: Config): void {
  let expiresAt = 0
  let enabled = false

  const sync = (): void => {
    const next = config.allowHostShellEmergency.get()
    if (next === enabled) return
    enabled = next
    expiresAt = next ? Date.now() + config.hostShellEmergencyTtlSeconds * 1000 : 0
  }

  const allowsHostShell = (): boolean => {
    sync()
    return expiresAt > Date.now()
  }

  sync()
  ctx.on('loader/volatile-update', sync)
  ctx.effect(() => () => { expiresAt = 0 })

  ctx.provide('netopsPolicy', {
    allowsHostShell,
    hostShellRemainingSeconds(): number {
      sync()
      return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    },
  })
}
