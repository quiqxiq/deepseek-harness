import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolExecution, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import { apply, isAllowedTool } from '../src/read-only-guard.ts'

function mockExec(name: string): ToolExecution {
  const callId = ToolCallId(`call-${name}`)
  return {
    callId,
    rootCallId: callId,
    token: Symbol('token') as ToolExecutionToken,
    name,
    arguments: {},
    signal: new AbortController().signal,
  }
}

async function decide(ctx: Context, name: string, downstream: PreToolDecision = { kind: 'allow' }): Promise<PreToolDecision> {
  const exec = mockExec(name)
  return ctx.waterfall(
    'tools/pre-execute',
    exec,
    () => Promise.resolve(downstream),
  )
}

describe('isAllowedTool', () => {
  it('allows only the fixed read-only MCP catalog', () => {
    expect(isAllowedTool('mcp__polyglot__customer_lookup')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__get_device_status')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__list_devices')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__mikhmon_get_dashboard')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__routeros_list_menu')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__routeros_describe_command')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__routeros_suggest')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__routeros_validate')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__ont_get_status')).toBe(true)
    expect(isAllowedTool('mcp__polyglot__ont_list')).toBe(true)

    expect(isAllowedTool('mcp__polyglot__routeros_run')).toBe(false)
    expect(isAllowedTool('mcp__polyglot__customer_create')).toBe(false)
    expect(isAllowedTool('mcp__polyglot__ont_delete')).toBe(false)
    expect(isAllowedTool('read')).toBe(false)
    expect(isAllowedTool('write')).toBe(false)
    expect(isAllowedTool('bash')).toBe(false)
  })
})

describe('read-only guard', () => {
  it('allows a read-only MCP tool', async () => {
    const ctx = new Context()
    apply(ctx)

    expect(await decide(ctx, 'mcp__polyglot__ont_get_status')).toEqual({ kind: 'allow' })
  })

  it('denies every tool outside the catalog', async () => {
    const ctx = new Context()
    apply(ctx)

    for (const name of ['read', 'write', 'bash', 'mcp__polyglot__routeros_run', 'mcp__polyglot__customer_create']) {
      const decision = await decide(ctx, name)
      expect(decision.kind).toBe('deny')
    }
  })

  it('overrides a downstream ask for a tool outside the catalog', async () => {
    const ctx = new Context()
    apply(ctx)

    const decision = await decide(ctx, 'mcp__polyglot__routeros_run', { kind: 'ask', reason: 'downstream asks' })
    expect(decision.kind).toBe('deny')
  })

  it('preserves a downstream denial', async () => {
    const ctx = new Context()
    apply(ctx)

    const decision = await decide(
      ctx,
      'mcp__polyglot__ont_get_status',
      { kind: 'deny', reason: 'circuit breaker open' },
    )
    expect(decision).toEqual({ kind: 'deny', reason: 'circuit breaker open' })
  })

  it('preserves a downstream cancellation', async () => {
    const ctx = new Context()
    apply(ctx)

    expect(await decide(ctx, 'mcp__polyglot__ont_get_status', { kind: 'cancel' })).toEqual({ kind: 'cancel' })
  })
})
