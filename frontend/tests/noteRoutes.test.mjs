import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const { resolveNoteRoute, notePath, missingNoteError, NoteRouteError } = await load('app/routing/noteRoutes')
const id = '09abcdef-1234-4678-9abc-0123456789ab'

test('home has no selected ID; first-note redirection belongs to loaded workspace policy', () => {
  assert.deepEqual(resolveNoteRoute('/'), { home: true, noteId: null, error: null })
})
test('note routes use canonical UUID IDs without assuming UUID version four', () => {
  assert.equal(resolveNoteRoute(notePath(id), id).noteId, id)
  assert.equal(resolveNoteRoute(notePath(id.toUpperCase()), id.toUpperCase()).noteId, id)
  assert.equal(resolveNoteRoute('/notes/00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000').error, null)
})
test('bad UUID routes cannot become selection IDs or accidentally request a fallback note', () => {
  for (const value of ['bad', '', '../notes', '09abcdef123446789abc0123456789ab', id + 'x', '<script>']) {
    const route = resolveNoteRoute('/notes/' + value, value)
    assert.equal(route.noteId, null)
    assert.equal(route.home, false)
    assert.ok(route.error instanceof NoteRouteError)
    assert.equal(route.error.status, 400)
  }
})
test('unknown paths return 404 and never enter home redirect policy', () => {
  for (const path of ['/folders/abc', '/notes', '/notes/a/extra', '/other']) {
    const route = resolveNoteRoute(path)
    assert.equal(route.home, false)
    assert.equal(route.noteId, null)
    assert.equal(route.error.status, 404)
  }
})
test('missing workspace/server notes have explicit 404 messages; path segments are encoded', () => {
  assert.equal(missingNoteError().status, 404)
  assert.match(missingNoteError().message, /원고를 찾을 수 없습니다/)
  assert.equal(notePath(id), '/notes/' + id)
  assert.equal(notePath('a/b'), '/notes/a%2Fb')
})
