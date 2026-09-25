import { Schema } from 'koishi'

export interface Config {
  enabled: boolean
  backendBinaryMode: 'bundled' | 'custom'
  backendBinaryPath?: string
  backendDir?: string
  host: string
  port: number
  panelAccessToken?: string
  httpTimeout: number
  backendBinaryRegistry?: string
  autoStart: boolean
  restartOnConfigChange: boolean
  webuiOpenCommand?: string
  agentEnabled: boolean
  agentReplyMode: 'stream' | 'final'
  agentMaxReplyChars: number
  agentPreferImage: boolean
  agentImageThreshold: number
}

export const name = 'elysia-api'

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enabled: Schema.boolean().default(true).description('启用独立 Elysia-API 后端入口插件'),
  }).description('基础'),
  // 后端二进制来源：tagged union，仅当选择「自定义」时才显示路径输入项。
  Schema.intersect([
    Schema.object({
      backendBinaryMode: Schema.union([
        Schema.const('bundled' as const).description('使用 npm 平台包安装的后端二进制（推荐，随插件自动安装；仅当端口无服务需要拉起时使用）'),
        Schema.const('custom' as const).description('使用自定义后端二进制路径（仅当端口无服务需要拉起时使用）'),
      ]).default('bundled' as const).description('后端二进制来源'),
    }).description('后端程序'),
    Schema.union([
      Schema.object({
        backendBinaryMode: Schema.const('custom' as const).required(),
        backendBinaryPath: Schema.string().description('自定义后端二进制路径'),
      }),
      Schema.object({}),
    ]),
  ]),
  Schema.object({
    backendDir: Schema.string().description('后端数据目录：config.json、按需下载的二进制缓存 bin/<版本>/、后端数据库都放在这里；留空默认 data/elysia-api-standalone，相对路径相对 Koishi 数据目录'),
    host: Schema.string().default('127.0.0.1').description('服务地址：端口已有 Elysia-API（含远程实例）时直接接管通信，否则以此地址拉起后端'),
    port: Schema.number().default(18765).description('服务端口：已运行实例会被直接复用，未运行则以该端口启动后端'),
    panelAccessToken: Schema.string().role('secret').description('面板令牌；接管已运行实例时须与该实例一致，否则管理指令将 401。本地拉起时留空则自动生成写入 bootstrap config'),
    httpTimeout: Schema.number().default(120).description('后端上游 HTTP 超时秒数，0 表示不限制'),
    backendBinaryRegistry: Schema.string().default('https://registry.npmjs.org').description('按需下载后端二进制用的 npm registry；国内可改为 https://registry.npmmirror.com。仅当本地缺失二进制需要下载时使用'),
  }).description('后端启动配置'),
  Schema.object({
    autoStart: Schema.boolean().default(true).description('Koishi ready 后自动启动后端'),
    restartOnConfigChange: Schema.boolean().default(true).description('host/port/数据目录/binary 变化时自动重启，否则仅写入配置'),
    webuiOpenCommand: Schema.string().description('可选打开 WebUI 的命令，例如 xdg-open/open/start；留空时只返回 URL'),
  }).description('进程管理'),
  Schema.object({
    agentEnabled: Schema.boolean().default(true).description('注册 AI 助手指令（列出/进入/新建会话、对话、改模式与模型、审批方案）。更改后需重载插件'),
    agentReplyMode: Schema.union([
      Schema.const('stream' as const).description('边生成边发送'),
      Schema.const('final' as const).description('只发送终稿'),
    ]).default('stream' as const).description('回复方式'),
    agentMaxReplyChars: Schema.number().default(3500).description('单条回复最大字符数，超出部分提示到 WebUI 查看'),
    agentPreferImage: Schema.boolean().default(true).description('优先图片渲染：启用提供 puppeteer 服务的插件后，选项/方案卡片与超长回复渲染为图片发送；服务不可用自动回退纯文本'),
    agentImageThreshold: Schema.number().default(1200).description('回复超过该字符数时改为分页图片发送（需图片渲染可用）'),
  }).description('AI 助手'),
]) as Schema<Config>
