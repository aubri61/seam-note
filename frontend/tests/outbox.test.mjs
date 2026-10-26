import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const { createOperation, planOperation, validateOperation } = await load('features/outbox/outboxModel')
const draft = { noteId: 'A', title: '', content: 'edited', baseTitle: '', baseContent: 'server', baseVersion: 2,
  latestServerVersion: 3, localRevision: 7, localSavedAt: 1, storageToken: 'token', writerId: 'writer' }

test('Outbox uses the server baseVersion, not localRevision or latest observed version', () => {
  const op = createOperation(draft)
  assert.equal(op.expectedVersion, 2); assert.equal(op.localRevision, 7); assert.equal(op.title, '')
  assert.equal(op.status, 'pending'); assert.equal(op.attemptedAt, null)
})
test('unsent coalescing creates a fresh operationId and leaves the old request snapshot untouched', () => {
  const old = createOperation(draft), snapshot = structuredClone(old)
  const plan = planOperation({ ...draft, content: 'latest', localRevision: 8 }, [old])
  assert.deepEqual(plan.remove, [old.operationId]); assert.notEqual(plan.add.operationId, old.operationId)
  assert.equal(plan.add.content, 'latest'); assert.deepEqual(old, snapshot)
})
test('clean revert removes only unsent work; uncertain predecessors require a compensating successor', () => {
  const op = createOperation(draft), clean = { ...draft, content: draft.baseContent, localRevision: 8 }
  assert.equal(planOperation(clean, [op]).add, null)
  const frozen = { ...op, status: 'inFlight', attemptedAt: op.createdAt }
  const plan = planOperation(clean, [frozen])
  assert.deepEqual(plan.remove, []); assert.equal(plan.add.content, draft.baseContent)
  assert.deepEqual(planOperation({ ...draft, localRevision: 8 }, [frozen]), { remove: [], add: null })
})
test('inFlight and conflict snapshots cannot be removed by coalescing', () => {
  for (const status of ['inFlight', 'conflict']) {
    const op = createOperation(draft), frozen = { ...op, status, attemptedAt: op.createdAt }
    const plan = planOperation({ ...draft, content: 'newer', localRevision: 8 }, [frozen])
    assert.deepEqual(plan.remove, []); assert.equal(plan.add.content, 'newer')
  }
})
test('a pending operation with a previous attempt is invalid, not eligible for silent replacement', () => {
  const op = createOperation(draft)
  assert.throws(() => validateOperation({ ...op, attemptedAt: op.createdAt }), /not supported/)
  assert.throws(() => planOperation(draft, [{ ...op, status: 'inFlight' }]), /not supported/)
})
