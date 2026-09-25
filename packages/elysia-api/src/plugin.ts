import { Context, Session } from 'koishi'
import { spawn } from 'child_process'
import { AgentBridge } from './agent'
import { Config, name } from './config'
import { StandaloneBackendManager } from './manager'

export { Config, name }

/**
 * 可选注入 puppeteer 服务（由 koishi-plugin-puppeteer 等插件提供）：
 * 存在时 AI 助手的选项/方案卡片与超长回复渲染为图片；缺失时全部回退纯文本。
 * 只依赖服务名，不依赖任何具体插件的包。
 */
export const inject = { puppeteer: { required: false } }

export const usage = `---

Elysia-API 独立后端入口插件。

本插件只负责调整后端的启动时行为，可绕过本插件手动控制后端。

### 命令

- elysia-api.backend.start：启动独立后端
- elysia-api.backend.stop：停止独立后端
- elysia-api.backend.restart：重启独立后端
- elysia-api.backend.status：查询后端状态
- elysia-api.backend.reload：写入 bootstrap config 并热重载/重启
- elysia-api.webui.url：显示 WebUI 地址
- elysia-api.webui.open：按配置命令打开 WebUI
- elysia-api.agent.list [status]：列出会话（idle / running / waiting_approval）
- elysia-api.agent.new [标题]：新建并进入会话
- elysia-api.agent.use <序号或 id>：进入会话
- elysia-api.agent.current：查看当前会话
- elysia-api.agent.say <内容>：对话（无当前会话时自动新建）
- elysia-api.agent.stop：停止当前轮次
- elysia-api.agent.mode <plan|direct>：方案模式或直接执行
- elysia-api.agent.models：列出模型来源与模型名
- elysia-api.agent.model <来源 id> <模型名>：切换模型
- elysia-api.agent.think <off|low|medium|high|max|adaptive>：思考强度
- elysia-api.agent.pending：查看待审批 / 待回答事项
- elysia-api.agent.approve [备注] / .reject [理由] / .answer <回答>：处理待办

当前会话按频道记在内存里，重启 Koishi 后用 list / use 重新进入。

启用提供 puppeteer 服务的插件后，提问选项、方案审批与超长回复会渲染成图片发送；服务不可用时自动回退纯文本。

---
`

export function apply(ctx: Context, config: Config) {
  const manager = new StandaloneBackendManager(ctx, config)
  const agent = new AgentBridge(ctx, config, manager)

  ctx.on('ready', () => {
    if (config.autoStart) {
      manager.start().catch(error => {
        ctx.logger.error(`Elysia-API 后端自动启动失败：${(error as Error).message}`)
      })
    }
  })

  // 后端已 daemon 化，独立于 Koishi 存活：dispose 时不再停止后端，
  // 仅放手即可。重启/停止后端请用对应指令或改配置触发。
  ctx.on('dispose', () => {})

  ctx.on('config', () => {
    manager.updateConfig(config)
    agent.updateConfig(config)
    void manager.reloadOrRestart()
  })

  ctx.command('elysia-api', 'Elysia-API 管理指令', { authority: 3 })

  ctx.command('elysia-api.backend.start', '启动 Elysia-API 独立后端').action(async () => {
    await manager.start()
    return `Elysia-API 独立后端启动中：${manager.getAdminBaseURL()}`
  })

  ctx.command('elysia-api.backend.stop', '停止 Elysia-API 独立后端').action(async () => {
    await manager.stop()
    return 'Elysia-API 独立后端已停止'
  })

  ctx.command('elysia-api.backend.restart', '重启 Elysia-API 独立后端').action(async () => {
    await manager.restart()
    return `Elysia-API 独立后端已重启：${manager.getAdminBaseURL()}`
  })

  ctx.command('elysia-api.backend.reload', '写入 bootstrap config 并请求后端重载').action(async () => {
    const result = await manager.reloadOrRestart()
    return `Elysia-API 独立后端配置已处理：${result}`
  })

  ctx.command('elysia-api.backend.status', '查询 Elysia-API 独立后端状态').action(async () => {
    if (!(await manager.isRunning())) return 'Elysia-API 独立后端未在运行'
    try {
      const health = await manager.health()
      return `Elysia-API 独立后端运行中：${JSON.stringify(health)}`
    } catch (error) {
      return `Elysia-API 独立后端进程存在，但健康检查失败：${(error as Error).message}`
    }
  })

  ctx.command('elysia-api.webui.url', '显示 Elysia-API WebUI 地址').action(() => manager.getWebUIURL())

  ctx.command('elysia-api.webui.open', '打开 Elysia-API WebUI').action(() => {
    const url = manager.getWebUIURL()
    if (!config.webuiOpenCommand?.trim()) return url
    const child = spawn(config.webuiOpenCommand, [url], { stdio: 'ignore', detached: true, windowsHide: true })
    child.unref()
    return `已请求打开 WebUI：${url}`
  })

  if (!config.agentEnabled) return

  const channelOf = (session: Session) => session.cid || session.channelId || session.userId || 'console'
  const run = async (session: Session, task: () => Promise<string>) => {
    try {
      return await task()
    } catch (error) {
      return (error as Error).message
    }
  }

  ctx.command('elysia-api.agent.list [status]', '列出 AI 助手会话').action(({ session }, status) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.list(channelOf(session), status))
  })

  ctx.command('elysia-api.agent.new [title:text]', '新建并进入 AI 助手会话').action(({ session }, title) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.create(channelOf(session), title))
  })

  ctx.command('elysia-api.agent.use <token:string>', '按序号或 id 进入 AI 助手会话').action(({ session }, token) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.use(channelOf(session), token))
  })

  ctx.command('elysia-api.agent.current', '查看当前 AI 助手会话').action(({ session }) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.currentText(channelOf(session)))
  })

  ctx.command('elysia-api.agent.say <text:text>', '向当前 AI 助手会话发送消息').action(({ session }, text) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.say(channelOf(session), text ?? '', session))
  })

  ctx.command('elysia-api.agent.stop', '停止当前 AI 助手轮次').action(({ session }) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.stop(channelOf(session)))
  })

  ctx.command('elysia-api.agent.mode <mode:string>', '切换工作模式：plan 或 direct').action(({ session }, mode) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.setMode(channelOf(session), mode))
  })

  ctx.command('elysia-api.agent.models', '列出可供助手使用的模型').action(({ session }) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.listModels())
  })

  ctx.command('elysia-api.agent.model <sourceId:string> <modelName:text>', '为当前会话指定模型来源与模型').action(({ session }, sourceId, modelName) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.setModel(channelOf(session), sourceId, (modelName ?? '').trim()))
  })

  ctx.command('elysia-api.agent.think <level:string>', '设置思考强度：off/low/medium/high/max/adaptive').action(({ session }, level) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.setThinking(channelOf(session), level))
  })

  ctx.command('elysia-api.agent.pending', '查看当前会话的待审批或待回答事项').action(({ session }) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.pending(channelOf(session)))
  })

  ctx.command('elysia-api.agent.approve [note:text]', '批准当前的工具调用或方案').action(({ session }, note) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.approve(channelOf(session), note ?? '', session))
  })

  ctx.command('elysia-api.agent.reject [note:text]', '拒绝当前的工具调用或方案').action(({ session }, note) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.reject(channelOf(session), note ?? '', session))
  })

  ctx.command('elysia-api.agent.answer <text:text>', '回答助手的提问').action(({ session }, text) => {
    if (!session) return '需要在会话中使用'
    return run(session, () => agent.answer(channelOf(session), text ?? '', session))
  })
}
