/**
 * Terminal handle that bridges a browser terminal to Polyglot's device SSH
 * PTY WebSocket. Input is buffered until the socket opens, transport failures
 * reject `done` so the terminal becomes `failed` instead of silently exiting,
 * and every settlement path releases the abort listener and connect timer.
 * @module @deepseek-ai/dsh-api-terminal-controller/src/device-terminal
 */

import { PassThrough } from 'node:stream'
import type {
  SubprocessOutcome,
  SubprocessTerminalActivity,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
} from '@deepseek-ai/dsh-subprocess'

/** Synthetic process identity: a device PTY has no local OS process. */
const DEVICE_TERMINAL_PID = -1

/** Upper bound on input buffered before the socket opens. */
const MAX_PENDING_INPUT_BYTES = 64 * 1024

/** Deployment values for one device console connection. */
export interface DeviceTerminalOptions {
  /** Inventory device identity. */
  readonly deviceId: string
  /** WebSocket base URL, such as `ws://127.0.0.1:8080`. */
  readonly wsBaseUrl: string
  /** Optional bearer token appended as a query parameter for forward compatibility. */
  readonly token?: string
  /** Initial terminal width. */
  readonly cols: number
  /** Initial terminal height. */
  readonly rows: number
  /** Maximum time to wait for the socket to open. */
  readonly connectTimeoutMs: number
  /** Lifetime cancellation. */
  readonly signal: AbortSignal
}

/**
 * Build the device terminal URL.
 * @param options - device identity and endpoint values.
 * @returns the absolute WebSocket URL.
 */
export function deviceTerminalUrl(options: Pick<DeviceTerminalOptions, 'deviceId' | 'wsBaseUrl' | 'token' | 'cols' | 'rows'>): string {
  const query = new URLSearchParams({ cols: String(options.cols), rows: String(options.rows) })
  if (options.token !== undefined && options.token !== '') query.set('token', options.token)
  return `${options.wsBaseUrl.replace(/\/$/u, '')}/ws/devices/${encodeURIComponent(options.deviceId)}/terminal?${query.toString()}`
}

/** A device PTY exposed through the subprocess terminal handle contract. */
export class DeviceTerminalHandle implements SubprocessTerminalHandle {
  /** Synthetic identity; device terminals have no local process. */
  readonly pid = DEVICE_TERMINAL_PID
  /** Raw UTF-8 device output in delivery order. */
  readonly output = new PassThrough()
  /** Resolves on a normal close and rejects on a connection or transport failure. */
  readonly done: Promise<SubprocessOutcome>

  private readonly settle: { resolve: (outcome: SubprocessOutcome) => void; reject: (error: Error) => void }
  private readonly pending: string[] = []
  private pendingBytes = 0
  private pendingCols: number
  private pendingRows: number
  private socket: WebSocket | undefined
  private opened = false
  private settled = false
  private terminated = false
  private revision = 0
  private failure: string | undefined
  private readonly timer: ReturnType<typeof setTimeout>
  private readonly abort: () => void

  /** @param options - device identity, endpoint, dimensions, and lifetime. */
  constructor(private readonly options: DeviceTerminalOptions) {
    this.pendingCols = options.cols
    this.pendingRows = options.rows
    const { promise, resolve, reject } = Promise.withResolvers<SubprocessOutcome>()
    this.done = promise
    this.settle = { resolve, reject }

    this.timer = setTimeout(() => {
      this.fail(new Error(`device console did not open within ${String(options.connectTimeoutMs)}ms`))
    }, options.connectTimeoutMs)

    this.abort = () => {
      void this.terminate()
    }

    if (options.signal.aborted) {
      this.fail(new Error('device console was cancelled before it opened'))
      return
    }
    options.signal.addEventListener('abort', this.abort, { once: true })

    try {
      this.socket = new WebSocket(deviceTerminalUrl(options))
    } catch (error: unknown) {
      this.fail(new Error(`device console could not start: ${error instanceof Error ? error.message : String(error)}`))
      return
    }
    this.socket.onopen = () => {
      this.opened = true
      clearTimeout(this.timer)
      this.revision++
      this.flush()
    }
    this.socket.onmessage = (event: MessageEvent) => {
      this.revision++
      if (typeof event.data === 'string') this.output.write(Buffer.from(event.data, 'utf-8'))
      else if (event.data instanceof ArrayBuffer) this.output.write(Buffer.from(event.data))
    }
    this.socket.onerror = () => {
      // A transport error is followed by close, which carries the settlement.
      this.failure ??= 'device console transport failed'
    }
    this.socket.onclose = () => {
      this.revision++
      if (this.terminated || this.settled) return
      if (this.opened) this.complete(0)
      else this.fail(new Error(this.failure ?? 'device console closed before it opened'))
    }
  }

