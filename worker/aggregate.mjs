const minute = 60_000
const periods = { '1h': [60, 1], '24h': [1440, 24], '7d': [10080, 180], '30d': [43200, 720] }
const add = (a, b) => b === null ? a : (a ?? 0) + b
const increment = (map, key, value = 1) => map.set(key, (map.get(key) ?? 0) + value)
const ranked = map => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))

function series(ranking, bins, field) {
  const values = ranked(ranking)
  const visible = values.length > 7 ? values.slice(0, 6) : values
  const charts = visible.map(([label, total]) => ({ label, total, values: bins.map(bin => bin[field].get(label) ?? null) }))
  if (visible.length < values.length) {
    const rest = new Set(visible.map(([key]) => key))
    charts.push({ other: true, total: values.slice(visible.length).reduce((sum, [, value]) => sum + value, 0),
      values: bins.map(bin => {
        let total = null
        for (const [key, value] of bin[field]) if (!rest.has(key)) total = add(total, value)
        return total
      }) })
  }
  return charts
}

function sessionKey({ agent, session }) { return JSON.stringify([agent, session]) }

export function aggregate(files, issues, filter, now) {
  const [spanMinutes, bucketMinutes] = Object.hasOwn(periods, filter.period) ? periods[filter.period] : periods['24h']
  const span = spanMinutes * minute
  const bucketMs = bucketMinutes * minute
  const sessions = new Map()
  for (const file of files) {
    if (!file.session) continue
    const key = sessionKey(file)
    const previous = sessions.get(key)
    // Prefer the most complete ledger; a copied backup can have a newer filesystem timestamp.
    if (!previous || file.rows > previous.rows || (file.rows === previous.rows && file.offset > previous.offset)) sessions.set(key, file)
  }
  const workspaces = new Set(), providers = new Set(), models = new Set()
  const matching = []
  let latest = null, nextAt = null
  let orphanResults = 0
  const deadline = at => { if (at > now && (nextAt === null || at < nextAt)) nextAt = at }
  const select = (entry, key, workspace, status = null) => {
    if (workspace !== null) workspaces.add(workspace)
    if (entry.provider !== null) providers.add(entry.provider)
    if (entry.model !== null) models.add(entry.model)
    if ((filter.workspace && filter.workspace !== workspace) || (filter.provider && filter.provider !== entry.provider) ||
      (filter.model && filter.model !== entry.model)) return
    if (entry.at > now) { deadline(entry.at); return }
    if (latest === null || entry.at > latest) latest = entry.at
    matching.push({ entry, key, status })
  }
  for (const [key, session] of sessions) {
    const { workspace, usage, results } = session
    const calls = new Set()
    for (const entry of usage.values()) {
      select(entry, key, workspace)
      for (const tool of entry.tools) {
        if (calls.has(tool.id)) continue
        calls.add(tool.id)
        select({ at: entry.at, provider: entry.provider, model: entry.model, name: tool.name }, key, workspace, results.get(tool.id) ?? 'unknown')
      }
    }
    for (const id of results.keys()) if (!calls.has(id)) orphanResults++
  }
  const clock = filter.anchor === 'now'
  const to = clock || latest === null ? now : latest + 1
  const from = to - span
  const start = Math.floor(from / bucketMs) * bucketMs
  const buckets = []
  for (let at = start; at < to; at += bucketMs) {
    buckets.push({ at, tokens: null, cost: null, input: null, output: null, cached: null, pairedInput: 0, pairedCache: 0,
      toolRanks: new Map(), tokenModels: new Map(), costModels: new Map() })
  }
  const totals = { tokens: null, cost: null, measurements: 0, tokenSamples: 0, costSamples: 0,
    sessions: 0, tools: 0, success: 0, failed: 0, responses: 0, auxiliary: 0 }
  const activeSessions = new Set(), modelSessions = new Map(), tokenModels = new Map(), costModels = new Map(), tools = new Map()
  for (const { entry, key, status } of matching) {
    if (entry.at >= to) { if (clock) deadline(entry.at + 1); continue }
    if (entry.at < from) continue
    if (clock) deadline(entry.at + span + 1)
    const bin = buckets[Math.floor((entry.at - start) / bucketMs)]
    activeSessions.add(key)
    if (!modelSessions.has(entry.model)) modelSessions.set(entry.model, new Set())
    modelSessions.get(entry.model).add(key)
    if (status) {
      totals.tools++
      if (status === 'success') totals.success++
      if (status === 'failed') totals.failed++
      increment(tools, entry.name)
      increment(bin.toolRanks, entry.name)
      continue
    }
    totals.measurements++
    if (entry.auxiliary) totals.auxiliary++
    else totals.responses++
    if (entry.tokens !== null) {
      totals.tokenSamples++
      totals.tokens = add(totals.tokens, entry.tokens)
      increment(tokenModels, entry.model, entry.tokens)
      increment(bin.tokenModels, entry.model, entry.tokens)
    }
    if (entry.cost !== null) {
      totals.costSamples++
      totals.cost = add(totals.cost, entry.cost)
      increment(costModels, entry.model, entry.cost)
      increment(bin.costModels, entry.model, entry.cost)
    }
    for (const metric of ['tokens', 'cost', 'input', 'output', 'cached']) bin[metric] = add(bin[metric], entry[metric])
    if (entry.input !== null && entry.cached !== null) { bin.pairedInput += entry.input; bin.pairedCache += entry.cached }
  }
  totals.sessions = activeSessions.size
  const modelRanking = ranked(new Map([...modelSessions].map(([model, ids]) => [model, ids.size])))
  const modelDistribution = modelRanking.slice(0, modelRanking.length > 7 ? 6 : 7).map(([label, total]) => ({ label, total }))
  if (modelRanking.length > 7) modelDistribution.push({ other: true, total: modelRanking.slice(6).reduce((sum, [, total]) => sum + total, 0) })
  return { from, to, bucketMs, nextAt, totals, issues: { ...issues, orphanResults }, modelDistribution,
    filters: { workspaces: options(workspaces, filter.workspace, 75), providers: options(providers, filter.provider, 75), models: options(models, filter.model, 75) },
    tokensByModel: series(tokenModels, buckets, 'tokenModels'), costByModel: series(costModels, buckets, 'costModels'),
    toolFrequency: series(tools, buckets, 'toolRanks'),
    buckets: buckets.map(({ at, tokens, cost, input, output, cached, pairedInput, pairedCache }) =>
      ({ at, tokens, cost, input, output, cached, cacheRate: pairedInput > 0 ? pairedCache / pairedInput * 100 : null })) }
}

function options(values, selected, limit) {
  const sorted = [...values].sort((a, b) => a.localeCompare(b))
  if (sorted.length <= limit) return sorted
  const visible = sorted.slice(0, limit)
  if (selected && values.has(selected) && !visible.includes(selected)) visible[limit - 1] = selected
  return visible
}
