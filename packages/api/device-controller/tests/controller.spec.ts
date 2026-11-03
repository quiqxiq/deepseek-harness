/** Device inventory Remote: mapping, bearer forwarding, and typed failures. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DeviceController from '../src/index.ts'

type Answer = { readonly status: number; readonly body: string }

let server: Server
let baseUrl: string
let answer: Answer
let authorization: string | undefined

beforeEach(async () => {
  authorization = undefined
  answer = { status: 200, body: JSON.stringify({ devices: [] }) }
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
    response.writeHead(answer.status, { 'content-type': 'application/json' })
    response.end(answer.body)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server did not bind a port')
  baseUrl = `http://127.0.0.1:${String(address.port)}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
})

function controller(token?: string): DeviceController {
  return new DeviceController(new Context(), {
    baseUrl,
    ...token === undefined ? {} : { token },
    timeoutMs: 1000,
  })
}

describe('DeviceController', () => {
  it('projects inventory rows and forwards the bearer token', async () => {
    answer = {
      status: 200,
      body: JSON.stringify({
        devices: [
          {
            id: 'dev-1',
            name: 'Router',
            vendor: 'MikroTik',
            driver_type: 'mikrotik',
            host: '10.0.0.1',
            port: 8728,
            ssh_port: 22,
            tags: ['core'],
            status: 'active',
          },
          {
            id: 'dev-2',
            name: 'Switch',
            vendor: 'Cisco',
            driver_type: 'generic_switch',
            host: '10.0.0.2',
            enabled: false,
          },
        ],
      }),
    }
    const result = await controller('secret').list(new AbortController().signal)
    expect(authorization).toBe('Bearer secret')
    expect(result.devices).toEqual([
      {
        id: 'dev-1',
        name: 'Router',
        vendor: 'MikroTik',
        driverType: 'mikrotik',
        host: '10.0.0.1',
        port: 8728,
        sshPort: 22,
        tags: ['core'],
        enabled: true,
      },
      {
        id: 'dev-2',
        name: 'Switch',
        vendor: 'Cisco',
        driverType: 'generic_switch',
        host: '10.0.0.2',
        tags: [],
        enabled: false,
      },
    ])
  })

  it('maps non-2xx and malformed bodies to one typed failure', async () => {
    answer = { status: 503, body: '{}' }
    await expect(controller().list(new AbortController().signal)).rejects.toMatchObject({
      code: 'device/inventory-unavailable',
      details: { baseUrl, reason: 'HTTP 503' },
    })

    answer = { status: 200, body: 'not-json' }
    await expect(controller().list(new AbortController().signal)).rejects.toMatchObject({
      code: 'device/inventory-unavailable',
    })

    answer = { status: 200, body: JSON.stringify({ devices: [{ id: 1 }] }) }
    await expect(controller().list(new AbortController().signal)).rejects.toMatchObject({
      code: 'device/inventory-unavailable',
      details: { reason: 'invalid device list response' },
    })
  })

  it('rejects an unknown device with device/not-found', async () => {
    answer = { status: 200, body: JSON.stringify({ devices: [] }) }
    await expect(controller().get({ deviceId: 'missing' }, new AbortController().signal)).rejects.toMatchObject({
      code: 'device/not-found',
      details: { deviceId: 'missing' },
    })
  })

  it('rejects an unreachable endpoint and a non-HTTP base URL', async () => {
    const unreachable = new DeviceController(new Context(), { baseUrl: 'http://127.0.0.1:1', timeoutMs: 200 })
    await expect(unreachable.list(new AbortController().signal)).rejects.toMatchObject({
      code: 'device/inventory-unavailable',
    })
    expect(() => new DeviceController(new Context(), { baseUrl: 'ws://127.0.0.1:1' })).toThrow('baseUrl must use http or https')
  })
})
