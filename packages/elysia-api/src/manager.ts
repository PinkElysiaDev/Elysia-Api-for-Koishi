import { Context } from 'koishi'
import { ChildProcess, spawn } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { createHash, randomBytes } from 'crypto'
import { Config } from './config'
import { extractTarEntryBySuffix } from './tarball'

/** 按需下载的后端版本钉扎（对齐上游 = 改这一个常量并重新发布插件）。 */
export const BACKEND_VERSION = '1.4.0'

interface BootstrapConfig {
  host: string
  port: number
  panelAccessToken: string
  httpTimeout: number
  openBrowserOnStart?: boolean
  agentRemote?: { enabled?: boolean, publicUrl?: string }
}

export class StandaloneBackendManager {
  private process: ChildProcess | null = null
  private lastConfigHash = ''
  private downloading: Promise<string> | null = null

  constructor(private ctx: Context, private config: Config) {}

  updateConfig(config: Config) {
    this.config = config
  }

  /**
   * 后端数据目录（config.json、bin/<版本>/ 二进制缓存、数据库的所在地）。
   * 留空用默认目录，相对路径相对 Koishi 数据目录。
   */
  getBackendDir() {
    return this.resolvePath(this.config.backendDir?.trim() || 'data/elysia-api-standalone')
  }

  getConfigPath() {
    return join(this.getBackendDir(), 'config.json')
  }

  getWebUIURL() {
    return `http://${this.config.host}:${this.config.port}/ui`
  }

  getAdminBaseURL() {
    return `http://${this.config.host}:${this.config.port}`
  }

  /**
   * 后端已 daemon 化，与 Koishi 进程解耦：重启 Koishi 后 this.process 会丢失，
   * 但 daemon 仍在运行。因此存活判断以「端口健康探测」为准，而非进程句柄。
   * 认定标准：/health 返回 JSON 且含 status 字段（degraded 的 503 同样算在运行），
   * 避免误接管端口上的其他服务，也避免向后端已占用的端口重复拉起进程。
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getAdminBaseURL()}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      const payload = await response.json().catch(() => null)
      return !!payload && typeof payload === 'object' && 'status' in payload
    } catch {
      return false
    }
  }

  writeBootstrapConfig() {
    const path = this.getConfigPath()
    mkdirSync(dirname(path), { recursive: true })
    const existing = this.readExistingConfig(path)
    const panelAccessToken = this.config.panelAccessToken?.trim() || existing.panelAccessToken || randomBytes(24).toString('base64url')
    // 合并而非覆写：保留后端通过 WebUI 写入的字段（enablePprof、databasePath 等），
    // 仅更新 Koishi 插件管控的 bootstrap 字段。
    const merged = {
      ...existing,
      host: this.config.host,
      port: this.config.port,
      panelAccessToken,
      httpTimeout: this.config.httpTimeout,
      // 宿主下默认不自动弹浏览器（桌面用户想要的话可显式写 true）——
      // 后端 nil 是「默认尝试」，Koishi 拉起的 daemon 冷启不该在宿主机弹标签页。
      openBrowserOnStart: existing.openBrowserOnStart ?? false,
      // 显式打开远程助手面。旧二进制会忽略未知字段；关掉后 /api/agent、/mcp、/a2a 全部 404。
      // publicUrl 是用户在 WebUI 写的对外地址，合并时保留。
      agentRemote: {
        ...(existing.agentRemote ?? {}),
        enabled: true,
      },
    }
    writeFileSync(path, JSON.stringify(merged, null, 2))
    this.lastConfigHash = this.buildRuntimeHash()
    return merged
  }

  async start() {
    if (!this.config.enabled) {
      this.ctx.logger.info('Elysia-API standalone backend is disabled')
      return
    }
    // 端口上已有 Elysia-API（含远程实例）：直接接管并与之通信，不重复拉起。
    if (await this.isRunning()) {
      this.ctx.logger.info('Elysia-API standalone backend already running, attaching to it')
      await this.verifyAdoptedInstance()
      return
    }
    this.writeBootstrapConfig()
    const binaryPath = await this.ensureBinaryPath()
    this.ctx.logger.info(`Starting Elysia-API standalone backend (daemon): ${binaryPath}`)
    // detached + unref + stdio:ignore：子进程脱离 Koishi 进程组，
    // Koishi 退出/重启不再连坐杀掉后端。日志由后端自身处理，不再回流 pipe。
    const child = spawn(binaryPath, ['--config', this.getConfigPath()], {
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
      env: { ...process.env },
    })
    child.on('error', error => {
      this.ctx.logger.error(`Elysia-API standalone backend spawn error: ${error.message}`)
    })
    child.unref()
    this.process = child
    // 拉起后等待就绪：spawn 是 fire-and-forget，路径错误/端口被非 HTTP 服务占用时
    // 后端会静默退出，这里给出可排查的告警（不阻塞 start 返回）。
    void this.waitForReady()
  }

  /** 接管已运行实例时校验面板令牌：实例可能由其他配置（或远程主机）启动，令牌不一致则管理指令全部 401。 */
  private async verifyAdoptedInstance() {
    try {
      await this.health()
    } catch (error) {
      this.ctx.logger.warn(
        `端口 ${this.config.port} 上已有 Elysia-API，但面板令牌校验未通过（${(error as Error).message}）。` +
        '若该实例不是由本插件启动，请在插件配置 panelAccessToken 中填写它的令牌，否则管理指令与 AI 助手指令将不可用。',
      )
    }
  }

