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

`baseUrl` defaults to the local engine. `token` is sent as a bearer token and never projected. The `devices/list` call answers `{ devices }`; `devices/get` answers one device or `device/not-found`. A transport, status, or decode failure maps to `device/inventory-unavailable` with the base URL and a short reason.

<a id="model-experience"></a>
## Model Experience

This package contributes no model-visible input; it backs the picker and Workspace creation.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Inventory is read-only and uncached.** Every picker open and Workspace adoption performs one HTTP call.
- **Reachability is not probed.** `enabled` is the inventory's enabled flag, not a live device check; use the device-status tool for liveness.

<a id="dev-note"></a>
<a id="dev-note"></a>
## Dev Note

None.
