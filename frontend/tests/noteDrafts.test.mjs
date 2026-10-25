import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const { receiveServerNote, editDraft, isDraftDirty, hasDirtyDrafts, draftStatus } = await load('features/notes/noteDrafts')
const { protectUnsavedDrafts } = await load('features/notes/draftNavigation')
const note = (id = 'A', version = 2, title = '첫 원고', content = '서버 본문') => ({
  id, version, title, content, folderId: 'folder', sortOrder: 0,
  createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z',
})

test('first server snapshot creates an independent clean Draft with matching baseVersion', () => {
  const server = Object.freeze(note())
  const drafts = receiveServerNote({}, server)
  assert.deepEqual(drafts.A, {
    noteId: 'A', title: server.title, content: server.content,
    baseVersion: 2, baseTitle: server.title, baseContent: server.content, latestServerVersion: 2,
  })
  assert.notEqual(drafts.A, server)
  assert.equal(isDraftDirty(drafts.A), false)
})

test('editing title and body leaves server, baseline and other drafts unchanged', () => {
  const server = Object.freeze(note())
  const before = receiveServerNote(receiveServerNote({}, server), note('B'))
  const drafts = editDraft(before, 'A', { title: '수정 제목', content: '작성 중' })
  assert.equal(isDraftDirty(drafts.A), true)
  assert.equal(drafts.A.baseVersion, 2)
  assert.equal(drafts.A.baseTitle, '첫 원고')
  assert.equal(drafts.A.baseContent, '서버 본문')
  assert.equal(drafts.B, before.B)
  assert.equal(before.A.title, '첫 원고')
  assert.equal(server.content, '서버 본문')
})

test('empty title/body are real draft values; display placeholders never enter the model', () => {
  const drafts = editDraft(receiveServerNote({}, note()), 'A', { title: '', content: '' })
  assert.equal(drafts.A.title, '')
  assert.equal(drafts.A.content, '')
  assert.equal(isDraftDirty(drafts.A), true)
})

test('200 UTF-16 title units accepted; 201 rejected at the editing boundary', () => {
  const drafts = editDraft(receiveServerNote({}, note()), 'A', { title: '가'.repeat(200) })
  assert.equal(drafts.A.title.length, 200)
  assert.equal(editDraft(drafts, 'A', { title: '가'.repeat(201) }), drafts)
  assert.equal(editDraft(drafts, 'missing', { content: 'no phantom draft' }), drafts)
})

test('A → B → A server selection preserves both independently edited Drafts', () => {
  let drafts = editDraft(receiveServerNote({}, note()), 'A', { content: 'A 초안' })
  drafts = editDraft(receiveServerNote(drafts, note('B')), 'B', { content: 'B 초안' })
  drafts = receiveServerNote(drafts, note())
  assert.equal(drafts.A.content, 'A 초안')
  assert.equal(drafts.B.content, 'B 초안')
})

test('newer server response never overwrites dirty content or silently rebases it', () => {
  let drafts = editDraft(receiveServerNote({}, note()), 'A', { title: '미저장', content: '내 원고' })
  drafts = receiveServerNote(drafts, note('A', 4, '서버 변경', '원격 원고'))
  assert.equal(drafts.A.title, '미저장')
  assert.equal(drafts.A.content, '내 원고')
  assert.equal(drafts.A.baseVersion, 2)
  assert.equal(drafts.A.baseTitle, '첫 원고')
  assert.equal(drafts.A.latestServerVersion, 4)
  assert.equal(isDraftDirty(drafts.A), true)
  assert.equal(receiveServerNote(drafts, note('A', 3)), drafts)
})

test('clean draft accepts strictly newer snapshots and rejects late older/same-version changes', () => {
  let drafts = receiveServerNote({}, note())
  drafts = receiveServerNote(drafts, note('A', 4, '최신', '최신 본문'))
  assert.equal(drafts.A.baseVersion, 4)
  assert.equal(drafts.A.title, '최신')
  assert.equal(isDraftDirty(drafts.A), false)
  assert.equal(receiveServerNote(drafts, note('A', 3)), drafts)
  assert.equal(receiveServerNote(drafts, note('A', 4, '모순된 동일 버전')), drafts)
})

test('reverting to baseline clears dirty without lowering the highest observed server version', () => {
  let drafts = editDraft(receiveServerNote({}, note()), 'A', { content: '편집' })
  drafts = receiveServerNote(drafts, note('A', 5, '서버', '서버 5'))
  drafts = editDraft(drafts, 'A', { content: '서버 본문' })
  assert.equal(isDraftDirty(drafts.A), false)
  assert.equal(drafts.A.baseVersion, 2)
  assert.equal(receiveServerNote(drafts, note('A', 3)), drafts)
  drafts = receiveServerNote(drafts, note('A', 5, '서버', '서버 5'))
  assert.equal(drafts.A.baseVersion, 5)
  assert.equal(drafts.A.content, '서버 5')
})

test('late data is keyed by ID, never assigned to the currently selected draft', () => {
  let drafts = receiveServerNote({}, note('B', 6, 'B 제목', 'B 본문'))
  drafts = editDraft(drafts, 'B', { content: 'B 작성' })
  drafts = receiveServerNote(drafts, note('A', 2, 'A 늦은 응답', 'A 본문'))
  assert.equal(drafts.B.content, 'B 작성')
  assert.equal(drafts.A.content, 'A 본문')
})

test('POST-created blank Note initializes an empty clean Draft at server version zero', () => {
  const drafts = receiveServerNote({}, note('new', 0, '', ''))
  assert.equal(drafts.new.title, '')
  assert.equal(drafts.new.content, '')
  assert.equal(drafts.new.baseVersion, 0)
  assert.equal(isDraftDirty(drafts.new), false)
})

test('dirty detection includes non-selected drafts and clears when all changes are reverted', () => {
  let drafts = receiveServerNote(receiveServerNote({}, note()), note('B'))
  assert.equal(hasDirtyDrafts(drafts), false)
  drafts = editDraft(drafts, 'A', { title: '새 제목' })
  assert.equal(hasDirtyDrafts(drafts), true)
  drafts = editDraft(drafts, 'A', { title: '첫 원고' })
  assert.equal(hasDirtyDrafts(drafts), false)
  assert.equal(editDraft(drafts, 'A', { title: '첫 원고' }), drafts)
})

test('beforeunload listener requests warning and cleanup removes the exact listener', () => {
  let listener = null
  const target = {
    addEventListener(type, callback) { assert.equal(type, 'beforeunload'); listener = callback },
    removeEventListener(type, callback) { assert.equal(type, 'beforeunload'); assert.equal(listener, callback); listener = null },
  }
  const cleanup = protectUnsavedDrafts(target)
  const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true } }
  listener(event)
  assert.equal(event.prevented, true)
  assert.equal(event.returnValue, '')
  cleanup()
  assert.equal(listener, null)
})

test('status reports only clean, unsaved, loading and query failure without persistence claims', () => {
  const clean = receiveServerNote({}, note())
  const dirty = editDraft(clean, 'A', { content: '' })
  assert.equal(draftStatus(clean.A, false, null), '변경사항 없음')
  assert.equal(draftStatus(dirty.A, false, null), '저장되지 않은 변경사항')
  assert.equal(draftStatus(dirty.A, true, null), '원고 로딩 중')
  assert.equal(draftStatus(dirty.A, false, Error('failed')), '원고 조회 실패')
})