  /** 轮询 /health 直到后端就绪或超时，超时给出端口占用/路径错误的排查提示。 */
  private async waitForReady(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500))
      if (await this.isRunning()) {
        this.ctx.logger.info(`Elysia-API standalone backend is ready at ${this.getAdminBaseURL()}`)
        return
      }
    }
    this.ctx.logger.warn(
      `后端启动后 ${Math.round(timeoutMs / 1000)} 秒内未在 ${this.getAdminBaseURL()}/health 就绪：` +
      '请检查端口是否被其他服务占用、二进制路径是否正确（自定义模式）或平台包是否已安装。',
    )
  }

  /**
   * 停止 daemon：通过 /__shutdown 端点请求后端优雅关停（loopbackOnly，仅本机可调），
   * 再轮询 /health 直到不再响应。不再用 process.kill —— daemon 可能不由本会话持有句柄。
   */
  async stop(timeoutMs = 10000) {
    if (!(await this.isRunning())) {
      this.process = null
      return
    }
    try {
      await fetch(`${this.getAdminBaseURL()}/__shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      })
    } catch (error) {
      // 关停请求本身可能因连接被切断而抛错，属正常；继续轮询确认。
      this.ctx.logger.debug(`shutdown request returned: ${(error as Error).message}`)
    }
    const stopped = await this.waitForStopped(timeoutMs)
    if (!stopped) {
      this.ctx.logger.warn(`Backend did not stop within ${timeoutMs}ms after /__shutdown`)
    }
    this.process = null
  }

  /** 轮询直到后端端口不再响应（已关停），或超时。 */
  private async waitForStopped(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await this.isRunning())) return true
      await new Promise(r => setTimeout(r, 200))
    }
    return !(await this.isRunning())
  }

  async restart() {
    this.writeBootstrapConfig()
    await this.stop()
    await this.start()
  }

  async reloadOrRestart(previousHash = this.lastConfigHash) {
    this.writeBootstrapConfig()
    const nextHash = this.buildRuntimeHash()
    const restartRequired = previousHash !== '' && previousHash !== nextHash
    if (restartRequired && this.config.restartOnConfigChange) {
      await this.restart()
      return 'restarted'
    }
    if (await this.isRunning()) {
      await this.adminFetch('/api/admin/reload', { method: 'POST' }).catch(error => {
        this.ctx.logger.warn(`Backend reload request failed: ${(error as Error).message}`)
      })
    }
    return restartRequired ? 'restart-required' : 'reloaded'
  }

  async health() {
    return this.adminFetch('/api/admin/health')
  }

  /** 管理 API。默认 5 秒超时；流式请求自己带 signal，不再套这层超时。 */
  adminFetch(path: string, init: RequestInit = {}) {
    return this.adminRequest(path, init, true)
  }

  /** 与 adminFetch 相同的鉴权，但把响应体留给调用方（SSE）。 */
  adminFetchRaw(path: string, init: RequestInit = {}) {
    return this.adminRequest(path, init, false)
  }

  private async adminRequest(path: string, init: RequestInit, parseJson: true): Promise<unknown>
  private async adminRequest(path: string, init: RequestInit, parseJson: false): Promise<Response>
  private async adminRequest(path: string, init: RequestInit, parseJson: boolean): Promise<unknown> {
    const token = this.getPanelAccessToken()
    const response = await fetch(`${this.getAdminBaseURL()}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      signal: init.signal ?? AbortSignal.timeout(5000),
    })
    if (!parseJson) {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`)
      }
      return response
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`)
    }
    return payload
  }

  private getPanelAccessToken() {
    const configured = this.config.panelAccessToken?.trim()
    if (configured) return configured
    return this.readExistingConfig(this.getConfigPath()).panelAccessToken ?? ''
  }

  private readExistingConfig(path: string): Partial<BootstrapConfig> {
    if (!existsSync(path)) return {}
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Partial<BootstrapConfig>
    } catch {
      return {}
    }
  }

  /**
   * 拉起前解析二进制，依次查找：custom 配置路径 → node_modules 平台包（手动安装或
   * 旧版残留）→ 本地下载缓存（版本隔离）→ 旧版 assets/bin。全部未命中且非 custom
   * 模式时，才从 registry 按需下载（接管已运行实例不会走到这里，不触网）。
   */
  private async ensureBinaryPath() {
    if (this.config.backendBinaryMode === 'custom') {
      if (!this.config.backendBinaryPath) throw new Error('backendBinaryPath is required when backendBinaryMode=custom')
      return this.resolvePath(this.config.backendBinaryPath)
    }
    const packaged = this.findPlatformPackageBinary()
    if (packaged) return packaged
    const cached = this.getCachedBinaryPath()
    if (existsSync(cached)) return cached
    const legacy = join(__dirname, '../assets/bin', this.getLegacyBinaryName())
    if (existsSync(legacy)) return legacy
    return this.ensureDownloadedBinary()
  }

  /** 按需下载的二进制缓存位置：<backendDir>/bin/<后端版本>/，版本互不覆盖。 */
  private getCachedBinaryPath() {
    return join(this.getBackendDir(), 'bin', BACKEND_VERSION, process.platform === 'win32' ? 'elysia-api.exe' : 'elysia-api')
  }

  /** 并发护栏：多个 start() 同时缺二进制时共享同一次下载。 */
  private ensureDownloadedBinary() {
    this.downloading ??= this.downloadBinary().finally(() => {
      this.downloading = null
    })
    return this.downloading
  }

  private async downloadBinary() {
    const registry = (this.config.backendBinaryRegistry?.trim() || 'https://registry.npmjs.org').replace(/\/+$/, '')
    const pkg = this.platformPackageName()
    const target = this.getCachedBinaryPath()
    const hint = `平台包 ${pkg}@${BACKEND_VERSION} 可能尚未发布，或网络不可达；可在插件配置中将后端二进制来源改为「自定义」并指定路径。`
    let tarballUrl: string
    let integrity: string | undefined
    try {
      const response = await fetch(`${registry}/${pkg}/${BACKEND_VERSION}`, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(`registry 元数据请求返回 ${response.status}`)
      const metadata = await response.json() as { dist?: { tarball?: string, integrity?: string } }
      tarballUrl = metadata.dist?.tarball || `${registry}/${pkg}/-/${pkg}-${BACKEND_VERSION}.tgz`
      integrity = metadata.dist?.integrity
    } catch (error) {
      throw new Error(`获取 ${pkg}@${BACKEND_VERSION} 元数据失败（${(error as Error).message}）。${hint}`)
    }
    let tarball: Buffer
    try {
      const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(300000) })
      if (!response.ok) throw new Error(`tarball 下载返回 ${response.status}`)
      tarball = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      throw new Error(`下载 ${tarballUrl} 失败（${(error as Error).message}）。${hint}`)
    }
    if (integrity && !verifyIntegrity(tarball, integrity)) {
      throw new Error(`下载的 ${pkg}@${BACKEND_VERSION} tarball 完整性校验失败（${integrity}）。${hint}`)
    }
    const suffix = `package/bin/${process.platform === 'win32' ? 'elysia-api.exe' : 'elysia-api'}`
    const entry = extractTarEntryBySuffix(tarball, suffix)
    if (!entry) throw new Error(`tarball 中没有找到 ${suffix}。${hint}`)
    mkdirSync(dirname(target), { recursive: true })
    const partial = `${target}.part`
    try {
      writeFileSync(partial, entry.data)
      if (process.platform !== 'win32') chmodSync(partial, entry.mode || 0o755)
      renameSync(partial, target)
    } catch (error) {
      rmSync(partial, { force: true })
      throw new Error(`写入二进制缓存失败（${(error as Error).message}）：${target}`)
    }
    this.ctx.logger.info(`已下载 Elysia-API 后端二进制 ${pkg}@${BACKEND_VERSION} → ${target}`)
    return target
  }

  private platformPackageName() {
    return `elysia-api-backend-${this.platformSuffix()}`
  }

  private platformSuffix() {
    if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-amd64'
    if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64'
    if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-amd64'
    throw new Error(`不支持的平台: ${process.platform}/${process.arch}`)
  }

  private findPlatformPackageBinary() {
    const binary = join('node_modules', this.platformPackageName(), 'bin', process.platform === 'win32' ? 'elysia-api.exe' : 'elysia-api')
    // 从插件目录逐级向上查找 node_modules，覆盖提升安装与同目录安装两种布局。
    let dir = __dirname
    for (;;) {
      const candidate = join(dir, binary)
      if (existsSync(candidate)) return candidate
      const parent = dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  }

  private getLegacyBinaryName() {
    if (process.platform === 'win32') return process.arch === 'arm64' ? 'elysia-backend-windows-arm64.exe' : 'elysia-backend.exe'
    if (process.platform === 'darwin') return process.arch === 'arm64' ? 'elysia-backend-darwin-arm64' : 'elysia-backend-darwin-amd64'
    if (process.platform === 'linux') return process.arch === 'arm64' ? 'elysia-backend-linux-arm64' : 'elysia-backend-linux'
    return 'elysia-backend'
  }

  private resolvePath(path: string) {
    return isAbsolute(path) ? path : resolve(this.ctx.baseDir, path)
  }

  private buildRuntimeHash() {
    return JSON.stringify({
      binaryMode: this.config.backendBinaryMode,
      binaryPath: this.config.backendBinaryPath ?? '',
      backendDir: this.getBackendDir(),
      host: this.config.host,
      port: this.config.port,
    })
  }
}

/** 校验 npm registry 的 dist.integrity（形如 sha512-<base64>）。 */
function verifyIntegrity(buffer: Buffer, integrity: string) {
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity)
  if (!match) return false
  return createHash('sha512').update(buffer).digest('base64') === match[1]
}
