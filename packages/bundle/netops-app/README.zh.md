---
description: "基于 Web 表面的设备优先网络运维组合包、其 profile、环境变量与模型体验。"
kind: "package-reference"
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

本包只挂载一个 agent preset：`standard`（Network Operations）。保留网页搜索、本地文件与 shell、子代理/工作流、技能与插件、计划/待办/目标以及设备；移除文档预览、Office 转换、后台任务、定时、交付物、反馈与开发者检查器界面。

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

<a id="开发备注"></a>
## 开发备注

无。
