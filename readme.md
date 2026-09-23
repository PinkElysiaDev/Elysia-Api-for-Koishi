# Elysia-API for Koishi

> 为 Koishi 打造的 AI 模型网关入口插件：一条命令拉起 [Elysia-API](https://github.com/PinkElysiaDev/Elysia-Api) 独立后端（Go 单二进制 + 内嵌 WebUI），统一对接 OpenAI / Claude / Gemini 等上游。

[![npm](https://img.shields.io/npm/v/koishi-plugin-elysia-api)](https://www.npmjs.com/package/koishi-plugin-elysia-api)
[![license](https://img.shields.io/npm/l/koishi-plugin-elysia-api)](#许可证)

## 架构

本插件是一个**瘦启动器**：网关本体是独立版 Elysia-API 的官方预编译二进制，通过 npm 平台包分发，插件只负责生命周期管理与通信。

```text
┌──────────────────────────────────────────────┐
│  Koishi + koishi-plugin-elysia-api（本插件）  │
│  写 bootstrap 配置 / spawn / 健康探测 / 命令  │
└───────────────────┬──────────────────────────┘
                    │ spawn（daemon，独立存活）
                    ▼
┌──────────────────────────────────────────────┐
│  Elysia-API 官方后端二进制                    │
│  elysia-api-backend-<os>-<arch>（npm 平台包）│
│  鉴权 · 模型组 / 负载均衡 · 协议转换          │
│  流式转发 · Usage 统计 · WebUI（内嵌）        │
└──────────────────────────────────────────────┘
```

- 后端功能（协议设计器、四大协议预置、AI 生成协议、模型组、用量统计等）见独立版仓库的 [README](https://github.com/PinkElysiaDev/Elysia-Api) 与 [CHANGELOG](https://github.com/PinkElysiaDev/Elysia-Api/blob/deploy/CHANGELOG.md)。
- 本仓库只包含插件通信层（约 300 行 TypeScript）：进程管理、bootstrap 配置、命令与 WebUI 入口。

### 后端二进制来源

| 来源 | 说明 |
| --- | --- |
| npm 平台包（默认） | 插件以 `optionalDependencies` 声明 6 个平台包（`elysia-api-backend-{windows,linux,darwin}-{amd64,arm64}`），包内含 `os`/`cpu` 字段，npm/yarn/pnpm 安装时自动只装匹配当前机器的那一个。平台包版本号与后端版本严格一致。 |
| 自定义路径 | 在插件配置中选择「自定义」并指定二进制路径，适合自编译、预发版或离线场景。 |
| 旧版残留（自动回退） | 从旧版本（≤1.1.0）原地升级且平台包缺失时，沿用插件目录下遗留的 `assets/bin` 二进制。 |

## 使用

### 安装

在 Koishi 插件市场安装 `koishi-plugin-elysia-api`，或手动安装：

```bash
npm install koishi-plugin-elysia-api
```

安装需要联网拉取平台二进制包（约 30MB，取决于平台）。**不要**使用 `--no-optional` / `--ignore-optional` 安装——那会跳过后端二进制，此时请改用「自定义」模式指定路径。

### 命令

父命令 `elysia-api`（需要权限 3）：

| 命令 | 作用 |
| --- | --- |
| `elysia-api.backend.start` | 写入 bootstrap 配置并启动后端（已在运行则跳过） |
| `elysia-api.backend.stop` | 优雅停止后端（`POST /__shutdown`） |
| `elysia-api.backend.restart` | 重启后端 |
| `elysia-api.backend.reload` | 热重载配置（host/port 等变更时自动转为重启） |
| `elysia-api.backend.status` | 查看后端运行状态与健康指标 |
| `elysia-api.webui.url` / `.open` | 返回 / 打开 WebUI 地址（默认 `http://127.0.0.1:18765/ui`） |

### 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `backendBinaryMode` | `bundled` | `bundled`（npm 平台包）/ `custom`（自定义路径） |
| `backendBinaryPath` | — | custom 模式必填，相对路径相对 Koishi 数据目录 |
| `configPath` | `data/elysia-api-standalone/config.json` | 后端 bootstrap 配置路径 |
| `host` / `port` | `127.0.0.1` / `18765` | 后端监听地址 |
| `panelAccessToken` | 自动生成 | WebUI / 管理 API 令牌；留空则首次生成写盘 |
| `httpTimeout` | `120` | 上游 HTTP 超时秒数 |
| `autoStart` | `true` | Koishi 就绪后自动启动后端 |
| `restartOnConfigChange` | `true` | 关键配置变化时自动重启 |
| `webuiOpenCommand` | — | 如 `xdg-open` / `open` / `start` |

后端是独立 daemon：Koishi 退出不会连带停止后端，重启 Koishi 后插件探测到 `/health` 存活即直接接管。插件写入 bootstrap 配置时只覆写上表管控的字段，WebUI 里保存的其它运行配置（数据库路径、日志留存等）原样保留。

## 开发

```bash
yarn install
yarn build        # yakumo 构建 packages/elysia-api（esbuild + tsc）
```

升级后端版本：修改 `packages/elysia-api/package.json` 中 `optionalDependencies` 的 6 个平台包版本号（与独立版 tag 一致），重新发布插件即可。后端源码、WebUI 与二进制构建均在[独立版仓库](https://github.com/PinkElysiaDev/Elysia-Api)完成，本仓库不持有副本。

## 许可证

[MIT](./LICENSE) © PinkElysiaDev
