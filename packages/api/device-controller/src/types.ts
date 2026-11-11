/**
 * Browser-safe device inventory vocabulary and wire failures for the `devices`
 * Remote namespace. The Host owns the Polyglot HTTP call; the browser only sees
 * these detached projections.
 * @module @deepseek-ai/dsh-api-device-controller/src/types
 */

import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The configured inventory endpoint could not be reached or answered invalid JSON. */
    'device/inventory-unavailable': {
      /** Configured inventory base URL, with no credentials. */
      readonly baseUrl: string
      /** Short transport or decode reason. */
      readonly reason: string
    }
    /** The inventory answered successfully but holds no device with that identity. */
    'device/not-found': { readonly deviceId: string }
  }
}

/** Live management-endpoint reachability reported by inventory. */
export type DeviceConnectivity = 'online' | 'offline' | 'unknown'

/** One inventory device projected for browser consumers. */
export interface DeviceView {
  /** Inventory identity used by device workspaces and MCP tools. */
  readonly id: string
  /** Human-readable device name. */
  readonly name: string
  /** Vendor label reported by inventory. */
  readonly vendor: string
  /** Driver family, such as `mikrotik`. */
  readonly driverType: string
  /** Management host or address. */
  readonly host: string
  /** Management protocol port. */
  readonly port?: number
  /** SSH port used by the device console. */
  readonly sshPort?: number
  /** Free-form inventory tags. */
  readonly tags: readonly string[]
  /** Whether inventory currently enables the device. */
  readonly enabled: boolean
  /** Live reachability; absent when inventory did not report it. */
  readonly connectivity?: DeviceConnectivity
  /** Successful management-endpoint dial duration in milliseconds. */
  readonly latencyMs?: number
}

/** Complete inventory answer for one list call. */
export interface DeviceListView {
  readonly devices: readonly DeviceView[]
}

/** One device lookup request. */
export interface DeviceGetRequest {
  readonly deviceId: string
}
