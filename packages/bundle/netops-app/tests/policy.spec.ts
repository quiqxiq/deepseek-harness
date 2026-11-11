import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, type Config } from '../src/policy.ts'

function createConfig(enabled: () => boolean, ttlSeconds = 60): Config {
  return {
    allowHostShellEmergency: { get: enabled },
    hostShellEmergencyTtlSeconds: ttlSeconds,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('netops policy', () => {
  it('keeps the host shell closed by default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const ctx = new Context()
    apply(ctx, createConfig(() => false))

    expect(ctx.netopsPolicy.allowsHostShell()).toBe(false)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(0)
  })

  it('opens a bounded window on a false-to-true transition and expires it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const ctx = new Context()
    let enabled = false
    apply(ctx, createConfig(() => enabled))

    enabled = true
    ctx.emit('loader/volatile-update', [['allowHostShellEmergency']])
    expect(ctx.netopsPolicy.allowsHostShell()).toBe(true)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(60)

    vi.advanceTimersByTime(59_000)
    expect(ctx.netopsPolicy.allowsHostShell()).toBe(true)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(1)

    vi.advanceTimersByTime(1_000)
    expect(ctx.netopsPolicy.allowsHostShell()).toBe(false)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(0)
  })

  it('closes the window when the switch turns off and opens a fresh one when it returns', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const ctx = new Context()
    let enabled = false
    apply(ctx, createConfig(() => enabled))

    enabled = true
    ctx.emit('loader/volatile-update', [['allowHostShellEmergency']])
    vi.advanceTimersByTime(10_000)
    enabled = false
    ctx.emit('loader/volatile-update', [['allowHostShellEmergency']])
    expect(ctx.netopsPolicy.allowsHostShell()).toBe(false)

    enabled = true
    ctx.emit('loader/volatile-update', [['allowHostShellEmergency']])
    expect(ctx.netopsPolicy.allowsHostShell()).toBe(true)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(60)
  })

  it('opens a window when the switch is already on at activation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const ctx = new Context()
    apply(ctx, createConfig(() => true))

    expect(ctx.netopsPolicy.allowsHostShell()).toBe(true)
    expect(ctx.netopsPolicy.hostShellRemainingSeconds()).toBe(60)
  })
})
