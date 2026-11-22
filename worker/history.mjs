import { EventEmitter } from 'node:events'
import { watch } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { aggregate } from './aggregate.mjs'
import { readJournal } from './journal.mjs'

function errCode(error) { return error?.code ?? 'unknown' }
function absent(error) { return ['ENOENT', 'ENOTDIR'].includes(errCode(error)) }

async function* journals(root, errors) {
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) }
  catch (error) { if (!absent(error)) errors.add(root); return }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) yield* journals(path, errors)
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.jsonl') yield path
  }
}

export class History extends EventEmitter {
  constructor(roots) {
    super()
    this.sources = roots.map(({ agent, path }) => ({ agent, path: resolve(path), files: new Map(), errors: new Set(),
      watcher: null, watching: null, watchFailed: false, full: true, pending: new Set() }))
    this.queue = Promise.resolve()
    this.closed = false
  }

  schedule() {
    if (this.closed || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.refresh().then(() => { if (!this.closed) this.emit('changed') }, () => { if (!this.closed) this.emit('changed') })
    }, 80)
    this.timer.unref()
  }

  async ensureWatch(source) {
    let path = source.path
    while (true) {
      try { if ((await lstat(path)).isDirectory()) break }
      catch (error) { if (!absent(error)) { source.watchFailed = true; return false } }
      const parent = dirname(path)
      if (parent === path) { source.watchFailed = true; return false }
      path = parent
    }
    const present = path === source.path
    if (path !== source.watching || !source.watcher) {
      source.watcher?.close()
      source.watching = path
      source.watchFailed = false
      try {
        const watcher = watch(path, { recursive: present, persistent: false }, (event, filename) => {
          if (source.watcher !== watcher || this.closed) return
          const changed = typeof filename === 'string' && resolve(path, filename)
          if (changed && present && event === 'change' && source.files.has(changed)) {
            source.pending.add(changed)
          } else if (!changed || present || relative(changed, source.path).split(sep)[0] !== '..') {
            source.full = true
          } else return
          this.schedule()
        })
        source.watcher = watcher
        watcher.on('error', () => {
          if (source.watcher !== watcher || this.closed) return
          watcher.close()
          source.watcher = null
          source.watchFailed = true
          source.full = true
          // Surface the error. An explicit refresh can restart a failed watcher.
          this.emit('changed')
        })
      } catch { source.watcher = null; source.watchFailed = true }
    }
    return present
  }

  async syncPath(source, path, force = false) {
    const old = source.files.get(path)
    try {
      const info = await lstat(path)
      if (!info.isFile()) { source.files.delete(path); source.errors.delete(path); return }
      if (!force && old && old.size === info.size && old.mtime === info.mtimeMs && old.ctime === info.ctimeMs &&
        old.identity === `${info.dev}:${info.ino}:${info.birthtimeMs}` && !source.errors.has(path)) return
      const state = await readJournal(path, force ? undefined : old)
      if (state) { state.agent = source.agent; source.files.set(path, state) }
      else source.files.delete(path)
      source.errors.delete(path)
    } catch (error) {
      if (absent(error)) { source.files.delete(path); source.errors.delete(path) }
      else source.errors.add(path)
    }
  }

  refresh(force = false) {
    const task = this.queue.then(async () => {
      if (this.closed) return
      for (const source of this.sources) {
        const full = force || source.full
        const pending = source.pending
        source.full = false
        source.pending = new Set()
        if (!full && !pending.size) continue
        if (!full) {
          for (const path of pending) await this.syncPath(source, path)
          continue
        }
        const present = await this.ensureWatch(source)
        if (!present) { source.files.clear(); source.errors.clear(); continue }
        const seen = new Set()
        const errors = new Set()
        for await (const path of journals(source.path, errors)) {
          seen.add(path)
          await this.syncPath(source, path, force)
        }
        for (const path of source.files.keys()) if (!seen.has(path)) source.files.delete(path)
        for (const path of source.errors) if (!seen.has(path)) source.errors.delete(path)
        for (const path of errors) source.errors.add(path)
      }
    })
    this.queue = task.catch(() => {})
    return task
  }

  async snapshot(filter = {}, now) {
    await this.refresh(filter.refresh === true)
    const files = []
    const issues = { journals: 0, skipped: 0, unavailable: 0, watchers: 0 }
    for (const source of this.sources) {
      issues.unavailable += source.errors.size
      if (source.watchFailed) issues.watchers++
      for (const state of source.files.values()) {
        if (state.session) issues.journals++
        issues.skipped += state.skipped
        files.push(state)
      }
    }
    return aggregate(files, issues, filter, now ?? Date.now())
  }

  async close() {
    this.closed = true
    clearTimeout(this.timer)
    await this.queue
    for (const source of this.sources) source.watcher?.close()
    this.removeAllListeners()
  }
}