  /**
   * Deliver input to the device PTY, buffering until the socket opens.
   * @param data - text to deliver without newline conversion.
   * @returns resolution after the frame is queued or sent.
   * @throws when the connection already failed or the pre-open buffer is full.
   */
  write(data: string): Promise<void> {
    if (this.terminated || this.settled) return Promise.resolve()
    if (this.opened) {
      this.send({ device_id: this.options.deviceId, input_data: data })
      return Promise.resolve()
    }
    const bytes = Buffer.byteLength(data, 'utf-8')
    if (this.pendingBytes + bytes > MAX_PENDING_INPUT_BYTES) {
      return Promise.reject(new Error('device console input exceeded the pre-connection buffer'))
    }
    this.pending.push(data)
    this.pendingBytes += bytes
    return Promise.resolve()
  }

  /**
   * Update the terminal dimensions, deferring the frame until the socket opens.
   * @param cols - column count.
   * @param rows - row count.
   * @returns resolution after the frame is queued or sent.
   */
  resize(cols: number, rows: number): Promise<void> {
    if (this.terminated || this.settled) return Promise.resolve()
    this.pendingCols = cols
    this.pendingRows = rows
    if (this.opened) {
      this.send({ device_id: this.options.deviceId, cols, rows })
    }
    return Promise.resolve()
  }

  /**
   * Device terminals have no local foreground process group.
   * @returns undefined.
   */
  inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    return Promise.resolve(undefined)
  }

  /**
   * Observe activity from the last delivered output.
   * @returns the current idle observation with the delivery revision.
   */
  inspectActivity(): Promise<SubprocessTerminalActivity> {
    return Promise.resolve({ state: 'idle', revision: this.revision })
  }

  /**
   * Deliver an interrupt to the device PTY.
   * @param signal - permitted terminal signal.
   * @returns the synthetic terminal identity.
   */
  async signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    if (signal === 'SIGINT') await this.write('\x03')
    return this.pid
  }

  /**
   * Close the socket and release every timer and listener.
   * @returns resolution after settlement; idempotent.
   */
  terminate(): Promise<void> {
    if (this.terminated) return Promise.resolve()
    this.terminated = true
    this.options.signal.removeEventListener('abort', this.abort)
    clearTimeout(this.timer)
    if (this.socket !== undefined) {
      try {
        this.socket.close()
      } catch {
        // The close call failed; settlement below still releases the terminal.
      }
      this.socket = undefined
    }
    this.complete(0)
    return Promise.resolve()
  }

  private send(frame: Record<string, unknown>): void {
    const socket = this.socket
    if (socket === undefined || socket.readyState !== 1 /* WebSocket.OPEN */) return
    socket.send(JSON.stringify(frame))
    this.revision++
  }

  private flush(): void {
    if (this.pendingCols !== this.options.cols || this.pendingRows !== this.options.rows) {
      this.send({ device_id: this.options.deviceId, cols: this.pendingCols, rows: this.pendingRows })
    }
    for (const data of this.pending.splice(0)) {
      this.send({ device_id: this.options.deviceId, input_data: data })
    }
    this.pendingBytes = 0
  }

  private fail(error: Error): void {
    if (this.settled) return
    this.failure = error.message
    this.output.write(Buffer.from(`\r\n\x1b[31m[Device Console] ${error.message}\x1b[0m\r\n`, 'utf-8'))
    this.settle.reject(error)
    this.finish()
  }

  private complete(exitCode: number): void {
    if (this.settled) return
    this.settle.resolve({ exitCode, signal: null })
    this.finish()
  }

  private finish(): void {
    this.settled = true
    clearTimeout(this.timer)
    this.options.signal.removeEventListener('abort', this.abort)
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      try {
        socket.close()
      } catch {
        // A failed close still leaves the handle settled.
      }
    }
    this.output.end()
  }
}
