---
description: "Durable network-device context for Sessions in device Workspaces, including its model-visible snapshot."
kind: "package-reference"
---

# @deepseek-ai/dsh-device-context

English | [中文](README.zh.md)

## Summary

Durable network-device context for Sessions whose Workspace targets an inventory device. When a Session runs in a device Workspace, the plugin appends a model-visible user-context message naming the device id, name, vendor, driver, management address, and SSH port. The message is appended on the first step of a turn, when the target changes, and after the refresh interval, so replay reconstructs exactly what the model saw.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add the row to the agent preset that should receive device context:

```yaml
- id: device-context
  name: '@deepseek-ai/dsh-device-context'
  config:
    refreshIntervalMs: 600000
```

`refreshIntervalMs` defaults to ten minutes; `0` injects on the first step of every turn.

<a id="model-experience"></a>
## Model Experience

### Device snapshot

#### What the model sees

`Current network device — device_id: …; name: …; vendor: …; driver: …; management: …; ssh_port: ….` plus the instruction to use that id for device tools, prefer read-only discovery, and state impact and rollback before a disruptive change. Absent facts are omitted.

#### Token effect

One short context message per injection; not repeated on every step.

#### KV Cache effect

The injection appends context after retained history; the stable system-prompt prefix is unchanged.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Directory changes are not followed.** The plugin resolves the Session header's original project directory, so a device Workspace that changes its working directory keeps the target from the original path.
- **The device record is a snapshot.** Renaming or re-addressing a device in inventory updates the Workspace on the next adoption; an existing Session keeps the injected snapshot until the target changes or the refresh interval elapses.

<a id="dev-note"></a>
## Dev Note

None.
