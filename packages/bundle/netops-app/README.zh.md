---
description: "基于 Web 表面的设备优先网络运维组合包、其 profile、环境变量与模型体验。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-netops-app

[English](README.md) | 中文

## 概述

设备优先的网络运维组合包。它叠加在 `@deepseek-ai/dsh-web-app` 之上，为观察和操作网络设备组合出聊天界面：用设备选择器替代目录选择器，每个清单设备对应一个工作区，模型获得设备范围内的上下文，每个工作区默认打开 SSH 设备控制台。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`netops` profile 会选择它：

```sh
dsh netops
```

设备选择器会显示每台设备的两项独立信息：清单中的启用或禁用标记，以及针对管理端口实时探测得到的在线、离线或未知连接状态。在线设备还会显示拨号延迟。

连接信息来自 `POLYGLOT_*` 环境变量或配置行：

| 变量 | 用途 | 默认值 |
|---|---|---|
| `POLYGLOT_API_URL` | Polyglot HTTP API 基础 URL | `http://127.0.0.1:8080` |
| `POLYGLOT_WS_URL` | 设备控制台 WebSocket 基础 URL | 从 API URL 推导 |
| `POLYGLOT_API_TOKEN` | 清单 bearer 令牌 | 无 |
| `POLYGLOT_MCP_URL` | MCP 端点 | `<api>/mcp` |
| `POLYGLOT_MCP_TOKEN` | MCP bearer 令牌 | 无 |
| `POLYGLOT_WS_TOKEN` | 设备控制台令牌 | MCP 令牌 |
| `NETOPS_MCP_URL` | 可选的第二个中立 MCP 服务 | 禁用 |

本包只挂载一个 agent preset：`standard`（Network Operations）。保留网页搜索、受沙箱约束的本地文件、子代理/工作流、技能与插件、计划/待办/目标以及设备；移除文档预览、Office 转换、后台任务、定时、交付物、反馈与开发者检查器界面。

主机 shell 执行默认关闭。工作区文件访问使用沙箱文件系统：`read`、`write` 与 `edit` 可用，`workspace-write` 沙箱会把变更限制在工作区根目录内；`apply_patch` 未注册。`bash` 与 `pwsh` 保持注册，管理员可通过 `netops-policy` 开关（`allowHostShellEmergency`，默认 300 秒）打开一个有界应急窗口；窗口激活前守卫拒绝这两个工具，到期后无需重启即关闭。该开关是 volatile 的，窗口到期时不会回写开关值。显式的 `danger-full-access` 预设会选择不受限沙箱；`workspace-write` 与 `device-full-access` 会把文件变更限制在工作区内。

### 客户服务 preset

`netops-cs.patch.yml` 是 `dsh --profile headless` 的 `--patch` 覆盖层；Polyglot WhatsApp 网关用它处理客户消息：

```sh
dsh --profile headless --patch node_modules/@deepseek-ai/dsh-netops-app/netops-cs.patch.yml --json -
```

该覆盖层移除 shell、文件系统、网页、委派与编码工具，将沙箱设为 `read-only`，只挂载只读 Polyglot MCP 客户端与白名单守卫。设置 `POLYGLOT_MCP_URL` 与 `POLYGLOT_MCP_READ_TOKEN`；令牌在服务端隐藏变更工具，守卫拒绝固定只读目录之外的任何工具。网关持有 WhatsApp socket，并通过 stdin 传入客户消息。

<a id="model-experience"></a>
## 模型体验

### 设备上下文

#### 模型看到什么

当会话工作区指向设备时，`@deepseek-ai/dsh-device-context` 会追加一条持久化的用户上下文消息，包含设备 ID、名称、厂商、驱动、管理地址和 SSH 端口，并指示模型使用该 ID 调用设备工具。消息在每轮第一步、目标变化时以及刷新间隔（默认十分钟）后注入。

#### Token 影响

每次注入一条简短上下文消息；长对话在刷新间隔后再次收到快照，而不是每个步骤都收到。

#### KV Cache 影响

注入内容追加在保留历史之后；稳定的系统提示词前缀不变。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **设备授权由 Polyglot 执行，而不是本组合包。** 模型会收到设备 ID，但租户与设备访问控制必须由工具服务端执行。
- **一个 MCP 命名空间服务所有设备。** 工具位于主机层并接收 `device_id`；会话无法挂载设备专属的工具子集。
- **设备控制台协议遵循 Polyglot 当前的 WebSocket 封包**（`device_id`、`input_data`、`cols`、`rows`）。后端协议变化时需同步更新此处。
- **应急主机 shell 窗口是进程内的。** 重启 harness 会关闭它。profile 中保留为 `true` 的开关会在激活时打开一个新的、受配置 TTL 限制的窗口。
- **CS 白名单固定为当前 Polyglot 只读 MCP 工具名。** 新增或重命名只读工具时必须同步更新 `read-only-guard.ts`；未知名称会被拒绝。
- **CS 覆盖层从 harness 安装位置解析。** 网关必须传入已安装的 `netops-cs.patch.yml` 路径，且 `dsh` 进程必须能够解析 `@deepseek-ai/dsh-netops-app` 包。

<a id="dev-note"></a>
### 开发备注

无。
