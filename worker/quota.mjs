import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const validDate = n => Number.isFinite(n) && Math.abs(n) <= 8.64e15

export function parseQuota(stdout) {
  const { reports, accountsWithoutUsage } = JSON.parse(stdout)
  const partial = Boolean(accountsWithoutUsage?.length)
  if (!Array.isArray(reports) || (partial && !reports.length)) throw Error('Codex quota unavailable')
  const accounts = reports.map(({ fetchedAt, limits, resetCredits }) => {
    if (!validDate(fetchedAt) || !Array.isArray(limits) || !limits.length) throw Error('Invalid Codex quota report')
    return {
      fetchedAt,
      limits: limits.map(({ label, window, amount }) => {
        const remaining = amount?.remainingFraction
        if (remaining != null && (!Number.isFinite(remaining) || remaining < 0 || remaining > 1)) throw Error('Invalid Codex quota window')
        return { label, durationMs: window?.durationMs, resetsAt: validDate(window?.resetsAt) ? window.resetsAt : null, remaining: remaining ?? null }
      }),
      credits: resetCredits && {
        count: resetCredits.availableCount,
        expirations: (resetCredits.credits ?? []).filter(credit => !credit.status || credit.status === 'available')
          .map(credit => Date.parse(credit.expiresAt)).filter(Number.isFinite).sort((a, b) => a - b)
      }
    }
  })
  return { accounts, partial }
}

let pending
export function readQuota() {
  return pending ??= exec('omp', ['usage', '--provider', 'openai-codex', '--json', '--no-extensions'], {
    timeout: 15_000, maxBuffer: 512 * 1024, windowsHide: true
  }).then(({ stdout }) => parseQuota(stdout)).catch(() => {
    // Child errors can include unfiltered account data in stdout/stderr.
    throw Error('Codex quota unavailable')
  }).finally(() => { pending = undefined })
}
