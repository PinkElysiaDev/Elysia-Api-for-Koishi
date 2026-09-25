import { Context, Session } from 'koishi'
import { Config } from './config'
import { StandaloneBackendManager } from './manager'
import { CardRenderer, paginateText, planCardHtml, questionCardHtml, textPageHtml, toolCardHtml } from './render'

const TURN_TIMEOUT_MS = 10 * 60 * 1000
const STREAM_FLUSH_CHARS = 400
const STREAM_FLUSH_MS = 1500

interface Envelope {
  ok?: boolean
  data?: unknown
  error?: { code?: string, message?: string }
}

interface AgentSettings {
  modelSourceId?: string
  modelName?: string
  thinkingEnabled?: boolean
  thinkingEffort?: string
  planMode?: boolean
}

interface PlanStep {
  title?: string
  status?: string
}

interface PendingQuestion {
  question?: string
  options?: { label?: string, description?: string }[]
  allowCustom?: boolean
}

interface PendingAction {
  kind?: string
  calls?: { id?: string, name?: string }[]
  reason?: string
  question?: PendingQuestion
  plan?: PlanStep[]
  planSummary?: string
}

interface AgentSessionView {
  id: string
  title?: string
  status?: string
  mode?: string
  settings?: AgentSettings
  pendingAction?: PendingAction | null
  plan?: PlanStep[]
  planSummary?: string
  userTurns?: number
  totalTokens?: number
}

interface SourceKey {
  fetchedModels?: string[]
  allowedModels?: string[] | null
  disabled?: boolean
}

interface ModelSource {
  id: string
  name?: string
  enabled?: boolean
  manualModels?: { id?: string, name?: string, enabled?: boolean }[]
  apiKeys?: SourceKey[]
}

interface AgentEvent {
  type?: string
  text?: string
  delta?: string
  name?: string
  model?: string
  durationMs?: number
  approval?: PendingAction
  message?: { role?: string, content?: { text?: string } }
}

/** 把后端 AI 助手的管理 API 暴露成 Koishi 指令。当前会话按频道记在内存里。 */
export class AgentBridge {
  private current = new Map<string, string>()
  private listed = new Map<string, string[]>()

  constructor(
    private ctx: Context,
    private config: Config,
    private manager: StandaloneBackendManager,
  ) {
    this.renderer = new CardRenderer(ctx)
  }

  private renderer: CardRenderer

  updateConfig(config: Config) {
    this.config = config
  }

  async list(channelId: string, status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const data = await this.call<{ items?: AgentSessionView[], total?: number }>(`/api/admin/agent/sessions${query}`)
    const items = data.items ?? []
    this.listed.set(channelId, items.map(item => item.id))
    if (!items.length) return status ? `没有状态为 ${status} 的助手会话。` : '还没有助手会话。用 elysia-api.agent.new 新建一个。'
    const lines = items.map((item, index) => {
      const model = item.settings?.modelName || '未选模型'
      const pending = item.pendingAction ? ' · 待处理' : ''
      return `${index + 1}. ${item.title || '未命名'} [${labelStatus(item.status)}] ${model}${pending} · ${shortId(item.id)}`
    })
    return [`共 ${data.total ?? items.length} 个会话：`, ...lines, '用 elysia-api.agent.use <序号或 id> 进入。'].join('\n')
  }

