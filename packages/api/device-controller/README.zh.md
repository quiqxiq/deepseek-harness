---
description: "设备选择器与设备工作区背后的网络设备清单主机端 Remote 所有者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-device-controller

[English](README.md) | 中文

## 概述

`devices` Remote 命名空间的主机端所有者。它读取配置好的 Polyglot 设备清单 HTTP 端点，并向浏览器投影脱敏后的设备记录，因此设备选择器和设备工作区创建过程都不持有端点令牌或上游响应体。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与工作区控制器一同挂载；`netops` profile 默认完成此配置。

```yaml
- id: device-controller
  name: '@deepseek-ai/dsh-api-device-controller'
  config:
    baseUrl: http://127.0.0.1:8080
    timeoutMs: 10000
```

`baseUrl` 默认指向本地引擎。`token` 作为 bearer 令牌发送，且绝不会投影到浏览器。`devices/list` 返回 `{ devices }`；`devices/get` 返回单个设备或 `device/not-found`。每台设备都带有清单中的 `enabled` 与 `status` 事实，以及实时 `connectivity` 探测结果（`online`、`offline`，禁用设备为 `unknown`）；在线时还带有 `latency_ms`。传输、状态码或解码失败统一映射为 `device/inventory-unavailable`，并携带基础 URL 与简短原因。

<a id="model-experience"></a>
## 模型体验

无，因为主机端 Remote 只向浏览器投影清单记录，不注册提示词、工具 schema 或会话事件。

#### KV Cache 影响

模型请求前缀不变。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **清单为只读且不缓存。** 每次打开选择器或采纳设备都会执行一次 HTTP 调用。
- **连接状态是对管理端口的一次 TCP 拨号，而不是协议握手。** 设备接受套接字但拒绝协议时仍会报告在线；协议级存活检查请使用设备状态工具。

<a id="dev-note"></a>
### 开发备注

无。
