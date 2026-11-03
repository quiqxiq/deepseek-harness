/** NetOps bundle connection-fact resolution. */
import { describe, expect, it } from 'vitest'
import { resolveEnvironment } from '../src/index.ts'

describe('resolveEnvironment', () => {
  it('derives WebSocket and MCP endpoints from the API URL', () => {
    expect(resolveEnvironment({}, {})).toEqual({
      apiBaseUrl: 'http://127.0.0.1:8080',
      wsBaseUrl: 'ws://127.0.0.1:8080',
      mcpUrl: 'http://127.0.0.1:8080/mcp',
    })
  })

  it('prefers explicit config over the environment and carries tokens once', () => {
    expect(resolveEnvironment(
      { apiBaseUrl: 'https://polyglot.internal/', mcpToken: 'mcp-secret' },
      { POLYGLOT_API_URL: 'http://ignored:1', POLYGLOT_API_TOKEN: 'api-secret' },
    )).toEqual({
      apiBaseUrl: 'https://polyglot.internal',
      wsBaseUrl: 'wss://polyglot.internal',
      mcpUrl: 'https://polyglot.internal/mcp',
      apiToken: 'api-secret',
      mcpToken: 'mcp-secret',
      wsToken: 'mcp-secret',
    })
  })

  it('rejects a protocol mismatch at load', () => {
    expect(() => resolveEnvironment({}, { POLYGLOT_WS_URL: 'http://127.0.0.1:8080' }))
      .toThrow('wsBaseUrl must use ws: or wss:')
  })
})
