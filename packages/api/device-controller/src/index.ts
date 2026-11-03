/**
 * Host Remote owner for the network device inventory. One namespace,
 * `devices`, exposes the inventory the device picker and device workspace
 * creation read. The configured endpoint stays on the Host: browser callers
 * never receive its token or an upstream response body.
 * @module @deepseek-ai/dsh-api-device-controller
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { getDevice, InventoryUnavailableError, listDevices } from './inventory.ts'
import type { DeviceGetRequest, DeviceListView, DeviceView } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `devices` Remote namespace. */
    deviceController: DeviceController
  }
}

/** Deployment values for the inventory endpoint. */
export interface Config {
  /** Polyglot HTTP API base URL. Defaults to the local engine. */
  baseUrl?: string
  /** Bearer token sent to the inventory; never projected to the browser. */
  token?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
}

/** Validated inventory endpoint configuration. */
export const Config: z<Config> = z.object({
  baseUrl: z.string().default('http://127.0.0.1:8080'),
  token: z.string(),
  timeoutMs: z.natural().min(1).default(10_000),
})

type ResolvedConfig = Required<Pick<Config, 'baseUrl' | 'token' | 'timeoutMs'>>

/**
 * Resolve the configured base URL and reject values the inventory call cannot
 * use, so a typo fails at load instead of on the first picker open.
 * @param config - validated plugin configuration.
 * @returns the normalized endpoint values.
 * @throws {TypeError} when the base URL is not an absolute HTTP(S) URL.
 */
function resolveConfig(config: Config): ResolvedConfig {
  let url: URL
  try {
    url = new URL(config.baseUrl ?? 'http://127.0.0.1:8080')
  } catch (error: unknown) {
    throw new TypeError(`device-controller: baseUrl is not an absolute URL: ${String(error)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`device-controller: baseUrl must use http or https, got '${url.protocol}'`)
  }
  return {
    baseUrl: url.href.replace(/\/$/u, ''),
    token: config.token ?? '',
    timeoutMs: config.timeoutMs ?? 10_000,
  }
}

/** Host service backing the generated `ctx.remote.devices` namespace. */
export class DeviceController extends TypertRemoteService {
  private readonly resolved: ResolvedConfig

  /**
   * @param ctx - owning Cordis context.
   * @param config - inventory endpoint values.
   */
  constructor(ctx: Context, config: Config = Config({})) {
    super(ctx, 'deviceController', { namespace: 'devices' })
    this.resolved = resolveConfig(config)
  }

  /**
   * List every device the inventory currently returns.
   * @param signal - caller lifetime.
   * @returns detached device projections in inventory order.
   * @throws {RemoteError} `device/inventory-unavailable` when the endpoint fails.
   */
  @Remote('list')
  async list(signal: AbortSignal): Promise<DeviceListView> {
    signal.throwIfAborted()
    try {
      return { devices: await listDevices(this.inventory(), signal) }
    } catch (error: unknown) {
      throw this.failure(error)
    }
  }

  /**
   * Read one device by identity.
   * @param request - requested inventory identity.
   * @param signal - caller lifetime.
   * @returns the device projection.
   * @throws {RemoteError} `device/not-found` or `device/inventory-unavailable`.
   */
  @Remote('get')
  async get(request: DeviceGetRequest, signal: AbortSignal): Promise<DeviceView> {
    signal.throwIfAborted()
    try {
      const device = await getDevice(this.inventory(), request.deviceId, signal)
      if (device === undefined) {
        throw new RemoteError('device/not-found', `inventory holds no device '${request.deviceId}'`, {
          deviceId: request.deviceId,
        })
      }
      return device
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      throw this.failure(error)
    }
  }

  private inventory(): { baseUrl: string; token?: string; timeoutMs: number } {
    return {
      baseUrl: this.resolved.baseUrl,
      ...this.resolved.token === '' ? {} : { token: this.resolved.token },
      timeoutMs: this.resolved.timeoutMs,
    }
  }

  private failure(error: unknown): RemoteError {
    const reason = error instanceof InventoryUnavailableError
      ? error.reason
      : error instanceof Error ? error.message : String(error)
    return new RemoteError(
      'device/inventory-unavailable',
      `device inventory is unavailable: ${reason}`,
      { baseUrl: this.resolved.baseUrl, reason },
      { cause: error },
    )
  }
}

export default DeviceController
