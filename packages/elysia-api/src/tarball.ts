import { gunzipSync } from 'zlib'

export interface TarEntry {
  data: Buffer
  mode: number
}

/**
 * 从 npm 平台包 tarball（gzip）中按路径后缀提取单个文件。
 * 零依赖实现：解压后按 512 字节块解析 ustar 头；npm pack 会产出 pax 扩展头
 * （typeflag 'x'，以 key=value 记录覆盖下一入口的 path 等），这里只消费 path 覆盖，
 * 其余入口（目录、package.json、全局头）直接跳过。
 */
export function extractTarEntryBySuffix(gzipBuffer: Buffer, suffix: string): TarEntry | undefined {
  const tar = gunzipSync(gzipBuffer)
  let pendingPath: string | undefined
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break // 结束块
    const name = readString(header, 0, 100)
    const mode = parseInt(readString(header, 100, 8).trim() || '0', 8) || 0
    const size = parseInt(readString(header, 124, 12).trim() || '0', 8) || 0
    const typeflag = String.fromCharCode(header[156])
    const prefix = readString(header, 345, 155)
    offset += 512
    const data = tar.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512
    if (typeflag === 'x') {
      pendingPath = parsePaxPath(data)
      continue
    }
    const rawPath = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '')
    const path = rawPath || pendingPath || ''
    pendingPath = undefined
    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '7') continue
    if (path === suffix || path.endsWith(`/${suffix}`)) {
      return { data: Buffer.from(data), mode }
    }
  }
  return undefined
}

function parsePaxPath(block: Buffer): string | undefined {
  const text = block.toString('utf8')
  for (const record of text.split('\n')) {
    const match = /^(\d+) (.+?)=(.*)$/.exec(record)
    if (!match) continue
    if (match[2] === 'path') return match[3]
  }
  return undefined
}

function readString(block: Buffer, start: number, length: number) {
  const slice = block.subarray(start, start + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
}
