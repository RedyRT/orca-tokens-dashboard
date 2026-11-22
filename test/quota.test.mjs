import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuota } from '../worker/quota.mjs'

test('exhausted windows remain visible without exposing account identifiers', () => {
  const report = { fetchedAt: 1_800_000_000_000, metadata: { email: 'private@example.org' }, limits: [{ label: '7 days', window: { durationMs: 604800000, resetsAt: 1_800_000_003_000 }, amount: { remainingFraction: 0 } }], resetCredits: { availableCount: 1, credits: [{ status: 'available', expiresAt: '2027-08-01T00:00:00Z' }] } }
  const [account] = parseQuota(JSON.stringify({ reports: [report] })).accounts
  assert.equal(account.limits[0].remaining, 0)
  assert.equal(account.limits[0].resetsAt, 1_800_000_003_000)
  assert.equal(account.credits.count, 1)
  assert.deepEqual(account.credits.expirations, [Date.parse('2027-08-01T00:00:00Z')])
  assert.doesNotMatch(JSON.stringify(account), /private@example.org/)
})

test('malformed or failed reports do not clear the last known quotas as if no accounts exist', () => {
  for (const input of ['{}', '{"reports":[{}]}', '{"reports":[],"accountsWithoutUsage":[{}]}']) assert.throws(() => parseQuota(input))
  assert.deepEqual(parseQuota('{"reports":[]}'), { accounts: [], partial: false })
})

test('a partial result retains healthy accounts, unknown windows and reset expirations', () => {
  const expiresAt = '2027-08-01T00:00:00Z'
  const report = { fetchedAt: 1_800_000_000_000, limits: [{ label: '5 hours (Spark)', window: { durationMs: 18000000 } }],
    resetCredits: { availableCount: 1, credits: [{ expiresAt }] } }
  const result = parseQuota(JSON.stringify({ reports: [report], accountsWithoutUsage: [{}] }))
  assert.equal(result.partial, true)
  assert.equal(result.accounts[0].limits[0].remaining, null)
  assert.equal(result.accounts[0].limits[0].label, '5 hours (Spark)')
  assert.deepEqual(result.accounts[0].credits.expirations, [Date.parse(expiresAt)])
  assert.throws(() => parseQuota(JSON.stringify({ reports: [{ ...report, fetchedAt: 9e15 }] })))
})
