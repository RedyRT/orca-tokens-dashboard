import { element } from './charts.js'

function duration(ms, lang) {
  const format = unit => new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short' })
  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60) % 24
  if (days) return [format('day').format(days), hours && format('hour').format(hours)].filter(Boolean).join(' ')
  if (hours) return [format('hour').format(hours), minutes % 60 && format('minute').format(minutes % 60)].filter(Boolean).join(' ')
  return format('minute').format(minutes)
}

export function mountQuota(host, root, currentLocale) {
  let snapshot, failed = false, pending = false, closed = false, timer
  const status = root.querySelector('[role="status"]')
  const body = root.querySelector('.quota-accounts')

  function render() {
    const { copy, full, percent, integer } = currentLocale()
    const lang = document.documentElement.lang
    const now = Date.now()
    const accounts = snapshot?.accounts
    status.textContent = failed ? accounts?.length ? copy.quotaStale : copy.quotaUnavailable
      : !accounts ? copy.quotaLoading : !accounts.length ? copy.quotaEmpty : snapshot.partial ? copy.quotaPartial : ''
    status.hidden = !status.textContent
    body.replaceChildren(...(accounts ?? []).map((account, index) => {
      const group = element('div', 'quota-account')
      const checked = element('p', 'muted', copy.quotaChecked(full(account.fetchedAt)))
      if (accounts.length > 1) group.append(element('strong', '', copy.quotaAccount(integer(index + 1))))
      group.append(checked)
      for (const { label, durationMs, remaining, resetsAt } of account.limits) {
        const name = Number.isFinite(durationMs) && durationMs > 0 && !label?.includes('(') ? duration(durationMs, lang) : label
        const row = element('div', 'quota-window')
        row.append(element('span', '', name))
        if (remaining === null) row.append(element('span', 'muted', copy.unknown))
        else {
          const meter = element('meter')
          meter.max = 1
          meter.value = remaining
          meter.setAttribute('aria-label', copy.quotaRemaining(name))
          row.append(meter, element('strong', '', percent(remaining * 100)))
        }
        if (Number.isFinite(resetsAt)) {
          const reset = element('span', 'muted', resetsAt > now ? copy.quotaResets(duration(resetsAt - now, lang)) : copy.quotaResetDue)
          reset.title = full(resetsAt)
          row.append(reset)
        }
        group.append(row)
      }
      if (account.credits?.count > 0) {
        const expires = account.credits.expirations.map(full).join(' · ')
        group.append(element('p', 'muted', copy.quotaCredits(integer(account.credits.count), expires)))
      }
      return group
    }))
  }

  async function refresh() {
    if (closed || pending) return
    clearTimeout(timer)
    pending = true
    try {
      snapshot = await host.plugin.request('quota.snapshot', {}, { timeoutMs: 20_000 })
      failed = false
    } catch { failed = true }
    finally { pending = false }
    if (closed) return
    render()
    if (!document.hidden) timer = setTimeout(refresh, 60_000)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer)
    else void refresh()
  })
  window.addEventListener('pagehide', () => { closed = true; clearTimeout(timer) }, { once: true })
  root.hidden = false
  void refresh()
  return { refresh, render }
}
