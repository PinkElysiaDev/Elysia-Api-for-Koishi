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
| 按需下载（默认） | 需要拉起后端而本地没有二进制时，从 npm registry 下载平台包 `elysia-api-backend-{windows,linux,darwin}-{amd64,arm64}`（按当前平台自动选择）并解出二进制，缓存到 `<backendDir>/bin/<版本>/`。版本隔离、带 sha512 完整性校验，下载过的版本后续直接复用。registry 可通过 `backendBinaryRegistry` 配置（国内镜像）。 |
| 自定义路径 | 在插件配置中把后端二进制来源改为「自定义」，并填写独立版 `elysia-api` 可执行文件的路径。相对路径相对 Koishi 的 `baseDir`。适合自编译、预发版、离线，以及要用到平台包尚未收录的新后端（例如 AI 助手）的场景。 |
| node_modules 平台包（手动安装或旧版残留） | 已通过 npm 手动安装平台包、或从 1.2.0（optionalDependencies 分发）原地升级的安装，优先直接使用。 |
| 旧版残留（自动回退） | 从旧版本（≤1.1.0）原地升级时，沿用插件目录下遗留的 `assets/bin` 二进制。 |

## 使用

### 安装

在 Koishi 插件市场安装 `koishi-plugin-elysia-api`，或手动安装：

```bash
npm install koishi-plugin-elysia-api
```

插件本体 KB 级，安装时不下载任何后端文件。首次需要拉起后端时（`autoStart` 或 `elysia-api.backend.start`）才从 npm 下载对应平台的二进制包（约 20MB 压缩包）并缓存；接管已运行实例时不下载。

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

父命令下还有一组 AI 助手指令（`agentEnabled` 为真时注册）。当前会话按频道记在内存里，重启 Koishi 后用 `list` / `use` 重新进入。

| 命令 | 作用 |
| --- | --- |
| `elysia-api.agent.list [status]` | 列出会话。`status` 可选 `idle` / `running` / `waiting_approval` |
| `elysia-api.agent.new [标题]` | 新建并进入会话 |
| `elysia-api.agent.use <序号或 id>` | 进入会话。序号对应本频道上一次 `list` 的结果 |
| `elysia-api.agent.current` | 查看当前会话的状态、模型、思考强度与待办 |
| `elysia-api.agent.say <内容>` | 对话。没有当前会话时自动新建一个 |
| `elysia-api.agent.stop` | 停止当前这一轮 |
| `elysia-api.agent.mode <plan\|direct>` | `plan` 先出方案再改动；`direct` 直接执行 |
| `elysia-api.agent.models` | 列出模型来源与模型名（不含密钥） |
| `elysia-api.agent.model <来源 id> <模型名>` | 切换当前会话的模型 |
| `elysia-api.agent.think <off\|low\|medium\|high\|max\|adaptive>` | 调整思考强度 |
| `elysia-api.agent.pending` | 查看待审批的工具、方案或待回答的提问 |
| `elysia-api.agent.approve [备注]` / `.reject [理由]` | 批准或拒绝工具调用与方案 |
| `elysia-api.agent.answer <回答>` | 回答助手的提问 |

助手指令走管理 API，使用插件写入的面板令牌，不需要另外申请 Key。npm 平台包目前钉在后端 1.4.0，还不包含 AI 助手；要用这组指令，请在配置里改用带助手功能的独立版二进制。

### 图片渲染（可选）

