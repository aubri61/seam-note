import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const { buildWorkspaceTree, firstNoteId, noteAncestors, visibleWorkspaceRows } = await load('features/workspace/workspaceTree')
const folder = (id, parentId = null, sortOrder = 0) => ({ id, parentId, sortOrder, name: id, version: 0, createdAt: '', updatedAt: '' })
const note = (id, folderId, sortOrder = 0) => ({ id, folderId, sortOrder, title: id, version: 0, updatedAt: '' })

test('folders precede notes and first note follows sorted depth-first display order', () => {
  const tree = buildWorkspaceTree({
    folders: [folder('later', null, 20), folder('nested', 'first', 10), folder('first', null, 0)],
    notes: [note('array-first', 'later'), note('root-note', 'first', 0), note('nested-note', 'nested', 100)],
  })
  assert.equal(firstNoteId(tree), 'nested-note')
  assert.deepEqual(tree.roots.map(x => x.folder.id), ['first', 'later'])
  assert.deepEqual(noteAncestors(tree, 'nested-note').map(x => x.id), ['first', 'nested'])
  assert.deepEqual(visibleWorkspaceRows(tree, { first: true, nested: true, later: true }).map(x => x.node.key),
    ['folder:first', 'folder:nested', 'note:nested-note', 'note:root-note', 'folder:later', 'note:array-first'])
})

test('equal sortOrder uses ID as a stable tie-breaker independent of array order', () => {
  const tree = buildWorkspaceTree({ folders: [folder('b'), folder('a')], notes: [note('z', 'a'), note('c', 'a')] })
  assert.deepEqual(tree.roots.map(x => x.folder.id), ['a', 'b'])
  assert.equal(firstNoteId(tree), 'c')
})

test('empty and folders-only workspaces have no first note', () => {
  assert.equal(firstNoteId(buildWorkspaceTree({ folders: [], notes: [] })), null)
  const tree = buildWorkspaceTree({ folders: [folder('a'), folder('b', 'a')], notes: [] })
  assert.equal(firstNoteId(tree), null)
  assert.deepEqual(noteAncestors(tree, null), [])
})

test('missing parents recover folders, orphan notes are excluded, and response is unchanged', () => {
  const data = { folders: [folder('a', 'missing')], notes: [note('valid', 'a'), note('orphan', 'missing')] }
  const original = structuredClone(data)
  Object.freeze(data.folders[0]); Object.freeze(data.notes[0]); Object.freeze(data.notes[1])
  Object.freeze(data.folders); Object.freeze(data.notes); Object.freeze(data)
  const tree = buildWorkspaceTree(data)
  assert.equal(tree.roots[0].folder.id, 'a')
  assert.equal(firstNoteId(tree), 'valid')
  assert.equal(tree.issues.length, 2)
  assert.deepEqual(data, original)
})

test('cycles and self-parenting cannot recurse forever and are broken deterministically', () => {
  const tree = buildWorkspaceTree({
    folders: [folder('b', 'a'), folder('a', 'b'), folder('self', 'self')],
    notes: [note('n', 'b')],
  })
  assert.deepEqual(tree.roots.map(x => x.folder.id), ['a', 'self'])
  assert.equal(firstNoteId(tree), 'n')
  assert.deepEqual(noteAncestors(tree, 'n').map(x => x.id), ['a', 'b'])
  assert.equal(tree.issues.length, 2)
})

test('duplicate IDs are contained and Folder/Note can share a UUID without sharing view keys', () => {
  const tree = buildWorkspaceTree({ folders: [folder('same'), folder('same')], notes: [note('same', 'same'), note('same', 'same')] })
  assert.equal(tree.notes.size, 1)
  assert.equal(tree.folders.size, 1)
  assert.equal(tree.issues.length, 2)
  assert.notEqual(tree.roots[0].key, tree.roots[0].children[0].key)
})

test('deep nesting uses no recursive call stack', () => {
  const folders = Array.from({ length: 5000 }, (_, i) => folder(String(i), i ? String(i - 1) : null))
  const tree = buildWorkspaceTree({ folders, notes: [note('deep', '4999')] })
  assert.equal(firstNoteId(tree), 'deep')
  assert.equal(noteAncestors(tree, 'deep').length, 5000)
  assert.equal(visibleWorkspaceRows(tree, Object.fromEntries(folders.map(x => [x.id, true]))).length, 5001)
})

test('collapse and title search operate locally, retaining matching ancestors', () => {
  const tree = buildWorkspaceTree({ folders: [folder('a'), folder('b', 'a')], notes: [note('target', 'b')] })
  assert.equal(visibleWorkspaceRows(tree, {}).length, 1)
  assert.deepEqual(visibleWorkspaceRows(tree, {}, 'target').map(x => x.node.key), ['folder:a', 'folder:b', 'note:target'])
  assert.deepEqual(visibleWorkspaceRows(tree, {}, 'missing'), [])
})