  async create(channelId: string, title?: string) {
    const body: { mode: string, title?: string } = { mode: 'create' }
    if (title?.trim()) body.title = title.trim()
    const session = await this.call<AgentSessionView>('/api/admin/agent/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    this.current.set(channelId, session.id)
    return `已新建并进入会话「${session.title || '未命名'}」（${shortId(session.id)}）。直接用 elysia-api.agent.say 说话。`
  }

  async use(channelId: string, token: string) {
    const id = this.resolveToken(channelId, token)
    const data = await this.call<{ session?: AgentSessionView }>(`/api/admin/agent/sessions/${encodeURIComponent(id)}`)
    const session = data.session
    if (!session?.id) throw new Error('后端没有返回会话')
    this.current.set(channelId, session.id)
    return `已进入「${session.title || '未命名'}」（${shortId(session.id)}），状态 ${labelStatus(session.status)}。`
  }

  async currentText(channelId: string) {
    const session = await this.requireSession(channelId)
    return formatSession(session)
  }

  async say(channelId: string, text: string, koishiSession: Session) {
    const content = text.trim()
    if (!content) return '请在指令后写上要说的话。'
    let id = this.current.get(channelId)
    let title = ''
    if (!id) {
      const created = await this.call<AgentSessionView>('/api/admin/agent/sessions', {
        method: 'POST',
        body: JSON.stringify({ mode: 'create' }),
      })
      id = created.id
      title = created.title || ''
      this.current.set(channelId, id)
      await koishiSession.send(`还没有当前会话，已新建「${created.title || '未命名'}」（${shortId(id)}）。`)
    }
    return this.streamTurn(koishiSession, `/api/admin/agent/sessions/${encodeURIComponent(id)}/messages`, { content }, title)
  }

  async stop(channelId: string) {
    const id = this.requireCurrentId(channelId)
    const data = await this.call<{ stopped?: boolean }>(`/api/admin/agent/sessions/${encodeURIComponent(id)}/stop`, { method: 'POST' })
    return data.stopped ? '已请求停止这一轮。' : '这一轮没有在运行。'
  }

  async setMode(channelId: string, mode: string) {
    const planMode = mode === 'plan' ? true : mode === 'direct' ? false : undefined
    if (planMode === undefined) return '工作模式只接受 plan（先出方案再改动）或 direct（直接执行）。'
    const id = this.requireCurrentId(channelId)
    await this.patchSettings(id, { planMode })
    return planMode ? '已切换为方案模式：改动前会先给出方案，等你批准。' : '已切换为直接模式。'
  }

  async listModels() {
    const data = await this.call<{ items?: ModelSource[] }>('/api/admin/model-sources')
    const lines: string[] = []
    for (const source of data.items ?? []) {
      const names = sourceModelNames(source)
      if (!names.length) continue
      lines.push(`${source.name || source.id}（${source.id}）${source.enabled === false ? ' · 已停用' : ''}`)
      lines.push(`  ${names.join('、')}`)
    }
    if (!lines.length) return `还没有可用模型。请先到 ${this.manager.getWebUIURL()} 添加模型源并拉取模型。`
    return ['可用模型（elysia-api.agent.model <来源 id> <模型名>）：', ...lines].join('\n')
  }

  async setModel(channelId: string, sourceId: string, modelName: string) {
    if (!sourceId || !modelName) return '用法：elysia-api.agent.model <来源 id> <模型名>。先用 elysia-api.agent.models 查看。'
    const id = this.requireCurrentId(channelId)
    await this.patchSettings(id, { modelSourceId: sourceId, modelName })
    return `已改用模型 ${modelName}（来源 ${sourceId}）。`
  }

  async setThinking(channelId: string, level: string) {
    const effort = level.toLowerCase()
    const allowed = ['off', 'low', 'medium', 'high', 'max', 'adaptive']
    if (!allowed.includes(effort)) return `思考强度只接受：${allowed.join(' / ')}。`
    const id = this.requireCurrentId(channelId)
    if (effort === 'off') {
      await this.patchSettings(id, { thinkingEnabled: false })
      return '已关闭思考。'
    }
    await this.patchSettings(id, { thinkingEnabled: true, thinkingEffort: effort })
    return `已把思考强度设为 ${effort}。`
  }

  async pending(channelId: string) {
    const session = await this.requireSession(channelId)
    if (!session.pendingAction) return '当前没有待处理事项。'
    const card = await this.tryCardImage(session.pendingAction)
    return card ?? formatPending(session.pendingAction)
  }

  async approve(channelId: string, note: string, koishiSession: Session) {
    return this.decide(channelId, koishiSession, { approved: true, note }, 'approve')
  }

  async reject(channelId: string, note: string, koishiSession: Session) {
    return this.decide(channelId, koishiSession, { approved: false, note }, 'reject')
  }

  async answer(channelId: string, text: string, koishiSession: Session) {
    const answer = text.trim()
    if (!answer) return '请在指令后写上回答。'
    return this.decide(channelId, koishiSession, { answer }, 'answer')
  }

  private async decide(
    channelId: string,
    koishiSession: Session,
    body: { approved?: boolean, note?: string, answer?: string },
    action: 'approve' | 'reject' | 'answer',
  ) {
    const id = this.requireCurrentId(channelId)
    const data = await this.call<{ session?: AgentSessionView }>(`/api/admin/agent/sessions/${encodeURIComponent(id)}`)
    const pending = data.session?.pendingAction
    if (!pending) return '当前没有待处理事项。'
    const kind = pending.kind || ''
    if (action === 'answer' && kind !== 'question') return '这不是提问，请用 elysia-api.agent.approve 或 reject。'
    if (action !== 'answer' && kind === 'question') return '助手在等你回答，请用 elysia-api.agent.answer <内容>。'
    const payload: { approved?: boolean, note?: string, answer?: string } = {}
    if (body.answer) payload.answer = body.answer
    if (action !== 'answer') payload.approved = body.approved
    if (body.note?.trim()) payload.note = body.note.trim()
    return this.streamTurn(koishiSession, `/api/admin/agent/sessions/${encodeURIComponent(id)}/approve`, payload, data.session?.title || '')
  }

  /** 待批动作优先渲染成卡片图；服务不可用或关闭时返回 undefined，由调用方回退文本。 */
  private async tryCardImage(pending?: PendingAction | null) {
    if (!pending || !this.config.agentPreferImage || !this.renderer.available()) return undefined
    return this.renderer.render(pendingCardHtml(pending))
  }

  /** 长文本分页渲染并按顺序发送；任一页失败则剩余内容回退纯文本。 */
  private async sendTextPages(koishiSession: Session, title: string, text: string) {
    const segments = paginateText(text)
    for (let index = 0; index < segments.length; index++) {
      const image = await this.renderer.render(textPageHtml(title, segments[index], index + 1, segments.length))
      if (!image) {
        await koishiSession.send(clip(segments.slice(index).join('\n'), this.replyLimit()))
        return
      }
      await koishiSession.send(image)
    }
  }

  private async streamTurn(koishiSession: Session, path: string, body: unknown, title = '') {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)
    let response: Response
    try {
      response = await this.manager.adminFetchRaw(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      return humanizeError(error)
    }
    const reader = response.body?.getReader()
    if (!reader) {
      clearTimeout(timer)
      return '后端没有返回事件流。'
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let sent = ''
    let pendingFlush = ''
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let announcedTool = false
    let sawTerminal = false
    let failed = false
    const threshold = this.config.agentImageThreshold
    const imageActive = this.config.agentPreferImage && this.renderer.available() && threshold > 0
    // 超过阈值后停止发文本增量，轮次结束时由图片分页接管剩余内容。
    let suppressText = false
    const flush = async (force = false) => {
      if (this.config.agentReplyMode !== 'stream') return
      if (!force && pendingFlush.length < STREAM_FLUSH_CHARS) return
      const chunk = clip(pendingFlush, this.replyLimit())
      pendingFlush = ''
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = undefined
      if (!chunk) return
      sent += chunk
      await koishiSession.send(chunk)
    }
    const scheduleFlush = () => {
      if (this.config.agentReplyMode !== 'stream' || flushTimer) return
      flushTimer = setTimeout(() => { void flush(true) }, STREAM_FLUSH_MS)
    }
    try {
      for (;;) {
        const read = await reader.read()
        if (read.done) break
        buffer += decoder.decode(read.value, { stream: true })
        const chunks = buffer.split(/\r?\n\r?\n/)
        buffer = chunks.pop() ?? ''
        for (const block of chunks) {
          const event = parseEvent(block)
          if (!event) continue
          if (event.type === 'text_delta' && event.delta) {
            full += event.delta
            if (imageActive && full.length > threshold) suppressText = true
            if (!suppressText) {
              pendingFlush += event.delta
              scheduleFlush()
              await flush(false)
            }
          } else if (event.type === 'message' && event.message?.role === 'assistant') {
            const text = event.message.content?.text ?? ''
            if (text.length > full.length) full = text
          } else if (event.type === 'tool_call' && !announcedTool && !full) {
            announcedTool = true
            await koishiSession.send(`正在执行工具 ${event.name || ''}…`.trim())
          } else if (event.type === 'approval_required') {
            await flush(true)
            sawTerminal = true
            const card = await this.tryCardImage(event.approval)
            await koishiSession.send(card ?? formatPending(event.approval))
          } else if (event.type === 'turn_done') {
            await flush(true)
            sawTerminal = true
            const rest = full.slice(sent.length)
            if (imageActive && full.length > threshold) {
              await this.sendTextPages(koishiSession, title, rest)
            } else if (rest.trim()) {
              await koishiSession.send(clip(rest, this.replyLimit()))
            }
            if (!failed) {
              const meta = [event.model, event.durationMs ? `${Math.round(event.durationMs / 1000)} 秒` : ''].filter(Boolean).join(' · ')
              if (meta) await koishiSession.send(meta)
            }
          } else if (event.type === 'error') {
            sawTerminal = true
            failed = true
            await koishiSession.send(event.text || '这一轮失败了。')
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return '这轮还在后台跑，稍后用 elysia-api.agent.current 查看。'
      return humanizeError(error)
    } finally {
      clearTimeout(timer)
      if (flushTimer) clearTimeout(flushTimer)
      reader.releaseLock()
    }
    if (!sawTerminal && full.slice(sent.length).trim()) {
      await koishiSession.send(clip(full.slice(sent.length), this.replyLimit()))
    }
    return ''
  }

  private async requireSession(channelId: string) {
    const id = this.requireCurrentId(channelId)
    const data = await this.call<{ session?: AgentSessionView }>(`/api/admin/agent/sessions/${encodeURIComponent(id)}`)
    if (!data.session) throw new Error('后端没有返回会话')
    return data.session
  }

  private requireCurrentId(channelId: string) {
    const id = this.current.get(channelId)
    if (!id) throw new Error('这个频道还没有进入会话。用 elysia-api.agent.list 查看，或 elysia-api.agent.new 新建。')
    return id
  }

  private resolveToken(channelId: string, token: string) {
    const text = token.trim()
    if (/^\d+$/.test(text)) {
      const ids = this.listed.get(channelId) ?? []
      const id = ids[Number(text) - 1]
      if (!id) throw new Error('没有这个序号。先用 elysia-api.agent.list 刷新列表。')
      return id
    }
    return text
  }

  private patchSettings(id: string, settings: AgentSettings) {
    return this.call(`/api/admin/agent/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    })
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    let payload: Envelope
    try {
      payload = await this.manager.adminFetch(path, { ...init, headers }) as Envelope
    } catch (error) {
      throw new Error(humanizeError(error))
    }
    if (payload?.ok === false) throw new Error(payload.error?.message || '请求失败')
    return (payload?.data ?? payload) as T
  }

  private replyLimit() {
    const limit = this.config.agentMaxReplyChars
    return limit > 0 ? limit : 3500
  }
}

function sourceModelNames(source: ModelSource) {
  const names = new Set<string>()
  for (const model of source.manualModels ?? []) {
    if (model.enabled === false) continue
    if (model.id) names.add(model.id)
  }
  for (const key of source.apiKeys ?? []) {
    if (key.disabled) continue
    const list = key.allowedModels ?? key.fetchedModels ?? []
    for (const name of list) names.add(name)
  }
  return [...names]
}

function formatSession(session: AgentSessionView) {
  const settings = session.settings ?? {}
  const thinking = settings.thinkingEnabled ? (settings.thinkingEffort || '开启') : '关闭'
  const lines = [
    `「${session.title || '未命名'}」 ${shortId(session.id)}`,
    `状态 ${labelStatus(session.status)} · 模式 ${settings.planMode ? '方案' : '直接'} · 思考 ${thinking}`,
    `模型 ${settings.modelName || '未选'}${settings.modelSourceId ? `（${settings.modelSourceId}）` : ''}`,
  ]
  if (session.pendingAction) lines.push(formatPending(session.pendingAction))
  return lines.join('\n')
}

function pendingCardHtml(pending: PendingAction) {
  const kind = pending.kind || ''
  if (kind === 'question') {
    return questionCardHtml({
      question: pending.question?.question || '（无题面）',
      options: (pending.question?.options ?? []).map(option => ({ label: option.label || '', description: option.description })),
      allowCustom: pending.question?.allowCustom,
    })
  }
  if (kind === 'plan') {
    return planCardHtml(pending.planSummary || '', (pending.plan ?? []).map(step => ({ title: step.title || '', status: step.status })))
  }
  return toolCardHtml((pending.calls ?? []).map(call => call.name || '').filter(Boolean), pending.reason || '')
}

function formatPending(pending?: PendingAction | null) {
  if (!pending) return '当前没有待处理事项。'
  const kind = pending.kind || ''
  if (kind === 'question') {
    const lines = [`助手在提问：${pending.question?.question || '（无题面）'}`]
    for (const option of pending.question?.options ?? []) {
      lines.push(`- ${option.label || ''}${option.description ? `：${option.description}` : ''}`)
    }
    lines.push('用 elysia-api.agent.answer <内容> 回答。')
    return lines.join('\n')
  }
  if (kind === 'plan') {
    const lines = ['助手给出了方案，等待确认：']
    if (pending.planSummary) lines.push(pending.planSummary)
    for (const step of pending.plan ?? []) lines.push(`- [${labelPlan(step.status)}] ${step.title || ''}`)
    lines.push('用 elysia-api.agent.approve 批准，或 reject <修改意见> 打回。')
    return lines.join('\n')
  }
  const names = (pending.calls ?? []).map(call => call.name).filter(Boolean)
  const lines = [`助手请求执行：${names.join('、') || '未命名操作'}`]
  if (pending.reason) lines.push(pending.reason)
  lines.push('用 elysia-api.agent.approve 允许，或 reject <理由> 拒绝。')
  return lines.join('\n')
}

function parseEvent(block: string): AgentEvent | undefined {
  const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
  if (!data || data.startsWith(':')) return undefined
  try {
    return JSON.parse(data) as AgentEvent
  } catch {
    return undefined
  }
}

function humanizeError(error: unknown) {
  const message = (error as Error).message || String(error)
  if (message.includes('session_running')) return '这一轮还在跑，用 elysia-api.agent.stop 停止后再发。'
  if (message.includes('no_pending_approval')) return '当前没有待处理事项。'
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) return '后端没有在运行。先用 elysia-api.backend.start 启动。'
  if (message.includes('404') && message.includes('agent')) return '后端没有 AI 助手接口。请把后端二进制换成带助手功能的独立版，或在配置里改用自定义路径。'
  return message
}

function labelStatus(status?: string) {
  if (status === 'running') return '进行中'
  if (status === 'waiting_approval') return '待处理'
  if (status === 'idle') return '空闲'
  return status || '未知'
}

function labelPlan(status?: string) {
  if (status === 'done') return '完成'
  if (status === 'in_progress') return '进行中'
  return '待办'
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function clip(text: string, limit: number) {
  const value = text.trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…余下内容请到 WebUI 查看。`
}