启用任意**提供 puppeteer 服务的插件**（如 [koishi-plugin-puppeteer](https://koishi.chat/plugins/)）后，助手的提问选项、方案审批卡片与超长回复会渲染成图片发送，服务不可用时自动回退纯文本：

- 本插件只消费 `puppeteer` 服务（可选注入），不依赖具体插件的包，也不会强制安装浏览器。
- Windows 上 koishi-plugin-puppeteer 会自动定位本机 Edge / Chrome；Linux 服务器需有可用的 Chrome/Chromium 与 CJK 字体（如 Noto Sans CJK）。
- 超长回复按约 1400 字/页分页、按顺序逐页发送；流式模式下超过阈值（`agentImageThreshold`）后停止发文本增量，剩余内容在轮次结束时转图片。

### 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `backendBinaryMode` | `bundled` | `bundled`（本地缺失时自动从 registry 下载）/ `custom`（自定义路径）；仅当端口无服务需要拉起时使用 |
| `backendBinaryPath` | — | custom 模式必填，相对路径相对 Koishi 数据目录 |
| `backendDir` | `data/elysia-api-standalone` | 后端数据目录：config.json、二进制缓存 `bin/<版本>/`、数据库都在这里；相对路径相对 Koishi 数据目录 |
| `host` / `port` | `127.0.0.1` / `18765` | 服务地址：已有实例（含远程）直接接管通信，否则以此地址拉起 |
| `panelAccessToken` | 自动生成 | 面板令牌；接管已运行实例时须与其一致，本地拉起时留空自动生成 |
| `httpTimeout` | `120` | 上游 HTTP 超时秒数 |
| `backendBinaryRegistry` | `https://registry.npmjs.org` | 按需下载后端二进制用的 npm registry；国内可改为 `https://registry.npmmirror.com` |
| `autoStart` | `true` | Koishi 就绪后自动启动后端 |
| `restartOnConfigChange` | `true` | 关键配置变化时自动重启 |
| `webuiOpenCommand` | — | 如 `xdg-open` / `open` / `start` |
| `agentEnabled` | `true` | 是否注册 AI 助手指令。更改后需重载插件 |
| `agentReplyMode` | `stream` | `stream` 边生成边发送，`final` 只发送终稿 |
| `agentMaxReplyChars` | `3500` | 单条回复的最大字符数，超出部分提示到 WebUI 查看 |
| `agentPreferImage` | `true` | puppeteer 服务可用时，卡片与超长回复优先渲染为图片 |
| `agentImageThreshold` | `1200` | 回复超过该字符数改为分页图片发送（需图片渲染可用） |

后端是独立 daemon：Koishi 退出不会连带停止后端，重启 Koishi 后插件探测到 `/health` 存活即直接接管。

### 接管或拉起

插件对「服务地址」（`host`/`port`）的处理逻辑：

- **端口上已有 Elysia-API**（`/health` 返回带 `status` 字段的 JSON，含 degraded 状态）：直接接管并与之通信，不写配置、不拉起进程。实例可能由其他配置启动，也可以是**远程主机**——把 `host` 指过去即可，此时请在 `panelAccessToken` 中填写该实例的令牌，否则管理指令与 AI 助手指令将 401（插件接管时会校验并告警）。远程实例无法用 `backend.stop` 停止（`__shutdown` 仅允许 loopback 调用），属预期行为。
- **端口上没有 Elysia-API**：按「后端程序」配置解析二进制（自定义路径 → npm 平台包 → 旧版残留），以配置的地址与端口拉起 daemon，并在 15 秒内轮询就绪；未就绪会告警提示检查端口占用与二进制路径。
- 端口被**其他服务**占用（不是 Elysia-API）：不会误接管；拉起的新进程无法绑定端口时会在就绪告警中提示。

拉起本地后端时，插件写入 bootstrap 配置只覆写插件管控的字段（host/port/令牌/超时/远程助手开关），WebUI 里保存的其它运行配置（数据库路径、日志留存等）原样保留。

### 从 1.2.0 升级

旧配置项 `configPath`（bootstrap config.json 路径）已被 `backendDir`（后端数据目录）**彻底取代并移除**。没有改过默认值的用户无需任何操作——两者指向同一目录；曾在 `configPath` 里自定义过路径的，请把它的**父目录**填入 `backendDir`，否则将使用默认目录 `data/elysia-api-standalone`（旧目录里的数据库需要一并迁移）。

## 开发

```bash
yarn install
yarn build        # yakumo 构建 packages/elysia-api（esbuild + tsc）
```

升级后端版本：修改 `packages/elysia-api/src/manager.ts` 顶部的 `BACKEND_VERSION` 常量（与独立版 tag 一致），重新发布插件即可——旧版本缓存目录不会自动清理，可按需手动删除。后端源码、WebUI 与二进制构建均在[独立版仓库](https://github.com/PinkElysiaDev/Elysia-Api)完成，本仓库不持有副本；平台包需由独立版仓库的 `scripts/publish-npm-binaries.mjs` 发布到 npm。

## 许可证

[MIT](./LICENSE) © PinkElysiaDev
