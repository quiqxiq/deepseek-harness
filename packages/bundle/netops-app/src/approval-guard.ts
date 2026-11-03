/**
 * NetOps tool approval policy guard:
 * - Read/inspect/query tools run immediately without confirmation in all modes.
 * - Non-read operations (write, edit, bash, routeros_run, mutating MCP calls)
 *   require explicit user approval in workspace-write mode.
 * - In danger-full-access mode, all operations execute directly without confirmation.
 *
 * @module @deepseek-ai/dsh-netops-app/src/approval-guard
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-permission-presets'

/** Set of tools known to be strictly read-only and non-disruptive. */
const READ_ONLY_TOOLS = new Set<string>([
  // Filesystem read tools
  'read',
  'read_image',
  'glob',
  'grep',

  // Web search and fetch
  'web_search',
  'web_fetch',

  // Task and conversational planning
  'todo_read',
  'todo_write',
  'ask_user',
  'goal',
  'load_skill',
  'list_skills',

  // Polyglot RouterOS inspect tools
  'mcp__polyglot__routeros_list_menu',
  'mcp__polyglot__routeros_describe_command',
  'mcp__polyglot__routeros_suggest',
  'mcp__polyglot__routeros_validate',
])

/**
 * Determine whether a tool is a read-only or inspection operation.
 * @param name - tool name as registered on ToolRuntime
 * @returns true if the tool performs only read or inspection
 */
export function isReadOnlyTool(name: string): boolean {
  if (READ_ONLY_TOOLS.has(name)) {
    return true
  }

  // RouterOS inspect tools regardless of MCP server prefix
  if (
    name.includes('routeros_list_menu') ||
    name.includes('routeros_describe_command') ||
    name.includes('routeros_suggest') ||
    name.includes('routeros_validate')
  ) {
    return true
  }

  // RouterOS execution tool is explicitly mutating
  if (name.includes('routeros_run')) {
    return false
  }

  // MCP tool conventions
  if (name.startsWith('mcp__')) {
    // Specifically mutating suffixes
    if (
      name.endsWith('_run') ||
      name.endsWith('_create') ||
      name.endsWith('_update') ||
      name.endsWith('_delete') ||
      name.endsWith('_reboot') ||
      name.endsWith('_execute') ||
      name.endsWith('_register_onu') ||
      name.endsWith('_reboot_onu')
    ) {
      return false
    }

    // Explicit read suffixes
    if (
      name.endsWith('_list') ||
      name.endsWith('_get') ||
      name.endsWith('_inspect') ||
      name.includes('_inspect_') ||
      name.endsWith('_info') ||
      name.endsWith('_status') ||
      name.endsWith('_check')
    ) {
      return true
    }
  }

  // Generic query prefixes
  if (name.startsWith('list_') || name.startsWith('get_') || name.startsWith('describe_')) {
    return true
  }

  return false
}

/**
 * Check whether the active execution context is in danger-full-access mode.
 * @param ctx - Cordis context
 * @param exec - live tool execution
 * @returns true if session or runtime is in full access mode
 */
export function isDangerFullAccess(ctx: Context, exec: ToolExecution): boolean {
  if (exec.agent !== undefined) {
    const permissionPresets = ctx.get('permissionPresets')
    if (permissionPresets !== undefined) {
      try {
        const preset = permissionPresets.current(exec.agent.session)
        if (preset === 'danger-full-access') {
          return true
        }
      } catch {
        // session or projection unready; fall through to runtime checks
      }
    }
  }

  const shell = ctx.get('shell')
  if (shell?.sandboxMode === 'danger-full-access') {
    return true
  }

  if (process.env.DSH_PERMISSION_MODE === 'danger-full-access') {
    return true
  }

  return false
}

/**
 * Apply the NetOps tool approval policy guard on the context.
 * @param ctx - Cordis context
 */
export function applyApprovalGuard(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    // Call downstream listeners first to preserve any early deny/cancel decisions
    const downstream = await next()
    if (downstream.kind !== 'allow') {
      return downstream
    }

    // 1. Read operations: immediately allowed without approval
    if (isReadOnlyTool(exec.name)) {
      return downstream
    }

    // 2. Full-access mode: mutating operations execute directly without confirmation
    if (isDangerFullAccess(ctx, exec)) {
      return downstream
    }

    // 3. Write / mutating operations in workspace-write (or any non-full-access mode):
    // Require explicit approval prompt from user
    return {
      kind: 'ask',
      reason: `Tool "${exec.name}" performs changes or execution and requires your approval.`,
      displayReason: {
        en: `Allow execution of "${exec.name}"?`,
        id: `Izinkan eksekusi tool "${exec.name}"?`,
      },
    }
  })
}
