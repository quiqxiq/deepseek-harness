---
description: "设备工作区会话的持久化网络设备上下文，包括其模型可见快照。"
kind: "package-reference"
---

# @deepseek-ai/dsh-device-context

[English](README.md) | 中文

## 概述

为工作区指向设备清单中某个设备的会话提供持久化的网络设备上下文。当会话运行在设备工作区时，本插件会追加一条模型可见的用户上下文消息，说明设备 ID、名称、厂商、驱动、管理地址与 SSH 端口。消息在每轮第一步、目标变化时以及刷新间隔后追加，因此重放能精确重建模型看到的内容。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将配置行加入需要设备上下文的 agent preset：

```yaml
- id: device-context
  name: '@deepseek-ai/dsh-device-context'
  config:
    refreshIntervalMs: 600000
```

`refreshIntervalMs` 默认十分钟；`0` 表示每轮第一步都注入。

<a id="model-experience"></a>
## 模型体验

### 设备快照

#### 模型看到什么

`Current network device — device_id: …; name: …; vendor: …; driver: …; management: …; ssh_port: ….`，并附带指示：使用该 ID 调用设备工具，优先只读探测，并在破坏性变更前说明影响与回滚。缺失的字段会被省略。

#### Token 影响

每次注入一条简短上下文消息；不会在每个步骤重复。

#### KV Cache 影响

注入内容追加在保留历史之后；稳定的系统提示词前缀不变。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **不跟随目录切换。** 插件解析会话头中的原始项目目录，因此切换工作目录的设备工作区仍使用原路径对应的目标。
- **设备记录是快照。** 在清单中重命名或更改地址会在下次采纳设备时更新工作区；已有会话保留已注入的快照，直到目标变化或刷新间隔到期。

<a id="dev-note"></a>
### 开发备注

无。
