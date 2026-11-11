---
description: "Device-first network-operations bundle over the web surface, its profile, environment, and model experience."
kind: "package-bundle"
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

The device picker shows two independent facts per device: the inventory's active or disabled flag, and a live online, offline, or unknown connectivity probe of the management port. Online devices also show the dial latency.

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

The bundle mounts one agent preset, `standard` (Network Operations). It keeps web search, sandboxed local files, subagent/workflow, skill and plugin support, plan/todo/goal, and devices; it removes document preview, office conversion, jobs, schedule, deliverables, feedback, and developer inspector surfaces.

Host shell execution is closed by default. Workspace file access uses the sandboxed filesystem: `read`, `write`, and `edit` are available, and the `workspace-write` sandbox confines mutations to the workspace root; `apply_patch` is not registered. `bash` and `pwsh` stay registered so an administrator can open one bounded emergency window through the `netops-policy` switch (`allowHostShellEmergency`, 300 seconds by default); the guard denies both tools until that window is active, and expiry closes it without a restart. The switch is volatile and is not rewritten when the window expires. The explicit `danger-full-access` preset selects the unconfined sandbox; `workspace-write` and `device-full-access` keep file mutations inside the workspace.

### Customer-service preset

`netops-cs.patch.yml` is a `--patch` overlay for `dsh --profile headless`; the Polyglot WhatsApp gateway runs it for customer messages:

```sh
dsh --profile headless --patch node_modules/@deepseek-ai/dsh-netops-app/netops-cs.patch.yml --json -
```

The overlay removes shell, filesystem, web, delegation, and coding tools, sets the sandbox to `read-only`, and mounts only the read-only Polyglot MCP client plus an allowlist guard. Set `POLYGLOT_MCP_URL` and `POLYGLOT_MCP_READ_TOKEN`; the token hides mutation tools at the server, and the guard denies any tool outside the fixed read-only catalog. The gateway owns the WhatsApp socket and passes the customer's message on stdin.

<a id="model-experience"></a>
## Model Experience

### Device context

#### What the model sees

When the Session's Workspace targets a device, `@deepseek-ai/dsh-device-context` appends a durable user-context message naming the device id, name, vendor, driver, management address, and SSH port, and tells the model to use that id for device tools. The message is injected on the first step of a turn, when the target changes, and after the refresh interval (10 minutes by default).

#### Token effect

One short context message per injection. A long conversation receives the snapshot again after the refresh interval, not on every step.

#### KV Cache effect

Injections append context after retained history; the stable system-prompt prefix is unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Device authorization is enforced by Polyglot, not this bundle.** The model receives the device id, but tenant and device access control must be enforced by the tool server.
- **One MCP namespace serves every device.** Tools are host-plane and take a `device_id`; a Session cannot mount a device-specific tool subset.
- **The device console protocol follows Polyglot's current WebSocket envelope** (`device_id`, `input_data`, `cols`, `rows`). A backend protocol change requires a matching update here.
- **The emergency host-shell window is process-local.** Restarting the harness closes it. A switch left `true` in the profile opens a fresh window at activation, bounded by the configured TTL.
- **The CS allowlist is fixed to the current Polyglot read-only MCP tool names.** Adding or renaming a read-only tool requires updating `read-only-guard.ts`; an unknown name is denied.
- **The CS overlay is resolved from the harness installation.** The gateway must pass the installed `netops-cs.patch.yml` path, and the `@deepseek-ai/dsh-netops-app` package must be resolvable by the `dsh` process.

<a id="dev-note"></a>
### Dev Note

None.
