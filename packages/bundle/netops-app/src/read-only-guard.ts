/**
 * Read-only allowlist guard for the customer-service preset. The preset's MCP
 * token already hides mutation tools; this guard denies every tool outside the
 * fixed read-only catalog, so a misconfigured or compromised server cannot
 * widen the CS surface.
 * @module @deepseek-ai/dsh-netops-app/read-only-guard
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

/** Polyglot MCP tools reachable with the read-only token. */
const READ_ONLY_TOOLS = new Set<string>([
  'mcp__polyglot__customer_lookup',
  'mcp__polyglot__get_device_status',
  'mcp__polyglot__list_devices',
  'mcp__polyglot__mikhmon_get_dashboard',
  'mcp__polyglot__routeros_list_menu',
  'mcp__polyglot__routeros_describe_command',
  'mcp__polyglot__routeros_suggest',
  'mcp__polyglot__routeros_validate',
  'mcp__polyglot__ont_get_status',
  'mcp__polyglot__ont_list',
])

/** Stable Cordis plugin name. */
export const name = 'netops-read-only-guard'

/**
 * Report whether a tool belongs to the fixed read-only catalog.
 * @param toolName - tool name as registered on ToolRuntime.
 * @returns true only for the Polyglot read-only MCP tools.
 */
export function isAllowedTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName)
}

/**
 * Deny every tool outside the read-only catalog. A downstream denial or
 * cancellation is preserved; a downstream `ask` cannot widen the allowlist.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    const downstream = await next()
    if (downstream.kind === 'deny' || downstream.kind === 'cancel') {
      return downstream
    }
    if (isAllowedTool(exec.name)) {
      return downstream
    }
    return {
      kind: 'deny',
      reason: `The customer-service preset is read-only; tool "${exec.name}" is not available.`,
    }
  })
}
