---
description: "Device-first network-operations bundle over the web surface, its profile, environment, and model experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-netops-app

English | [中文](README.zh.md)

## Summary

The device-first network-operations bundle. It layers over `@deepseek-ai/dsh-web-app` and composes a chat surface for observing and operating network devices: a device picker instead of a directory picker, one Workspace per inventory device, device-scoped model context, and an SSH device console per Workspace.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `netops` profile selects it:

```sh
dsh netops
```

Connection facts come from the `POLYGLOT_*` environment variables or the row config:

| Variable | Purpose | Default |
|---|---|---|
| `POLYGLOT_API_URL` | Polyglot HTTP API base URL | `http://127.0.0.1:8080` |
| `POLYGLOT_WS_URL` | Device console WebSocket base URL | derived from the API URL |
| `POLYGLOT_API_TOKEN` | Inventory bearer token | none |
| `POLYGLOT_MCP_URL` | MCP endpoint | `<api>/mcp` |
| `POLYGLOT_MCP_TOKEN` | MCP bearer token | none |
| `POLYGLOT_WS_TOKEN` | Device console token | the MCP token |
| `NETOPS_MCP_URL` | Optional second, vendor-neutral MCP server | disabled |

The bundle mounts one agent preset, `standard` (Network Operations). It keeps web search, local files and shells, subagent/workflow, skill and plugin support, plan/todo/goal, and devices; it removes document preview, office conversion, jobs, schedule, deliverables, feedback, and developer inspector surfaces.

<a id="model-experience"></a>
## Model Experience

### Device context

#### What the model sees

When the Session's Workspace targets a device, `@deepseek-ai/dsh-device-context` appends a durable user-context message naming the device id, name, vendor, driver, management address, and SSH port, and tells the model to use that id for device tools. The message is injected on the first step of a turn, when the target changes, and after the refresh interval (10 minutes by default).

#### Token effect

One short context message per injection. A long conversation receives the snapshot again after the refresh interval, not on every step.

#### KV Cache effect

Injections append context after retained history; the stable system-prompt prefix is unchanged.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Device authorization is enforced by Polyglot, not this bundle.** The model receives the device id, but tenant and device access control must be enforced by the tool server.
- **One MCP namespace serves every device.** Tools are host-plane and take a `device_id`; a Session cannot mount a device-specific tool subset.
- **The device console protocol follows Polyglot's current WebSocket envelope** (`device_id`, `input_data`, `cols`, `rows`). A backend protocol change requires a matching update here.

<a id="dev-note"></a>
## Dev Note

None.
