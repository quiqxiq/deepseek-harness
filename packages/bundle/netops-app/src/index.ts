/**
 * @deepseek-ai/dsh-netops-app — the network-operations bundle's runtime glue.
 * It resolves the Polyglot inventory and device-console endpoints once from
 * deployment config and environment fallbacks, validates them at load, and
 * provides the `netops` service every connection row injects. The bundle patch
 * (`cordis.patch.yml`) composes the device-first surface over `dsh-web-app`.
 * @module @deepseek-ai/dsh-netops-app
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyApprovalGuard } from './approval-guard.ts'

export { isReadOnlyTool, isDangerFullAccess, applyApprovalGuard } from './approval-guard.ts'

/** Resolved connection facts for the network-operations surface. */
export interface NetOpsEnvironment {
  /** Polyglot HTTP API base URL, without a trailing slash. */
  readonly apiBaseUrl: string
  /** Device-console WebSocket base URL, without a trailing slash. */
  readonly wsBaseUrl: string
  /** Streamable HTTP MCP endpoint for the Polyglot tool server. */
  readonly mcpUrl: string
  /** Bearer token for the HTTP inventory, when the deployment requires one. */
  readonly apiToken?: string
  /** Bearer token for the MCP endpoint, when the deployment requires one. */
  readonly mcpToken?: string
  /** Bearer token forwarded to the device console WebSocket. */
  readonly wsToken?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolved network-operations connection facts; absent outside this bundle. */
    netops: NetOpsEnvironment
  }
}

/** Stable Cordis plugin name. */
export const name = 'netops-startup'

/** Deployment overrides; omitted values fall back to the documented environment variables. */
export interface Config {
  /** Polyglot HTTP API base URL. Falls back to `POLYGLOT_API_URL`. */
  apiBaseUrl?: string
  /** Device-console WebSocket base URL. Derived from the API URL when omitted. */
  wsBaseUrl?: string
  /** MCP endpoint. Derived as `<apiBaseUrl>/mcp` when omitted. */
  mcpUrl?: string
  /** Inventory bearer token. Falls back to `POLYGLOT_API_TOKEN`. */
  apiToken?: string
  /** MCP bearer token. Falls back to `POLYGLOT_MCP_TOKEN`. */
  mcpToken?: string
  /** Device-console bearer token. Falls back to the MCP token. */
  wsToken?: string
  /** Whether the read-auto/write-confirm approval guard is enabled (default true). */
  approvalGuard?: boolean
}

/** Validated deployment overrides. */
export const Config: z<Config> = z.object({
  apiBaseUrl: z.string(),
  wsBaseUrl: z.string(),
  mcpUrl: z.string(),
  apiToken: z.string(),
  mcpToken: z.string(),
  wsToken: z.string(),
  approvalGuard: z.boolean().default(true),
})

/**
 * Validate one absolute URL and strip its trailing slash.
 * @param value - configured or environment-supplied URL.
 * @param protocols - allowed protocols.
 * @param label - configuration name used in the failure message.
 * @returns the normalized href.
 * @throws {TypeError} when the value is not an absolute URL with an allowed protocol.
 */
function normalizedUrl(value: string, protocols: readonly string[], label: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (error: unknown) {
    throw new TypeError(`netops-startup: ${label} is not an absolute URL: ${String(error)}`)
  }
  if (!protocols.includes(url.protocol)) {
    throw new TypeError(`netops-startup: ${label} must use ${protocols.join(' or ')}, got '${url.protocol}'`)
  }
  return url.href.replace(/\/$/u, '')
}

/**
 * Resolve the deployment's connection facts.
 * @param config - validated overrides.
 * @param env - environment fallbacks.
 * @returns the resolved environment.
 */
export function resolveEnvironment(
  config: Config = {},
  env: Record<string, string | undefined> = process.env,
): NetOpsEnvironment {
  const api = normalizedUrl(
    config.apiBaseUrl ?? env.POLYGLOT_API_URL ?? 'http://127.0.0.1:8080',
    ['http:', 'https:'],
    'apiBaseUrl',
  )
  const ws = normalizedUrl(
    config.wsBaseUrl
      ?? env.POLYGLOT_WS_URL
      ?? api.replace(/^http/u, 'ws'),
    ['ws:', 'wss:'],
    'wsBaseUrl',
  )
  const mcp = normalizedUrl(
    config.mcpUrl ?? env.POLYGLOT_MCP_URL ?? `${api}/mcp`,
    ['http:', 'https:'],
    'mcpUrl',
  )
  const apiToken = config.apiToken ?? env.POLYGLOT_API_TOKEN
  const mcpToken = config.mcpToken ?? env.POLYGLOT_MCP_TOKEN
  const wsToken = config.wsToken ?? env.POLYGLOT_WS_TOKEN ?? mcpToken
  return {
    apiBaseUrl: api,
    wsBaseUrl: ws,
    mcpUrl: mcp,
    ...apiToken === undefined || apiToken === '' ? {} : { apiToken },
    ...mcpToken === undefined || mcpToken === '' ? {} : { mcpToken },
    ...wsToken === undefined || wsToken === '' ? {} : { wsToken },
  }
}

/**
 * Provide the resolved connection facts to the bundle's rows.
 * @param ctx - plugin context.
 * @param config - validated deployment overrides.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  ctx.provide('netops', resolveEnvironment(config))
  if (config.approvalGuard !== false) {
    applyApprovalGuard(ctx)
  }
}
