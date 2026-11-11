import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolExecution, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import {
  isReadOnlyTool,
  isHostShellTool,
  isFilesystemMutationTool,
  isSystemTool,
  isDeviceTool,
  isDeviceFullAccess,
  isHostShellAllowed,
  isDangerFullAccess,
  applyApprovalGuard,
} from '../src/approval-guard.ts'

function createStubSession(): Session {
  return {} as never
}

function createStubAgent(): Agent {
  return { session: createStubSession() } as never
}

function mockExec(name: string, agent?: Agent): ToolExecution {
  const callId = ToolCallId(`call-${name}`)
  return {
    callId,
    rootCallId: callId,
    token: Symbol('token') as ToolExecutionToken,
    name,
    arguments: {},
    signal: new AbortController().signal,
    ...(agent !== undefined ? { agent } : {}),
  }
}

async function decide(ctx: Context, name: string, agent?: Agent): Promise<PreToolDecision> {
  const exec = mockExec(name, agent)
  return ctx.waterfall(
    'tools/pre-execute',
    exec,
    () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
  )
}

describe('tool classifications', () => {
  it('correctly classifies host system tools', () => {
    expect(isHostShellTool('bash')).toBe(true)
    expect(isHostShellTool('pwsh')).toBe(true)
    expect(isHostShellTool('write')).toBe(false)

    expect(isFilesystemMutationTool('write')).toBe(true)
    expect(isFilesystemMutationTool('edit')).toBe(true)
    expect(isFilesystemMutationTool('apply_patch')).toBe(true)
    expect(isFilesystemMutationTool('bash')).toBe(false)

    expect(isSystemTool('bash')).toBe(true)
    expect(isSystemTool('pwsh')).toBe(true)
    expect(isSystemTool('write')).toBe(true)
    expect(isSystemTool('edit')).toBe(true)
    expect(isSystemTool('apply_patch')).toBe(true)

    expect(isSystemTool('routeros_run')).toBe(false)
    expect(isSystemTool('mcp__polyglot__routeros_run')).toBe(false)
    expect(isSystemTool('read')).toBe(false)
  })

  it('correctly classifies network device tools', () => {
    expect(isDeviceTool('mcp__polyglot__routeros_run')).toBe(true)
    expect(isDeviceTool('routeros_run')).toBe(true)
    expect(isDeviceTool('routeros_suggest')).toBe(true)
    expect(isDeviceTool('olt_register_onu')).toBe(true)
    expect(isDeviceTool('run_command')).toBe(true)
    expect(isDeviceTool('push_config')).toBe(true)

    expect(isDeviceTool('bash')).toBe(false)
    expect(isDeviceTool('write')).toBe(false)
    expect(isDeviceTool('edit')).toBe(false)
  })
})

describe('isReadOnlyTool', () => {
  it('correctly classifies standard read and inspection tools as read-only', () => {
    expect(isReadOnlyTool('read')).toBe(true)
    expect(isReadOnlyTool('read_image')).toBe(true)
    expect(isReadOnlyTool('glob')).toBe(true)
    expect(isReadOnlyTool('grep')).toBe(true)
    expect(isReadOnlyTool('web_search')).toBe(true)
    expect(isReadOnlyTool('web_fetch')).toBe(true)
    expect(isReadOnlyTool('todo_read')).toBe(true)
    expect(isReadOnlyTool('ask_user')).toBe(true)
    expect(isReadOnlyTool('goal')).toBe(true)
  })

  it('correctly classifies RouterOS inspect tools as read-only', () => {
    expect(isReadOnlyTool('mcp__polyglot__routeros_list_menu')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__routeros_describe_command')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__routeros_suggest')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__routeros_validate')).toBe(true)
    // Custom MCP server name
    expect(isReadOnlyTool('mcp__custom_server__routeros_list_menu')).toBe(true)
  })

  it('correctly classifies RouterOS execution tool as NOT read-only', () => {
    expect(isReadOnlyTool('mcp__polyglot__routeros_run')).toBe(false)
  })

  it('correctly classifies MCP list and get tools as read-only', () => {
    expect(isReadOnlyTool('mcp__polyglot__device_list')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__device_get')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__olt_list')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__customer_get')).toBe(true)
    expect(isReadOnlyTool('mcp__polyglot__skill_list')).toBe(true)
  })

  it('correctly classifies mutating MCP tools as NOT read-only', () => {
    expect(isReadOnlyTool('mcp__polyglot__device_create')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__device_update')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__device_delete')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__device_reboot')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__olt_register_onu')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__olt_reboot_onu')).toBe(false)
    expect(isReadOnlyTool('mcp__polyglot__customer_create')).toBe(false)
  })

  it('correctly classifies filesystem and shell mutating tools as NOT read-only', () => {
    expect(isReadOnlyTool('write')).toBe(false)
    expect(isReadOnlyTool('edit')).toBe(false)
    expect(isReadOnlyTool('apply_patch')).toBe(false)
    expect(isReadOnlyTool('bash')).toBe(false)
    expect(isReadOnlyTool('pwsh')).toBe(false)
  })
})

