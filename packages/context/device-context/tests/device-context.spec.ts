/** Device context: rendering and durable pre-step injection. */
import { describe, expect, it, vi } from 'vitest'
import { apply, renderDeviceContext } from '../src/index.ts'
import type { WorkspaceTarget } from '@deepseek-ai/dsh-workspace'

const target: WorkspaceTarget = {
  kind: 'device',
  deviceId: 'dev-1',
  name: 'Router-Core',
  vendor: 'MikroTik',
  driverType: 'mikrotik',
  host: '10.0.0.1',
  port: 8728,
  sshPort: 22,
}

type Handler = (
  payload: { agent: unknown; step: number; signal: AbortSignal },
  next: () => Promise<unknown>,
) => Promise<{ kind: string; messages?: unknown[] }>

async function harness(
  state: { deviceId: string | null; injectedAt: number | null },
  resolved: WorkspaceTarget | undefined,
) {
  let handler: Handler | undefined
  const register = vi.fn(async () => ({ stateOf: () => state }))
  const ctx = {
    logger: { warn: vi.fn() },
    fiber: { assertActive: vi.fn() },
    get: (name: string) => name === 'workspaceRegistry' ? {
      resolveByPath: async () => resolved === undefined ? undefined : { target: resolved },
    } : undefined,
    sessionProjections: { register },
    on: (_name: string, listener: Handler) => { handler = listener; return () => {} },
  }
  await apply(ctx as never, {})
  return { handler, register, ctx }
}

describe('device context', () => {
  it('renders only the facts inventory supplied', () => {
    expect(renderDeviceContext(target)).toContain('device_id: dev-1')
    expect(renderDeviceContext(target)).toContain('management: 10.0.0.1:8728')
    expect(renderDeviceContext(target)).toContain('ssh_port: 22')
    expect(renderDeviceContext({ kind: 'device', deviceId: 'dev-2', name: 'Bare' }))
      .toBe('Current network device — device_id: dev-2; name: Bare.\n'
        + 'Use this device_id for device inventory and MCP tools unless the user names another device. '
        + 'Prefer read-only discovery, quote the evidence you used, and state the target, expected impact, '
        + 'and rollback before asking to perform a disruptive change.')
  })

  it('injects a durable snapshot when the target changes and stays quiet on a later step', async () => {
    const state: { deviceId: string | null; injectedAt: number | null } = { deviceId: null, injectedAt: null }
    const { handler, register } = await harness(state, target)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ key: 'deviceContext' }))

    const decision = { kind: 'enter' as const, messages: [] }
    const result = await handler!({
      agent: { session: { header: { cwd: '/dsh/devices/dev-1' } } },
      step: 1,
      signal: new AbortController().signal,
    }, async () => decision)
    expect(result.kind).toBe('enter')
    expect(result.messages).toHaveLength(1)
    expect(result.messages?.[0]).toMatchObject({
      source: { kind: 'device-context', deviceId: 'dev-1' },
    })
    expect(JSON.stringify(result.messages?.[0])).toContain('device_id: dev-1')

    state.deviceId = 'dev-1'
    state.injectedAt = Date.now()
    const quiet = await handler!({
      agent: { session: { header: { cwd: '/dsh/devices/dev-1' } } },
      step: 2,
      signal: new AbortController().signal,
    }, async () => decision)
    expect(quiet).toBe(decision)
  })

  it('leaves a plain directory workspace unchanged', async () => {
    const { handler } = await harness({ deviceId: null, injectedAt: null }, undefined)
    const decision = { kind: 'enter' as const, messages: [] }
    const result = await handler!({
      agent: { session: { header: { cwd: '/tmp/project' } } },
      step: 1,
      signal: new AbortController().signal,
    }, async () => decision)
    expect(result).toBe(decision)
  })
})
