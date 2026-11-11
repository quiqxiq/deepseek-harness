---
description: "Host Remote owner for the network device inventory behind the device picker and device workspaces."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-device-controller

English | [中文](README.zh.md)

## Summary

Host owner of the `devices` Remote namespace. It reads the configured Polyglot inventory HTTP endpoint and projects detached device records to the browser, so the device picker and device Workspace creation never hold the endpoint token or an upstream response body.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside the Workspace controller; the netops profile does this by default.

```yaml
- id: device-controller
  name: '@deepseek-ai/dsh-api-device-controller'
  config:
    baseUrl: http://127.0.0.1:8080
    timeoutMs: 10000
```

`baseUrl` defaults to the local engine. `token` is sent as a bearer token and never projected. The `devices/list` call answers `{ devices }`; `devices/get` answers one device or `device/not-found`. Each device carries the inventory's `enabled` and `status` facts plus a live `connectivity` probe (`online`, `offline`, or `unknown` for a disabled device) and `latency_ms` when online. A transport, status, or decode failure maps to `device/inventory-unavailable` with the base URL and a short reason.

<a id="model-experience"></a>
## Model Experience

None, as the Host Remote projects inventory records to the browser and registers no prompt, tool schema, or Session event.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Inventory is read-only and uncached.** Every picker open and Workspace adoption performs one HTTP call.
- **Connectivity is a TCP dial to the management port, not a protocol handshake.** A device that accepts the socket but rejects the protocol still reports online; use the device-status tool for protocol-level liveness.

<a id="dev-note"></a>
### Dev Note

None.
