import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/loadModules.mjs'
const { readFolderExpansion, writeFolderExpansion, folderExpansionKey } = await load('features/folders/folderExpansion')

test('folder preferences distinguish missing/corrupt settings from explicitly collapsed []', () => {
  let raw = null
  globalThis.localStorage = { getItem: () => raw, setItem: (key, value) => { assert.equal(key, folderExpansionKey); raw = value } }
  assert.equal(readFolderExpansion(), null)
  for (raw of ['{', 'null', '{}', '[2]', '[""]']) assert.equal(readFolderExpansion(), null)
  raw = '[]'
  assert.deepEqual(readFolderExpansion(), {})
  raw = '["parent","deleted-folder","parent"]'
  assert.deepEqual(readFolderExpansion(), { parent: true, 'deleted-folder': true })
  writeFolderExpansion({ parent: false, child: true, new: true })
  assert.equal(raw, '["child","new"]')
  assert.deepEqual(readFolderExpansion(), { child: true, new: true })
  writeFolderExpansion({ child: false })
  assert.equal(raw, '[]')
  delete globalThis.localStorage
})

test('blocked and unavailable localStorage never break folder state', () => {
  assert.equal(readFolderExpansion(), null)
  assert.doesNotThrow(() => writeFolderExpansion({ folder: true }))
  globalThis.localStorage = { getItem: () => '["folder"]', setItem() { throw new Error('QuotaExceededError') } }
  assert.deepEqual(readFolderExpansion(), { folder: true })
  assert.doesNotThrow(() => writeFolderExpansion({ folder: false }))
  delete globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError') } })
  assert.equal(readFolderExpansion(), null)
  assert.doesNotThrow(() => writeFolderExpansion({ folder: true }))
  delete globalThis.localStorage
})
