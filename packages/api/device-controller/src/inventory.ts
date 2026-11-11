/**
 * Polyglot inventory HTTP client. The Host owns this call so the browser never
 * receives a bearer token, a non-loopback base URL, or an upstream error body.
 * @module @deepseek-ai/dsh-api-device-controller/src/inventory
 */

import { z } from 'zod'
import type { DeviceView } from './types.ts'

/** Inventory connection values resolved once from deployment config. */
export interface InventoryConfig {
  /** Base URL of the Polyglot HTTP API, such as `http://127.0.0.1:8080`. */
  readonly baseUrl: string
  /** Optional bearer token forwarded as `Authorization`. */
  readonly token?: string
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs: number
}

/** A failed inventory exchange, already reduced to a non-sensitive reason. */
export class InventoryUnavailableError extends Error {
  override readonly name = 'InventoryUnavailableError'

  /**
   * @param baseUrl - configured base URL, without credentials.
   * @param reason - short transport or decode reason safe for logs and the wire.
   */
  constructor(readonly baseUrl: string, readonly reason: string) {
    super(`device inventory at ${baseUrl} is unavailable: ${reason}`)
  }
}

const deviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  vendor: z.string().default(''),
  driver_type: z.string().default(''),
  host: z.string().default(''),
  port: z.number().int().optional(),
  ssh_port: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  status: z.string().optional(),
  connectivity: z.enum(['online', 'offline', 'unknown']).optional(),
  latency_ms: z.number().int().nonnegative().optional(),
})

const listSchema = z.object({ devices: z.array(deviceSchema) })

/**
 * Read the inventory's device list.
 * @param config - endpoint and timeout.
 * @param signal - caller lifetime.
 * @returns detached device projections in inventory order.
 * @throws {InventoryUnavailableError} when the endpoint cannot be reached, answers a non-2xx status, or sends an invalid body.
 */
export async function listDevices(config: InventoryConfig, signal: AbortSignal): Promise<DeviceView[]> {
  const body = await readJson(config, '/api/devices', signal)
  const parsed = listSchema.safeParse(body)
  if (!parsed.success) {
    throw new InventoryUnavailableError(config.baseUrl, 'invalid device list response')
  }
  return parsed.data.devices.map(toView)
}

/**
 * Read one device from an inventory listing.
 * @param config - endpoint and timeout.
 * @param deviceId - inventory identity.
 * @param signal - caller lifetime.
 * @returns the projection, or undefined when the inventory does not list it.
 * @throws {InventoryUnavailableError} when the endpoint cannot be reached or answers an invalid body.
 */
export async function getDevice(
  config: InventoryConfig,
  deviceId: string,
  signal: AbortSignal,
): Promise<DeviceView | undefined> {
  return (await listDevices(config, signal)).find(device => device.id === deviceId)
}

function toView(device: z.infer<typeof deviceSchema>): DeviceView {
  return {
    id: device.id,
    name: device.name,
    vendor: device.vendor,
    driverType: device.driver_type,
    host: device.host,
    ...(device.port === undefined ? {} : { port: device.port }),
    ...(device.ssh_port === undefined ? {} : { sshPort: device.ssh_port }),
    tags: device.tags ?? [],
    enabled: device.enabled ?? device.status === 'active',
    ...(device.connectivity === undefined ? {} : { connectivity: device.connectivity }),
    ...(device.latency_ms === undefined ? {} : { latencyMs: device.latency_ms }),
  }
}

async function readJson(config: InventoryConfig, path: string, signal: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(config.timeoutMs)
  let response: Response
  try {
    response = await fetch(new URL(path, config.baseUrl), {
      headers: {
        accept: 'application/json',
        ...config.token === undefined ? {} : { authorization: `Bearer ${config.token}` },
      },
      signal: AbortSignal.any([signal, timeout]),
    })
  } catch (error: unknown) {
    throw new InventoryUnavailableError(config.baseUrl, error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw new InventoryUnavailableError(config.baseUrl, `HTTP ${String(response.status)}`)
  }
  try {
    return await response.json()
  } catch (error: unknown) {
    throw new InventoryUnavailableError(config.baseUrl, error instanceof Error ? error.message : String(error))
  }
}
