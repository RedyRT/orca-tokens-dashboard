import { color, donut, element, timeChart } from './charts.js'
import { locale } from './locale.js'

const host = globalThis.orca
const $ = id => document.getElementById(id)
const status = $('status')
const controls = { period: '24h', workspace: '', provider: '', model: '' }
const plotState = new Map()
let snapshot, deadline, inFlight = false, pending = false, force = false, failed = false, closed = false
let l = locale('en')
let dragging = null, deferred = null

function endDrag(event) {
  if (dragging === null || (event.pointerId != null && event.pointerId !== dragging)) return
  dragging = null
  if (deferred && !failed && !closed) render(deferred)
  deferred = null
}

function chartState(id) {
  if (!plotState.has(id)) plotState.set(id, {})
  return plotState.get(id)
}

function setStatus(text, error = false) {
  status.textContent = text
  status.classList.toggle('error', error)
}

function filter(id, placeholder, values) {
  const select = $(id)
  const all = element('option', '', placeholder)
  all.value = ''
  const options = values.map(value => {
    const option = element('option', '', value)
    option.value = value
    return option
  })
  if (controls[id] && !values.includes(controls[id])) {
    const previous = element('option', '', controls[id])
    previous.value = controls[id]
    options.unshift(previous)
  }
  select.replaceChildren(all, ...options)
  select.value = controls[id]
  select.disabled = false
}

function render(data) {
  const { copy, integer, money, compact, full, percent } = l = locale(data.language)
  document.documentElement.lang = data.language
  for (const node of document.querySelectorAll('[data-copy]')) node.textContent = copy[node.dataset.copy]
  document.querySelector('h1').textContent = copy.title
  document.querySelector('.subtitle').textContent = copy.subtitle
  $('periods').setAttribute('aria-label', copy.period)
  $('language').value = data.language
  filter('workspace', copy.allWorkspaces, data.filters.workspaces)
  filter('provider', copy.allProviders, data.filters.providers)
  filter('model', copy.allModels, data.filters.models)
  const { totals, issues, buckets, from, to, bucketMs } = data
  if (issues.unavailable || issues.watchers) setStatus(copy.incomplete, true)
  else setStatus(!issues.journals ? copy.empty : totals.sessions ? copy.active : `${copy.active} · ${copy.noEvents}`)
  const range = `${full(from)} — ${full(to)}`
  $('range').textContent = `${range} · ${copy.local} · ${copy[data.anchor]} · ${copy.minutes(integer(bucketMs / 60000))}`
  const coverage = $('coverage')
  coverage.hidden = false
  const notes = [copy.coverageSource, copy.coverageTimestamp, copy.coverageSessions, copy.calls(integer(totals.responses), integer(totals.auxiliary))]
  for (const [field, message] of [['unavailable', 'readIssues'], ['watchers', 'watcherIssues'], ['skipped', 'skipped'], ['orphanResults', 'unlinked']]) {
    if (issues[field]) notes.push(copy[message](integer(issues[field])))
  }
  coverage.querySelector('ul').replaceChildren(...notes.map(note => element('li', '', note)))
  const kpis = element('div', 'grid kpis')
  const measurementCount = integer(totals.measurements)
  for (const [title, value, hint] of [
    [copy.cost, totals.cost === null ? copy.noData : money(totals.cost), `${copy.reported} · ${copy.measurements(integer(totals.costSamples), measurementCount)}`],
    [copy.tokens, totals.tokens === null ? copy.noData : integer(totals.tokens), `${copy.tokenHint} · ${copy.measurements(integer(totals.tokenSamples), measurementCount)}`],
    [copy.sessions, integer(totals.sessions), copy.sessionHint],
    [copy.tools, integer(totals.tools), copy.toolsHint(integer(totals.success), integer(totals.failed))],
  ]) {
    const card = element('section', 'panel kpi')
    card.append(element('h2', '', title), element('strong', '', value), element('p', 'muted', hint))
    kpis.append(card)
  }
  const row = (label, total, index) => ({ label, total, color: color(index) })
  const categories = groups => groups.map((item, i) => ({ ...item, color: color(i), label: item.other ? copy.other : item.label ?? copy.unknown }))
  const rings = element('div', 'grid three')
  rings.append(
    donut('outcomes', copy.outcomes, [row(copy.successes, totals.success, 2), row(copy.failed, totals.failed, 1), row(copy.unknown, totals.tools - totals.success - totals.failed, 6)], l, chartState('outcomes')),
    donut('tools', copy.usage, categories(data.toolFrequency), l, chartState('tools')),
    donut('models', copy.models, categories(data.modelDistribution), l, chartState('models')),
  )
  const metric = (name, field, index) => ({ label: copy[name], values: buckets.map(bucket => bucket[field]), color: color(index) })
  const plots = element('div', 'grid two')
  const draw = (id, title, series, style, format, axisFormat, ceiling) => plots.append(timeChart({
    id, title: copy[title], series, style, format, axisFormat, ceiling, snapshot: data, locale: l, state: chartState(id),
  }))
  draw('tokens', 'tokensTime', [metric('tokens', 'tokens', 0)], 'line', integer, compact)
  draw('cost', 'costTime', [metric('cost', 'cost', 1)], 'line', money)
  draw('types', 'tokenTypes', [metric('input', 'input', 4), metric('output', 'output', 2), metric('cached', 'cached', 5)], 'bars', integer, compact)
  draw('token-model', 'tokensModel', categories(data.tokensByModel), 'bars', integer, compact)
  draw('cost-model', 'costModel', categories(data.costByModel), 'bars', money)
  draw('cache', 'cache', [metric('cacheRate', 'cacheRate', 5)], 'line', percent, percent, 100)
  draw('tool-time', 'toolTime', categories(data.toolFrequency), 'bars', integer, compact)
  const charts = $('charts')
  const focused = document.activeElement?.dataset.focusKey
  charts.replaceChildren(kpis, rings, plots)
  if (focused) [...charts.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focused)?.focus({ preventScroll: true })
}