describe('isDeviceFullAccess / isDangerFullAccess', () => {
  it('detects device-full-access from permissionPresets service', () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: (_session: Session) => 'device-full-access',
    } as never)

    const exec = mockExec('mcp__polyglot__routeros_run', createStubAgent())
    expect(isDeviceFullAccess(ctx, exec)).toBe(true)
    expect(isDangerFullAccess(ctx, exec)).toBe(true)
  })

  it('detects danger-full-access from permissionPresets service', () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: (_session: Session) => 'danger-full-access',
    } as never)

    const exec = mockExec('write', createStubAgent())
    expect(isDeviceFullAccess(ctx, exec)).toBe(true)
    expect(isDangerFullAccess(ctx, exec)).toBe(true)
  })

  it('detects workspace-write as NOT full access', () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: (_session: Session) => 'workspace-write',
    } as never)

    const exec = mockExec('write', createStubAgent())
    expect(isDeviceFullAccess(ctx, exec)).toBe(false)
    expect(isDangerFullAccess(ctx, exec)).toBe(false)
  })

  it('detects shell sandboxMode fallback', () => {
    const ctx = new Context()
    ctx.provide('shell', {
      sandboxMode: 'danger-full-access',
    } as never)

    const exec = mockExec('write')
    expect(isDeviceFullAccess(ctx, exec)).toBe(true)
    expect(isDangerFullAccess(ctx, exec)).toBe(true)
  })
})

describe('isHostShellAllowed', () => {
  it('fails closed without the volatile policy service', () => {
    expect(isHostShellAllowed(new Context())).toBe(false)
  })

  it('reads the policy service', () => {
    const ctx = new Context()
    ctx.provide('netopsPolicy', {
      allowsHostShell: () => true,
      hostShellRemainingSeconds: () => 60,
    } as never)
    expect(isHostShellAllowed(ctx)).toBe(true)
  })
})

describe('applyApprovalGuard', () => {
  it('allows read operations without asking in workspace-write mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'workspace-write',
    } as never)
    applyApprovalGuard(ctx)

    expect(await decide(ctx, 'mcp__polyglot__routeros_list_menu', createStubAgent())).toEqual({ kind: 'allow' })
  })

  it('asks before device mutations in workspace-write mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'workspace-write',
    } as never)
    applyApprovalGuard(ctx)

    expect((await decide(ctx, 'mcp__polyglot__routeros_run', createStubAgent())).kind).toBe('ask')
  })

  it('leaves host filesystem mutations to the sandbox and approval policy', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'danger-full-access',
    } as never)
    applyApprovalGuard(ctx)

    for (const name of ['write', 'edit', 'apply_patch']) {
      expect(await decide(ctx, name, createStubAgent())).toEqual({ kind: 'allow' })
    }
  })

  it('denies host shell commands until the policy opens a window', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'danger-full-access',
    } as never)
    applyApprovalGuard(ctx)

    expect((await decide(ctx, 'bash', createStubAgent())).kind).toBe('deny')
    expect((await decide(ctx, 'pwsh', createStubAgent())).kind).toBe('deny')
  })

  it('allows host shell commands only while the policy window is open', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'danger-full-access',
    } as never)
    let open = true
    ctx.provide('netopsPolicy', {
      allowsHostShell: () => open,
      hostShellRemainingSeconds: () => open ? 60 : 0,
    } as never)
    applyApprovalGuard(ctx)

    expect(await decide(ctx, 'bash', createStubAgent())).toEqual({ kind: 'allow' })
    open = false
    expect((await decide(ctx, 'bash', createStubAgent())).kind).toBe('deny')
  })

  it('allows device mutating operations directly in device-full-access mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'device-full-access',
    } as never)
    applyApprovalGuard(ctx)

    expect(await decide(ctx, 'mcp__polyglot__routeros_run', createStubAgent())).toEqual({ kind: 'allow' })
    expect(await decide(ctx, 'mcp__polyglot__olt_register_onu', createStubAgent())).toEqual({ kind: 'allow' })
  })

  it('does not use the removed host-mutation environment bypass', async () => {
    const origEnv = process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL
    try {
      process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL = 'true'
      const ctx = new Context()
      ctx.provide('permissionPresets', {
        current: () => 'device-full-access',
      } as never)
      applyApprovalGuard(ctx)

      expect((await decide(ctx, 'write', createStubAgent())).kind).toBe('allow')
      expect((await decide(ctx, 'bash', createStubAgent())).kind).toBe('deny')
    } finally {
      if (origEnv === undefined) delete process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL
      else process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL = origEnv
    }
  })

  it('preserves a downstream ask for a host filesystem mutation', async () => {
    const ctx = new Context()
    applyApprovalGuard(ctx)

    const exec = mockExec('write', createStubAgent())
    const decision = await ctx.waterfall(
      'tools/pre-execute',
      exec,
      () => Promise.resolve<PreToolDecision>({ kind: 'ask', reason: 'downstream asks' }),
    )
    expect(decision).toEqual({ kind: 'ask', reason: 'downstream asks' })
  })

  it('preserves downstream denial decisions', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'workspace-write',
    } as never)
    applyApprovalGuard(ctx)

    const exec = mockExec('mcp__polyglot__routeros_list_menu', createStubAgent())
    const decision = await ctx.waterfall(
      'tools/pre-execute',
      exec,
      () => Promise.resolve<PreToolDecision>({ kind: 'deny', reason: 'circuit breaker open' }),
    )

    expect(decision).toEqual({ kind: 'deny', reason: 'circuit breaker open' })
  })
})
