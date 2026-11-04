import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'

const { createReloadGate, watchAppUpdates } = await load('features/pwa/appUpdate')

class Workers extends EventTarget {
  controller = null
  claim(worker) {
    this.controller = worker
    this.dispatchEvent(new Event('controllerchange'))
  }
}

test('initial install does not reload and a subsequent activation reloads only once', async t => {
  const workers = new Workers()
  let reloaded = 0
  t.after(watchAppUpdates(workers, createReloadGate().check, () => reloaded++))
  const first = {}, next = {}
  workers.claim(first)
  await delay(5)
  assert.equal(reloaded, 0)
  workers.claim(next)
  workers.claim(next)
  await delay(5)
  workers.claim({})
  assert.equal(reloaded, 1)
})

test('an active worker can update a safe tab while an offline editing tab waits for local storage', async t => {
  const login = new Workers(), editor = new Workers()
  const old = {}, updated = {}
  login.claim(old)
  editor.claim(old)
  const gate = createReloadGate()
  let saved = false
  let loginReloads = 0, editorReloads = 0
  gate.register(() => saved ? () => saved : null)
  t.after(watchAppUpdates(login, createReloadGate().check, () => loginReloads++, 5))
  t.after(watchAppUpdates(editor, gate.check, () => editorReloads++, 5))
  login.claim(updated)
  editor.claim(updated)
  await delay(15)
  assert.equal(loginReloads, 1)
  assert.equal(editorReloads, 0)
  saved = true
  for (let i = 0; editorReloads === 0 && i < 20; i++) await delay(5)
  assert.equal(editorReloads, 1)
})

test('a newly mounted editor invalidates a readiness check already in flight', async () => {
  const gate = createReloadGate()
  const oldCheck = gate.check()
  gate.register(() => null)
  assert.equal((await oldCheck)(), false)
})