async function refresh(explicit = false) {
  if (closed) return
  pending = true
  force ||= explicit
  if (inFlight) return
  inFlight = true
  clearTimeout(deadline)
  try {
    while (pending && !closed) {
      pending = false
      const input = { ...controls, refresh: force }
      force = false
      try {
        const data = await host.plugin.request('history.snapshot', input, { timeoutMs: 120000 })
        if (closed) return
        if (input.period !== controls.period || input.workspace !== controls.workspace || input.provider !== controls.provider || input.model !== controls.model) continue
        snapshot = data
        failed = false
        if (dragging === null) render(data)
        else deferred = data
      } catch {
        failed = true
        setStatus(`${l.copy.error}${snapshot ? ` ${l.copy.stale}` : ''}`, true)
      } finally { $('language').disabled = !snapshot }
    }
  } finally { inFlight = false }
  if (!failed && snapshot?.nextAt !== null && snapshot?.nextAt !== undefined) {
    deadline = setTimeout(refresh, Math.max(1, Math.min(2_147_483_647, snapshot.nextAt - Date.now())))
  }
}

if (!host) {
  setStatus(l.copy.unavailable, true)
  $('refresh').disabled = true
} else {
  const subscription = host.plugin.on('history.changed', () => void refresh())
  $('charts').addEventListener('pointerdown', event => {
    if (event.target.matches('input[type="range"]')) dragging = event.pointerId
  })
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('blur', endDrag)
  $('refresh').addEventListener('click', () => void refresh(true))
  $('language').addEventListener('change', async event => {
    const select = event.currentTarget
    select.disabled = true
    try {
      await host.settings.set('language', select.value)
      await refresh()
    } catch {
      select.value = snapshot?.language ?? 'en'
      setStatus(l.copy.settingsError, true)
    } finally { select.disabled = !snapshot }
  })
  for (const id of ['workspace', 'provider', 'model']) {
    $(id).addEventListener('change', event => { controls[id] = event.currentTarget.value; void refresh() })
  }
  $('periods').addEventListener('click', event => {
    const button = event.target.closest('button[data-period]')
    if (!button || controls.period === button.dataset.period) return
    controls.period = button.dataset.period
    for (const option of $('periods').children) option.setAttribute('aria-pressed', String(option === button))
    void refresh()
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh() })
  window.addEventListener('pagehide', () => { closed = true; clearTimeout(deadline); subscription.dispose() }, { once: true })
  void refresh()
}
