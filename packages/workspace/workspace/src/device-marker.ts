/**
 * On-disk device marker kept beside a device workspace's artifact directory.
 * The workspace record's `target` is authoritative; this file lets external
 * tooling and the terminal fallback recover the device identity when only a
 * directory is available.
 * @module @deepseek-ai/dsh-workspace/src/device-marker
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

/** Marker filename inside a device workspace directory. */
export const DEVICE_MARKER_FILENAME = 'device.json'

const deviceMarker = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  deviceUri: z.string().optional(),
  vendor: z.string().optional(),
  driverType: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  sshPort: z.number().int().optional(),
  workspaceId: z.string().optional(),
  updatedAt: z.string().optional(),
})

/** Parsed on-disk device marker. */
export type DeviceMarker = z.infer<typeof deviceMarker>

/**
 * Read the marker from one workspace directory.
 * @param directory - workspace artifact directory.
 * @returns the parsed marker, or undefined when the file does not exist.
 * @throws when the file exists but cannot be read or parsed; callers decide whether that is fatal.
 */
export async function readDeviceMarker(directory: string): Promise<DeviceMarker | undefined> {
  let raw: string
  try {
    raw = await readFile(join(directory, DEVICE_MARKER_FILENAME), 'utf-8')
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
  return deviceMarker.parse(JSON.parse(raw))
}

/**
 * Write the marker atomically beside the workspace artifacts.
 * @param directory - existing workspace artifact directory.
 * @param marker - device identity and display facts.
 * @returns resolution after the rename publishes the file.
 */
export async function writeDeviceMarker(directory: string, marker: DeviceMarker): Promise<void> {
  const target = join(directory, DEVICE_MARKER_FILENAME)
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, 'utf-8')
  await rename(temporary, target)
}
