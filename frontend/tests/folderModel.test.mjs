import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

// Exercise the actual pure TypeScript model without adding a test runtime dependency.
const source = readFileSync(new URL('../src/features/folders/folderModel.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } })
const { buildTree, getCreationParent, getAncestors, moveItems, matchesSearch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const item = (id, parentId = null, kind = 'document') => ({ id, parentId, kind, title: id, content: `content:${id}` })
const seed = () => [item('folder', null, 'folder'), item('a', 'folder'), item('b', 'folder'), item('c', 'folder'), item('other', null, 'folder')]

test('creates beside the active document, including root documents', () => {
  assert.equal(getCreationParent(seed(), 'b'), 'folder')
  assert.equal(getCreationParent([item('root')], 'root'), null)
})
test('a selected folder takes priority over the document open in the editor', () => {
  assert.equal(getCreationParent(seed(), 'other', 'a'), 'other')
})
test('a newly selected nested folder becomes the next creation destination', () => {
  const items = [...seed(), item('new-folder', 'other', 'folder')]
  assert.equal(getCreationParent(items, 'new-folder', 'a'), 'new-folder')
})
test('uses the selected document parent and falls back for a missing selection', () => {
  const items = [...seed(), item('elsewhere', 'other')]
  assert.equal(getCreationParent(items, 'elsewhere', 'a'), 'other')
  assert.equal(getCreationParent(items, 'missing', 'a'), 'folder')
})
test('same-folder drop index accounts for dragged rows before the slot', () => {
  const original = seed()
  const moved = moveItems(original, ['a'], 'folder', 2)
  assert.deepEqual(buildTree(moved)[0].children.map(node => node.id), ['b', 'a', 'c'])
  assert.deepEqual(buildTree(original)[0].children.map(node => node.id), ['a', 'b', 'c'])
})
test('cross-folder move preserves document content and creation location follows it', () => {
  const moved = moveItems(seed(), ['a'], 'other', 0)
  assert.equal(getCreationParent(moved, 'a'), 'other')
  assert.equal(moved.find(node => node.id === 'a').content, 'content:a')
  assert.deepEqual(getAncestors(moved, 'a').map(node => node.id), ['other'])
})
test('repeated document moves use the latest parent, including the root', () => {
  const original = seed()
  const moved = moveItems(original, ['a'], 'other', 0)
  const movedAgain = moveItems(moved, ['a'], null, 0)
  assert.equal(getCreationParent(movedAgain, 'a', 'b'), null)
  assert.deepEqual(getAncestors(movedAgain, 'a'), [])
  assert.equal(original.find(node => node.id === 'a').parentId, 'folder')
  assert.equal(moved.find(node => node.id === 'a').parentId, 'other')
  assert.equal(movedAgain.find(node => node.id === 'a').content, 'content:a')
})
test('a moved folder stays the creation destination and updates descendant paths', () => {
  const items = [...seed(), item('nested', 'folder', 'folder'), item('draft', 'nested')]
  const moved = moveItems(items, ['nested'], 'other', 0)
  assert.equal(getCreationParent(moved, 'nested', 'a'), 'nested')
  assert.equal(getCreationParent(moved, 'draft', 'a'), 'nested')
  assert.deepEqual(getAncestors(moved, 'draft').map(node => node.id), ['other', 'nested'])
})
test('folder moves preserve descendants', () => {
  const moved = moveItems(seed(), ['folder'], 'other', 0)
  assert.deepEqual(getAncestors(moved, 'b').map(node => node.id), ['other', 'folder'])
})
test('rejects moving a folder into itself or its descendants', () => {
  const items = [...seed(), item('nested', 'folder', 'folder')]
  assert.equal(moveItems(items, ['folder'], 'folder', 0), items)
  assert.equal(moveItems(items, ['folder'], 'nested', 0), items)
})
test('rejects documents as drop destinations', () => {
  const items = seed()
  assert.equal(moveItems(items, ['c'], 'a', 0), items)
})
test('supports root drops and insertion before existing destination children', () => {
  const moved = moveItems(seed(), ['b'], null, 1)
  assert.deepEqual(buildTree(moved).map(node => node.id), ['folder', 'b', 'other'])
})
test('search matches body and untitled display names consistently', () => {
  assert.equal(matchesSearch({ ...item('empty'), title: '', content: '' }, '제목 없는'), true)
  assert.equal(matchesSearch({ ...item('a'), content: 'Draft Content' }, '  draft  '), true)
  assert.equal(matchesSearch(item('a'), 'missing'), false)
})
