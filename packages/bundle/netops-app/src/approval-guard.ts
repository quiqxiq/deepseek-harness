/**
 * NetOps tool approval policy guard:
 * - Read/inspect/query tools run immediately without confirmation in all modes.
 * - Host system operations (bash, write, edit) always require explicit approval by default
 *   to protect the local host environment.
 * - Device mutations (routeros_run, push_config, OLT registration, etc.) execute directly
 *   when device-full-access or danger-full-access mode is active, but require approval
 *   in default workspace-write mode.
 *
 * @module @deepseek-ai/dsh-netops-app/src/approval-guard
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-permission-presets'

/** Set of tools that execute mutations directly on the local host machine. */
const SYSTEM_MUTATION_TOOLS = new Set<string>([
  'bash',
  'pwsh',
  'write',
  'edit',
  'apply_patch',
])

/**
 * Determine whether a tool operates on the host system (files or local shell).
 * @param name - tool name as registered on ToolRuntime
 * @returns true if the tool modifies the host environment
 */
export function isSystemTool(name: string): boolean {
  return SYSTEM_MUTATION_TOOLS.has(name)
}

/**
 * Determine whether a tool targets a remote network device.
 * @param name - tool name as registered on ToolRuntime
 * @returns true if the tool targets network devices
 */
export function isDeviceTool(name: string): boolean {
  if (
    name.startsWith('mcp__') ||
    name.startsWith('routeros_') ||
    name.startsWith('olt_') ||
    name.startsWith('mikhmon_') ||
    name === 'run_command' ||
    name === 'push_config' ||
    name === 'get_device_status' ||
    name.includes('routeros_') ||
    name.includes('olt_') ||
    name.includes('mikhmon_')
  ) {
    return true
  }
  return false
}

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
 * Check whether the active execution context has device-level full access enabled.
 * In this mode, network device operations execute directly without confirmation prompts,
 * while local host system operations (bash, write, edit) remain strictly protected.
 * @param ctx - Cordis context
 * @param exec - live tool execution
 * @returns true if device operations can bypass approval
 */
export function isDeviceFullAccess(ctx: Context, exec: ToolExecution): boolean {
  if (exec.agent !== undefined) {
    const permissionPresets = ctx.get('permissionPresets')
    if (permissionPresets !== undefined) {
      try {
        const preset = permissionPresets.current(exec.agent.session)
        if (preset === 'device-full-access' || preset === 'danger-full-access') {
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

  const envMode = process.env.DSH_PERMISSION_MODE
  const deviceEnvMode = process.env.DSH_DEVICE_PERMISSION_MODE
  if (
    envMode === 'device-full-access' ||
    envMode === 'danger-full-access' ||
    deviceEnvMode === 'full-access'
  ) {
    return true
  }

  return false
}

/**
 * Check whether host system tools (bash, write, edit) are permitted to execute without confirmation.
 * By default in NetOps, host operations ALWAYS require explicit user confirmation.
 * @param _ctx - Cordis context
 * @param _exec - live tool execution
 * @returns true only if host mutation approval bypass is explicitly configured
 */
export function isHostFullAccess(_ctx: Context, _exec: ToolExecution): boolean {
  return process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL === 'true'
}

/**
 * Check whether the active execution context is in danger-full-access mode.
 * Maintained for backward compatibility.
 * @param ctx - Cordis context
 * @param exec - live tool execution
 * @returns true if session or runtime is in full access mode
 */
export function isDangerFullAccess(ctx: Context, exec: ToolExecution): boolean {
  return isDeviceFullAccess(ctx, exec)
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

    // 2. Host system operations (bash, write, edit, apply_patch, pwsh):
    // Local host system changes MUST require explicit user approval unless host bypass is explicitly enabled.
    if (isSystemTool(exec.name)) {
      if (isHostFullAccess(ctx, exec)) {
        return downstream
      }
      return {
        kind: 'ask',
        reason: `Host system tool "${exec.name}" modifies local host files or runs local commands and requires explicit approval.`,
        displayReason: {
          en: `Allow execution of host system tool "${exec.name}"?`,
          id: `Izinkan eksekusi tool sistem host "${exec.name}"?`,
        },
      }
    }

    // 3. Network device mutating operations (routeros_run, push_config, OLT registration, etc.):
    // If device-level full access is active, execute directly without prompt.
    if (isDeviceFullAccess(ctx, exec)) {
      return downstream
    }

    // 4. Default mode (workspace-write or non-full-access):
    // Device changes require explicit confirmation
    return {
      kind: 'ask',
      reason: `Device tool "${exec.name}" performs network configuration changes and requires your approval.`,
      displayReason: {
        en: `Allow execution of device tool "${exec.name}"?`,
        id: `Izinkan eksekusi tool perangkat "${exec.name}"?`,
      },
    }
  })
}
