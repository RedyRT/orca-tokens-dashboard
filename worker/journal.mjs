import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'

const metadata = new Set(['title', 'model_change', 'thinking_level_change', 'compaction', 'branch_summary', 'custom', 'custom_message', 'label', 'session_info', 'service_tier_change', 'reset_boundary', 'title_change', 'ttsr_injection', 'credential_pin', 'session_init', 'mode_change'])
const limit = 16 * 1024 * 1024
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value) ? value : null
const time = value => {
  const timestamp = typeof value === 'string' ? Date.parse(value) : value
  return Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= 8.64e15 ? timestamp : null
}

function ingest(state, line) {
  const raw = line.toString('utf8').trim()
  if (!raw) return
  let row
  try { row = JSON.parse(raw) } catch { state.skipped++; return }
  if (!row || typeof row !== 'object' || Array.isArray(row)) { state.skipped++; return }
  if (!state.session) {
    if (row.type === 'title') return
    if (row.type !== 'session' || !text(row.id)) { state.skipped++; state.rejected = true; return }
    state.session = row.id
    state.workspace = typeof row.cwd === 'string' && row.cwd.length <= 1024 && !/[\u0000-\u001f]/.test(row.cwd) && row.cwd || null
    return
  }
  const auxiliary = row.type === 'model_usage'
  if (!auxiliary && row.type !== 'message') {
    if (!metadata.has(row.type)) state.skipped++
    return
  }
  const message = auxiliary ? row : row.message
  if (!auxiliary && message?.role === 'toolResult') {
    const id = text(message.toolCallId)
    if (id && typeof message.isError === 'boolean') state.results.set(id, message.isError ? 'failed' : 'success')
    else state.skipped++
    return
  }
  if (!auxiliary && message?.role !== 'assistant') {
    if (!['user', 'developer', 'custom'].includes(message?.role)) state.skipped++
    return
  }
  const id = text(row.id)
  const at = time(row.timestamp) ?? time(message.timestamp)
  if (!id || at === null) { state.skipped++; return }
  const provider = text(message.provider)
  const name = text(message.model)
  const model = provider && name ? `${provider}/${name}` : null
  const input = count(message.usage?.input)
  const cached = count(message.usage?.cacheRead)
  const write = count(message.usage?.cacheWrite)
  const inclusive = input === null || cached === null || write === null ? null : count(input + cached + write)
  const output = count(message.usage?.output)
  const record = { at, provider, model, auxiliary, input: inclusive, cached, output,
    tokens: inclusive === null || output === null ? null : count(inclusive + output), cost: money(message.usage?.cost?.total) }
  const tools = []
  if (!auxiliary && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type !== 'toolCall') continue
      const call = text(part.id)
      const tool = text(part.name)
      if (!call || !tool) { state.skipped++; continue }
      tools.push({ id: call, name: tool })
    }
  }
  state.usage.set(`${auxiliary ? 'usage' : 'message'}:${id}`, { ...record, tools })
}

async function fingerprint(file, offset) {
  const length = Math.min(offset, 128)
  if (length === 0) return ''
  const bytes = Buffer.allocUnsafe(2 * length)
  const head = await file.read(bytes, 0, length, 0)
  const tail = await file.read(bytes, length, length, offset - length)
  if (head.bytesRead !== length || tail.bytesRead !== length) throw Error('Journal changed while reading')
  return createHash('sha256').update(bytes).digest('base64url')
}

export async function readJournal(path, previous) {
  const candidate = await lstat(path)
  if (!candidate.isFile()) return null
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = await file.stat()
    if (!info.isFile() || info.ino !== candidate.ino || info.dev !== candidate.dev) return null
    const identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`
    const append = previous?.identity === identity && previous.offset <= info.size &&
      (previous.size < info.size || previous.mtime === info.mtimeMs) &&
      previous.hash === await fingerprint(file, previous.offset)
    const state = append ? previous : { identity, offset: 0, hash: '', session: null, workspace: null,
      usage: new Map(), results: new Map(), rows: 0, skipped: 0, rejected: false, dropping: false }
    const bytes = Buffer.allocUnsafe(64 * 1024)
    const fragments = []
    let size = 0
    let position = state.offset
    while (!state.rejected && position < info.size) {
      const { bytesRead } = await file.read(bytes, 0, Math.min(bytes.length, info.size - position), position)
      if (!bytesRead) break
      const chunk = bytes.subarray(0, bytesRead)
      let start = 0
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start)
        const end = newline < 0 ? chunk.length : newline
        const part = chunk.subarray(start, end)
        if (!state.dropping && size + part.length > limit) {
          state.skipped++
          state.dropping = true
          if (!state.session) state.rejected = true
          fragments.length = size = 0
        }
        if (state.rejected) break
        if (newline >= 0) {
          state.rows++
          if (!state.dropping) ingest(state, fragments.length ? Buffer.concat([...fragments, part], size + part.length) : part)
          state.dropping = false
          fragments.length = size = 0
          state.offset = position + end + 1
          if (state.rejected) break
        } else if (state.dropping) {
          state.offset = position + end
        } else if (part.length) {
          fragments.push(Buffer.from(part))
          size += part.length
        }
        start = end + 1
      }
      position += bytesRead
    }
    state.hash = await fingerprint(file, state.offset)
    state.size = info.size
    state.mtime = info.mtimeMs
    state.ctime = info.ctimeMs
    return state
  } finally { await file.close() }
}
