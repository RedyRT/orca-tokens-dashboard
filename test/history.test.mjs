import assert from 'node:assert/strict'
import { once } from 'node:events'
import { appendFile, copyFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const epoch = Date.parse('2026-11-22T06:30:00Z')
const usage = { input: 40, cacheRead: 50, cacheWrite: 10, output: 20, cost: { total: 0.02 } }
const header = { type: 'session', id: 'test-session', cwd: '/work/dashboard' }
const reply = (id, timestamp, tokens = usage, content = []) => ({ type: 'message', id, timestamp, message: {
  role: 'assistant', provider: 'openai-codex', model: 'gpt-test', usage: tokens, content,
} })
const lines = (...rows) => rows.map(row => JSON.stringify(row)).join('\n') + '\n'

async function fixture(t) {
  const { History } = await import('../worker/history.mjs')
  const root = await mkdtemp(join(tmpdir(), 'orca-token-test-'))
  const history = new History([{ agent: 'omp', path: root }])
  t.after(async () => { await history.close(); await rm(root, { recursive: true, force: true }) })
  return { root, path: join(root, 'session.jsonl'), history }
}

const snapshot = (history, options = {}) => history.snapshot({ period: '1h', ...options }, epoch)

test('history counts cache once, auxiliary usage separately and only one copy per session', async t => {
  const { root, path, history } = await fixture(t)
  await writeFile(path, lines(header, reply('first', epoch - 240000, usage, [
    { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'PRIVATE_FIXTURE' } },
  ]), { type: 'message', id: 'result', timestamp: epoch - 239000, message: {
    role: 'toolResult', toolCallId: 'call-1', isError: false, content: 'PRIVATE_FIXTURE',
  } }, { type: 'model_usage', id: 'judge', timestamp: epoch - 120000, provider: 'openai-codex', model: 'judge',
    usage: { input: 4, cacheRead: 0, cacheWrite: 0, output: 2, cost: { total: 0.001 } },
  }, reply('partial', epoch - 60000, { input: 8, output: 3 })))
  await mkdir(join(root, 'backup'))
  await copyFile(path, join(root, 'backup', 'same.jsonl'))
  const data = await snapshot(history)
  assert.deepEqual(data.totals, { tokens: 126, cost: 0.021, measurements: 3, tokenSamples: 2, costSamples: 2,
    sessions: 1, tools: 1, success: 1, failed: 0, responses: 2, auxiliary: 1 })
  assert.equal(data.buckets.at(-1).tokens, null)
  assert.equal(data.buckets.at(-1).cost, null)
  assert.equal(data.buckets.find(bucket => bucket.tokens === 120).cacheRate, 50)
  assert.equal(JSON.stringify(data).includes('PRIVATE_FIXTURE'), false)
  assert.equal((await snapshot(history, { model: 'openai-codex/judge' })).totals.tokens, 6)
  assert.equal((await snapshot(history, { workspace: '/elsewhere' })).totals.sessions, 0)
})

test('an unfinished line is not published; finishing it triggers an event and preserves its bucket', async t => {
  const { path, history } = await fixture(t)
  const later = lines(reply('live', epoch - 1000))
  const cut = Math.floor(later.length / 2)
  await writeFile(path, lines(header) + later.slice(0, cut))
  assert.equal((await snapshot(history)).totals.tokens, null)
  const event = once(history, 'changed', { signal: AbortSignal.timeout(5000) })
  await appendFile(path, later.slice(cut))
  await event
  const data = await snapshot(history)
  assert.equal(data.totals.tokens, 120)
  assert.equal(data.buckets.at(-1).tokens, 120)
  assert.equal(data.to, epoch - 999)
})

test('period tracks matching activity while clock mode preserves verified zero and expires old records', async t => {
  const { path, history } = await fixture(t)
  await writeFile(path, lines(header, reply('zero', epoch - 4 * 3600000, { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: { total: 0 } })))
  const activity = await snapshot(history)
  assert.equal(activity.totals.tokens, 0)
  assert.equal(activity.to, epoch - 4 * 3600000 + 1)
  assert.equal(activity.buckets.at(-2).tokens, null)
  const clock = await snapshot(history, { anchor: 'now' })
  assert.equal(clock.to, epoch)
  assert.equal(clock.totals.tokens, null)
})

test('rewriting a journal replaces the old measurements and retains no invalid records', async t => {
  const { path, history } = await fixture(t)
  await writeFile(path, lines(header, reply('old', epoch - 1000)))
  assert.equal((await snapshot(history)).totals.tokens, 120)
  await writeFile(path, lines(header, reply('new', epoch - 500, { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 })) + '{broken}\n')
  const data = await snapshot(history, { refresh: true })
  assert.equal(data.totals.tokens, 10)
  assert.equal(data.issues.skipped, 1)
})

test('explicit refresh rereads edits inside an otherwise identical growing journal', async t => {
  const { path, history } = await fixture(t)
  const prefix = reply('first', epoch - 240000)
  const middle = reply('middle', epoch - 180000)
  const tail = reply('tail', epoch - 120000)
  await writeFile(path, lines(header, prefix, middle, tail))
  assert.equal((await snapshot(history)).totals.tokens, 360)
  await writeFile(path, lines(header, prefix, reply('middle', epoch - 180000, { ...usage, input: 80 }), tail, reply('extra', epoch - 60000)))
  assert.equal((await snapshot(history, { refresh: true })).totals.tokens, 520)
})

test('a shorter backup saved later cannot replace the primary ledger', async t => {
  const { root, path, history } = await fixture(t)
  await writeFile(path, lines(header, reply('first', epoch - 240000), reply('second', epoch - 180000)))
  const backup = join(root, 'old-backup.jsonl')
  await writeFile(backup, lines(header, reply('first', epoch - 240000, { ...usage, input: 10 })))
  await utimes(path, epoch / 1000 - 10, epoch / 1000 - 10)
  await utimes(backup, epoch / 1000, epoch / 1000)
  assert.equal((await snapshot(history)).totals.tokens, 240)
})

test('replacing an assistant message removes its old tool calls', async t => {
  const { path, history } = await fixture(t)
  await writeFile(path, lines(header, reply('same', epoch - 240000, usage, [
    { type: 'toolCall', id: 'removed', name: 'read' },
  ]), reply('same', epoch - 240000, usage, [{ type: 'toolCall', id: 'new', name: 'edit' }])))
  const data = await snapshot(history)
  assert.deepEqual(data.toolFrequency.map(({ label, total }) => [label, total]), [['edit', 1]])
})
