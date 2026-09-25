import { Context } from 'koishi'

/**
 * 只依赖 puppeteer 服务名的鸭子类型接口——不 import koishi-plugin-puppeteer，
 * 任何提供该服务的实现（render(html) → base64 <img> 字符串）都可用。
 */
interface PuppeteerService {
  render(content: string): Promise<string>
}

/** 长回复分页：单页字符预算，在段落边界优先切分。 */
const PAGE_CHARS = 1400
const FONT_STACK = `system-ui, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`

export class CardRenderer {
  /** 渲染一旦失败即降级（本进程内不再尝试），避免每条消息重复 warn 与等待。 */
  private broken = false

  constructor(private ctx: Context) {}

  available() {
    return !this.broken && !!this.service()
  }

  async render(html: string): Promise<string | undefined> {
    if (this.broken) return undefined
    const service = this.service()
    if (!service) return undefined
    try {
      const image = await service.render(html)
      return typeof image === 'string' && image ? image : undefined
    } catch (error) {
      this.broken = true
      this.ctx.logger.warn(`AI 助手图片渲染失败，后续回退纯文本：${(error as Error).message}`)
      return undefined
    }
  }

  private service(): PuppeteerService | undefined {
    return this.ctx.get('puppeteer') as PuppeteerService | undefined
  }
}

export interface CardQuestion {
  question: string
  options: { label: string, description?: string }[]
  allowCustom?: boolean
}

export function questionCardHtml(card: CardQuestion) {
  const options = card.options.length
    ? card.options.map((option, index) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-top:10px;">
        ${badge(index + 1)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:600;color:#1f2328;line-height:1.5;">${escapeHtml(option.label)}</div>
          ${option.description ? `<div style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:2px;">${escapeHtml(option.description)}</div>` : ''}
        </div>
      </div>`).join('')
    : '<div style="font-size:14px;color:#9ca3af;margin-top:10px;">（没有预设选项）</div>'
  return page(`
    ${cardHeader('AI 助手提问')}
    <div style="font-size:17px;font-weight:600;color:#1f2328;line-height:1.55;margin-top:10px;">${escapeHtml(card.question)}</div>
    ${options}
    ${card.allowCustom !== false ? '<div style="font-size:12px;color:#9ca3af;margin-top:12px;">可自由作答，不限于以上选项</div>' : ''}
    ${cardFooter('elysia-api.agent.answer &lt;你的回答&gt;')}`)
}

export function planCardHtml(summary: string, steps: { title: string, status?: string }[]) {
  const rows = steps.map(step => `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-top:9px;">
      ${statusDot(step.status)}
      <div style="flex:1;min-width:0;font-size:14px;color:#1f2328;line-height:1.6;">${escapeHtml(step.title)}</div>
    </div>`).join('')
  return page(`
    ${cardHeader('方案待确认')}
    ${summary ? `<div style="font-size:14px;color:#4b5563;line-height:1.65;margin-top:10px;">${escapeHtml(summary)}</div>` : ''}
    <div style="margin-top:6px;">${rows || '<div style="font-size:14px;color:#9ca3af;margin-top:10px;">（没有步骤）</div>'}</div>
    ${cardFooter('approve 批准执行 · reject &lt;修改意见&gt; 打回')}`)
}

export function toolCardHtml(names: string[], reason: string) {
  const list = names.length
    ? names.map(name => `<div style="font-size:14px;color:#1f2328;line-height:1.7;font-family:Consolas,Monaco,monospace;">· ${escapeHtml(name)}</div>`).join('')
    : '<div style="font-size:14px;color:#9ca3af;">未命名操作</div>'
  return page(`
    ${cardHeader('待审批操作')}
    <div style="margin-top:10px;">${list}</div>
    ${reason ? `<div style="font-size:14px;color:#4b5563;line-height:1.65;margin-top:10px;padding:10px 12px;background:#f6f7f9;border-radius:8px;">${escapeHtml(reason)}</div>` : ''}
    ${cardFooter('approve 允许 · reject &lt;理由&gt; 拒绝')}`)
}

/** 把长文本切成页。返回纯文本段（渲染 HTML 用 textPageHtml，兜底文本用原段拼接）。 */
export function paginateText(text: string, budget = PAGE_CHARS): string[] {
  const paragraphs = text.split(/\n/)
  const pages: string[] = []
  let current = ''
  const push = () => {
    const trimmed = current.trim()
    if (trimmed) pages.push(trimmed)
    current = ''
  }
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 1 > budget && current.trim()) {
      push()
    }
    if (paragraph.length > budget) {
      // 超长单段硬切
      for (let start = 0; start < paragraph.length; start += budget) {
        push()
        current = paragraph.slice(start, start + budget)
        if (current.length >= budget) push()
      }
      continue
    }
    current += (current ? '\n' : '') + paragraph
  }
  push()
  return pages.length ? pages : ['']
}

export function textPageHtml(title: string, segment: string, index: number, total: number) {
  const heading = title ? `${escapeHtml(title)} · 第 ${index}/${total} 页` : `第 ${index}/${total} 页`
  return page(`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
      <div style="font-size:13px;color:#6b7280;">${heading}</div>
      <div style="font-size:12px;color:#c2c8d0;">Elysia-API</div>
    </div>
    <div style="border-top:1px solid #eceef1;"></div>
    <div style="font-size:15px;color:#1f2328;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin-top:12px;">${escapeHtml(segment)}</div>`)
}

function page(body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;width:fit-content;font-family:${FONT_STACK};">
  <div style="width:520px;box-sizing:border-box;padding:22px 26px;background:#ffffff;border:1px solid #e6e8eb;border-radius:12px;">${body}</div>
</body></html>`
}

function cardHeader(label: string) {
  return `<div style="font-size:12px;color:#9ca3af;letter-spacing:2px;">${escapeHtml(label)}</div>`
}

function cardFooter(hint: string) {
  return `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #eceef1;font-size:12px;color:#9ca3af;">${hint}</div>`
}

function badge(index: number) {
  return `<div style="flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid #c2c8d0;color:#6b7280;font-size:12px;display:flex;align-items:center;justify-content:center;">${index}</div>`
}

function statusDot(status?: string) {
  if (status === 'done') return '<div style="flex:none;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-top:5px;"></div>'
  if (status === 'in_progress') return '<div style="flex:none;width:10px;height:10px;border-radius:50%;border:2px solid #3b82f6;background:conic-gradient(#3b82f6 0 50%, transparent 50%);margin-top:5px;"></div>'
  return '<div style="flex:none;width:10px;height:10px;border-radius:50%;border:2px solid #9ca3af;margin-top:5px;"></div>'
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
