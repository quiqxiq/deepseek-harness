import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolExecution, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import {
  isReadOnlyTool,
  isSystemTool,
  isDeviceTool,
  isDeviceFullAccess,
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

describe('tool classifications', () => {
  it('correctly classifies host system tools', () => {
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

describe('applyApprovalGuard', () => {
  it('allows read operations without asking in workspace-write mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'workspace-write',
    } as never)
    applyApprovalGuard(ctx)

    const exec = mockExec('mcp__polyglot__routeros_list_menu', createStubAgent())
    const decision = await ctx.waterfall(
      'tools/pre-execute',
      exec,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )

    expect(decision).toEqual({ kind: 'allow' })
  })

  it('requires approval for both device and host mutating operations in workspace-write mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'workspace-write',
    } as never)
    applyApprovalGuard(ctx)

    // routeros_run
    const execRun = mockExec('mcp__polyglot__routeros_run', createStubAgent())
    const decisionRun = await ctx.waterfall(
      'tools/pre-execute',
      execRun,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionRun.kind).toBe('ask')

    // write
    const execWrite = mockExec('write', createStubAgent())
    const decisionWrite = await ctx.waterfall(
      'tools/pre-execute',
      execWrite,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionWrite.kind).toBe('ask')

    // bash
    const execBash = mockExec('bash', createStubAgent())
    const decisionBash = await ctx.waterfall(
      'tools/pre-execute',
      execBash,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionBash.kind).toBe('ask')
  })

  it('allows device mutating operations directly while keeping host operations protected in device-full-access mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'device-full-access',
    } as never)
    applyApprovalGuard(ctx)

    // routeros_run in device-full-access: auto-allowed without asking!
    const execRun = mockExec('mcp__polyglot__routeros_run', createStubAgent())
    const decisionRun = await ctx.waterfall(
      'tools/pre-execute',
      execRun,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionRun).toEqual({ kind: 'allow' })

    // olt_register_onu in device-full-access: auto-allowed without asking!
    const execOlt = mockExec('mcp__polyglot__olt_register_onu', createStubAgent())
    const decisionOlt = await ctx.waterfall(
      'tools/pre-execute',
      execOlt,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionOlt).toEqual({ kind: 'allow' })

    // write in device-full-access: MUST STILL ASK (host is protected!)
    const execWrite = mockExec('write', createStubAgent())
    const decisionWrite = await ctx.waterfall(
      'tools/pre-execute',
      execWrite,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionWrite.kind).toBe('ask')

    // bash in device-full-access: MUST STILL ASK (host is protected!)
    const execBash = mockExec('bash', createStubAgent())
    const decisionBash = await ctx.waterfall(
      'tools/pre-execute',
      execBash,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionBash.kind).toBe('ask')
  })

  it('allows host operations only when DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL is set', async () => {
    const origEnv = process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL
    try {
      process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL = 'true'
      const ctx = new Context()
      ctx.provide('permissionPresets', {
        current: () => 'device-full-access',
      } as never)
      applyApprovalGuard(ctx)

      const execWrite = mockExec('write', createStubAgent())
      const decisionWrite = await ctx.waterfall(
        'tools/pre-execute',
        execWrite,
        () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
      )
      expect(decisionWrite).toEqual({ kind: 'allow' })
    } finally {
      process.env.DSH_ALLOW_HOST_MUTATION_WITHOUT_APPROVAL = origEnv
    }
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
