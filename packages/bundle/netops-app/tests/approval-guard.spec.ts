import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolExecution, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import {
  isReadOnlyTool,
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

describe('isDangerFullAccess', () => {
  it('detects danger-full-access from permissionPresets service', () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: (_session: Session) => 'danger-full-access',
    } as never)

    const exec = mockExec('write', createStubAgent())
    expect(isDangerFullAccess(ctx, exec)).toBe(true)
  })

  it('detects workspace-write as NOT full access', () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: (_session: Session) => 'workspace-write',
    } as never)

    const exec = mockExec('write', createStubAgent())
    expect(isDangerFullAccess(ctx, exec)).toBe(false)
  })

  it('detects shell sandboxMode fallback', () => {
    const ctx = new Context()
    ctx.provide('shell', {
      sandboxMode: 'danger-full-access',
    } as never)

    const exec = mockExec('write')
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

  it('requires approval for mutating operations in workspace-write mode', async () => {
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

  it('allows mutating operations directly without asking in danger-full-access mode', async () => {
    const ctx = new Context()
    ctx.provide('permissionPresets', {
      current: () => 'danger-full-access',
    } as never)
    applyApprovalGuard(ctx)

    // routeros_run in full access
    const execRun = mockExec('mcp__polyglot__routeros_run', createStubAgent())
    const decisionRun = await ctx.waterfall(
      'tools/pre-execute',
      execRun,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionRun).toEqual({ kind: 'allow' })

    // write in full access
    const execWrite = mockExec('write', createStubAgent())
    const decisionWrite = await ctx.waterfall(
      'tools/pre-execute',
      execWrite,
      () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
    )
    expect(decisionWrite).toEqual({ kind: 'allow' })
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
