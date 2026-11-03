/** Device console handle: buffering, transport failures, resize, abort, and termination. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceTerminalHandle, deviceTerminalUrl } from '../src/device-terminal.ts'

/** One controllable global WebSocket replacement. */
class MockWebSocket {
  static readonly instances: MockWebSocket[] = []
  static openOnConstruct = false

  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
    if (MockWebSocket.openOnConstruct) queueMicrotask(() => { this.open() })
  }

  send(frame: string): void {
    this.sent.push(frame)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
    this.onclose?.()
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  fail(): void {
    this.readyState = 3
    this.onerror?.()
    this.onclose?.()
  }

  emit(data: string): void {
    this.onmessage?.({ data })
  }
}

function installSocket(openOnConstruct = false): void {
  MockWebSocket.instances.length = 0
  MockWebSocket.openOnConstruct = openOnConstruct
  vi.stubGlobal('WebSocket', MockWebSocket)
}

type DeviceOptions = ConstructorParameters<typeof DeviceTerminalHandle>[0]

function options(overrides: Partial<DeviceOptions> = {}): DeviceOptions {
  return {
    deviceId: 'dev-01',
    wsBaseUrl: 'ws://polyglot:8080',
    cols: 80,
    rows: 24,
    connectTimeoutMs: 1000,
    signal: new AbortController().signal,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  MockWebSocket.instances.length = 0
  MockWebSocket.openOnConstruct = false
})

describe('deviceTerminalUrl', () => {
  it('carries the device path, dimensions, and optional token', () => {
    expect(deviceTerminalUrl({ deviceId: 'a/b', wsBaseUrl: 'ws://host:1/', cols: 100, rows: 30 }))
      .toBe('ws://host:1/ws/devices/a%2Fb/terminal?cols=100&rows=30')
    expect(deviceTerminalUrl({ deviceId: 'dev', wsBaseUrl: 'wss://host', token: 'secret', cols: 2, rows: 1 }))
      .toBe('wss://host/ws/devices/dev/terminal?cols=2&rows=1&token=secret')
  })
})

describe('DeviceTerminalHandle', () => {
  it('buffers input until the socket opens and flushes it in order', async () => {
    installSocket()
    const handle = new DeviceTerminalHandle(options())
    const socket = MockWebSocket.instances[0]
    if (socket === undefined) throw new Error('socket was not constructed')

    await handle.write('show version\r')
    expect(socket.sent).toEqual([])

    socket.open()
    await Promise.resolve()
    expect(socket.sent).toEqual([JSON.stringify({ device_id: 'dev-01', input_data: 'show version\r' })])

    await handle.write('show ip route\r')
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ device_id: 'dev-01', input_data: 'show ip route\r' }))

    await handle.terminate()
    await expect(handle.done).resolves.toEqual({ exitCode: 0, signal: null })
    expect(socket.closed).toBe(true)
  })

  it('forwards output and defers a pre-open resize', async () => {
    installSocket()
    const handle = new DeviceTerminalHandle(options())
    const socket = MockWebSocket.instances[0]
    if (socket === undefined) throw new Error('socket was not constructed')

    await handle.resize(120, 40)
    socket.open()
    expect(socket.sent).toEqual([JSON.stringify({ device_id: 'dev-01', cols: 120, rows: 40 })])

    const chunk = new Promise<string>((resolve) => {
      handle.output.once('data', (data: Buffer) => { resolve(data.toString('utf-8')) })
    })
    socket.emit('RouterOS 7.15\r\n')
    expect(await chunk).toBe('RouterOS 7.15\r\n')
    await handle.terminate()
  })

  it('rejects done when the socket closes before opening', async () => {
    installSocket()
    const handle = new DeviceTerminalHandle(options())
    const socket = MockWebSocket.instances[0]
    if (socket === undefined) throw new Error('socket was not constructed')

    socket.fail()
    await expect(handle.done).rejects.toThrow('device console transport failed')
  })

  it('closes the socket when the connect timeout fires', async () => {
    vi.useFakeTimers()
    installSocket()
    const handle = new DeviceTerminalHandle(options({ connectTimeoutMs: 50 }))
    const socket = MockWebSocket.instances[0]
    if (socket === undefined) throw new Error('socket was not constructed')

    // Attach the rejection expectation before the timer fires; advancing fake
    // timers flushes microtasks and would otherwise surface `done` as an
    // unhandled rejection in the same tick.
    const settled = expect(handle.done).rejects.toThrow('did not open within 50ms')
    await vi.advanceTimersByTimeAsync(51)
    await settled
    expect(socket.closed).toBe(true)
  })

  it('cancels the connect timeout once the socket opens', async () => {
    vi.useFakeTimers()
    installSocket()
    const handle = new DeviceTerminalHandle(options({ connectTimeoutMs: 50 }))
    const socket = MockWebSocket.instances[0]
    if (socket === undefined) throw new Error('socket was not constructed')

    socket.open()
    await vi.advanceTimersByTimeAsync(100)
    expect(socket.closed).toBe(false)
    await handle.terminate()
    await expect(handle.done).resolves.toEqual({ exitCode: 0, signal: null })
  })

  it('settles on abort and ignores later writes', async () => {
    installSocket()
    const controller = new AbortController()
    const handle = new DeviceTerminalHandle(options({ signal: controller.signal }))
    controller.abort()
    await expect(handle.done).resolves.toEqual({ exitCode: 0, signal: null })
    await handle.write('ignored')
    expect(MockWebSocket.instances[0]?.sent).toEqual([])
  })

  it('settles an already cancelled lifetime without constructing a socket', async () => {
    installSocket()
    const controller = new AbortController()
    controller.abort()
    const handle = new DeviceTerminalHandle(options({ signal: controller.signal }))
    await expect(handle.done).rejects.toThrow('cancelled before it opened')
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('surfaces an interrupt as ASCII control input', async () => {
    installSocket(true)
    const handle = new DeviceTerminalHandle(options())
    await Promise.resolve()
    await handle.signalForeground('SIGINT')
    expect(MockWebSocket.instances[0]?.sent.at(-1)).toBe(JSON.stringify({ device_id: 'dev-01', input_data: '\u0003' }))
    await handle.terminate()
  })
})
