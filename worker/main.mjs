import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { History } from './history.mjs'

let history
let subscription
let rootsKey
let update = Promise.resolve()

export default function activate(orca) {
  const changed = () => orca.panels.post('history.changed', {})
  const readSettings = () => orca.host.call('settings.get', {}).then(({ settings }) => settings)

  function configure(settings) {
    const roots = [['omp', settings.ompDirectory], ['pi', settings.piDirectory]].map(([agent, directory]) => {
      const path = typeof directory === 'string' && directory.trim() || join(homedir(), `.${agent}`, 'agent', 'sessions')
      if (!isAbsolute(path)) throw Error('Session folders must use absolute paths.')
      return { agent, path: resolve(path) }
    })
    if (roots[0].path.toLowerCase() === roots[1].path.toLowerCase()) throw Error('OMP and Pi session folders must be different.')
    const key = JSON.stringify(roots)
    const job = update.then(async () => {
      if (key !== rootsKey) {
        await history?.close()
        history = new History(roots)
        history.on('changed', changed)
        rootsKey = key
      }
      return history
    })
    update = job.then(() => {}, () => {})
    return job
  }

  orca.panels.handle('history.snapshot', async (input, { signal }) => {
    const settings = await readSettings()
    const source = await configure(settings)
    signal.throwIfAborted()
    const data = await source.snapshot({ ...input, anchor: settings.anchor })
    signal.throwIfAborted()
    return { ...data, language: settings.language === 'ru' ? 'ru' : 'en', anchor: settings.anchor === 'now' ? 'now' : 'activity' }
  })
  subscription = orca.settings.onDidChange(changed)
}

export async function deactivate() {
  subscription?.dispose()
  await update
  await history?.close()
  history = undefined
  rootsKey = undefined
}
