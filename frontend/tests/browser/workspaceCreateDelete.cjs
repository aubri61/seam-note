// All API requests are intercepted. This script never writes to the development backend.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const stamp = '2026-10-25T00:00:00Z'
const root = { id: '00000000-0000-4000-8000-000000000001', parentId: null, name: '기존 폴더', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const a = { id: '00000000-0000-4000-8000-000000000002', folderId: root.id, title: 'A', content: 'body:A', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const b = { ...a, id: '00000000-0000-4000-8000-000000000003', title: 'B', content: 'body:B', sortOrder: 1 }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, message) { for (let i = 0; i < 150; i++) { if (await check()) return; await pause(20) } throw new Error(message) }
// A modal correctly aria-hides the background; inspect DOM state without querying hidden roles.
const editorId = page => page.locator('[aria-label="노트 편집기"]').getAttribute('data-note-id')
function ordered(state) {
  const compare = (x, y) => x.sortOrder - y.sortOrder || x.id.localeCompare(y.id)
  const ids = []
  const visit = folder => {
    state.folders.filter(f => f.parentId === folder.id).sort(compare).forEach(visit)
    state.notes.filter(n => n.folderId === folder.id).sort(compare).forEach(n => ids.push(n.id))
  }
  state.folders.filter(f => f.parentId === null).sort(compare).forEach(visit)
  return ids
}
async function install(page, single = false) {
  const state = { folders: [structuredClone(root)], notes: structuredClone(single ? [a] : [a, b]), notePosts: [], folderPosts: [], renames: [], deletes: [], metadata: 0, failNote: false, failFolder: false, failRename: false, failDelete: false, loseResponse: false }
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const failed = () => route.fulfill({ status: 500, json: { code: 'DATA_CONFLICT', message: 'mock 요청 실패', errors: [] } })
    if (method === 'GET' && path === '/api/workspace/tree') {
      state.metadata++
      return route.fulfill({ json: { folders: state.folders, notes: state.notes.map(({ content, createdAt, ...summary }) => summary) } })
    }
    if (method === 'GET' && path.startsWith('/api/notes/')) {
      const note = state.notes.find(n => n.id === path.split('/').pop())
      return route.fulfill(note ? { json: note } : { status: 404, json: { code: 'NOTE_NOT_FOUND', message: '원고 없음', errors: [] } })
    }
    if (method === 'POST' && path === '/api/notes') {
      const body = request.postDataJSON(); state.notePosts.push(body)
      assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      assert.equal(body.title, ''); assert.equal(body.content, '')
      assert.ok(state.folders.some(f => f.id === body.folderId))
      await pause(180)
      if (state.failNote) return failed()
      if (state.notes.some(note => note.id === body.id)) return route.fulfill({ status: 409, json: { code: 'DUPLICATE_ENTITY_ID', message: '이미 사용 중인 ID', errors: [] } })
      const note = { ...body, sortOrder: Math.max(-1, ...state.notes.filter(n => n.folderId === body.folderId).map(n => n.sortOrder)) + 1, version: 0, createdAt: stamp, updatedAt: stamp }
      state.notes.push(note)
      if (state.loseResponse) return route.abort('failed')
      return route.fulfill({ status: 201, json: note })
    }
    if (method === 'POST' && path === '/api/folders') {
      const body = request.postDataJSON(); state.folderPosts.push(body)
      await pause(120)
      if (state.failFolder) return failed()
      const folder = { ...body, sortOrder: Math.max(-1, ...state.folders.filter(f => f.parentId === body.parentId).map(f => f.sortOrder)) + 1, version: 0, createdAt: stamp, updatedAt: stamp }
      state.folders.push(folder)
      return route.fulfill({ status: 201, json: folder })
    }
    if (method === 'PATCH' && path.startsWith('/api/folders/')) {
      const body = request.postDataJSON(), id = path.split('/').pop()
      state.renames.push({ id, ...body })
      if (state.failRename) return failed()
      const folder = state.folders.find(f => f.id === id)
      assert.ok(folder); assert.deepEqual(Object.keys(body), ['name'])
      Object.assign(folder, { name: body.name, version: folder.version + 1 })
      return route.fulfill({ json: folder })
    }
    if (method === 'DELETE' && path.startsWith('/api/notes/')) {
      const id = path.split('/').pop(); state.deletes.push(id)
      await pause(180)
      if (state.failDelete) return failed()
      assert.ok(state.notes.some(n => n.id === id), 'cannot delete an unknown fixture')
      state.notes = state.notes.filter(n => n.id !== id)
      return route.fulfill({ status: 204 })
    }
    assert.fail('Forbidden/unexpected API request: ' + method + ' ' + path)
  })
  return state
}
async function duplicateSubmit(dialog) {
  await dialog.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(e.message))
    const state = await install(page)
    await page.goto(origin)
    await until(async () => await editorId(page) === a.id, 'initial selection')
    const fab = page.getByRole('button', { name: '새 문서', exact: true }).last()
    const add = async kind => {
      await page.getByLabel('폴더 또는 문서 추가', { exact: true }).click()
      await page.getByRole('button', { name: kind, exact: true }).first().click()
    }
    // Original plus dropdown, no separate folder button or creation modal.
    assert.equal(await page.getByRole('button', { name: '새 폴더', exact: true }).isVisible(), false)
    const metaBefore = state.metadata
    await add('새 문서')
    await until(async () => state.notePosts.length === 1 && await editorId(page) === state.notePosts[0].id, 'note beside active note')
    const created = state.notePosts[0].id
    assert.equal(state.notePosts[0].folderId, root.id)
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.getByLabel('문서 내용').inputValue(), '')
    assert.notEqual(await page.getByLabel('문서 내용').getAttribute('readonly'), null)
    await until(async () => state.metadata > metaBefore, 'Infinity refresh')
    state.failNote = true
    await fab.click()
    await page.getByRole('alert').waitFor()
    await pause(350)
    assert.equal(state.notePosts.length, 2)
    assert.equal(await editorId(page), created)
    assert.equal(await page.locator('[data-node-key="note:' + state.notePosts[1].id + '"]').count(), 0)
    state.failNote = false

    // New Folder beside the selected Note; name is edited directly in the tree.
    await add('새 폴더')
    let input = page.getByLabel('새 폴더 이름', { exact: true })
    await input.waitFor()
    const parent = state.folderPosts[0]
    assert.equal(parent.parentId, root.id)
    assert.equal(parent.name, '새 폴더')
    await input.fill('   '); await input.press('Enter')
    await page.getByText('폴더 이름은 공백이 아닌 1~200자로 입력해주세요.').waitFor()
    assert.equal(state.renames.length, 0)
    state.failRename = true
    await input.fill('작성 폴더'); await input.press('Enter')
    await page.getByText('mock 요청 실패', { exact: true }).waitFor()
    assert.equal(state.folders.find(f => f.id === parent.id).name, '새 폴더')
    state.failRename = false
    await input.press('Enter'); await input.waitFor({ state: 'hidden' })
    assert.equal(state.folders.find(f => f.id === parent.id).name, '작성 폴더')
    // The newly selected Folder is the next creation's parent.
    await add('새 폴더')
    input = page.getByLabel('새 폴더 이름', { exact: true })
    await input.waitFor()
    const child = state.folderPosts[1]
    assert.equal(child.parentId, parent.id)
    await input.press('Escape')
    const count = state.notePosts.length
    await fab.evaluate(button => { button.click(); button.click() })
    await until(async () => state.notePosts.length === count + 1 && await editorId(page) === state.notePosts.at(-1).id, 'note inside selected folder')
    assert.equal(state.notePosts.length, count + 1)
    assert.equal(state.notePosts.at(-1).folderId, child.id)
    // Selecting a Note replaces the previous Folder destination.
    await page.locator('[data-node-key="note:' + a.id + '"]').click()
    await add('새 문서')
    await until(async () => state.notePosts.length === count + 2 && await editorId(page) === state.notePosts.at(-1).id, 'note location follows selected note')
    assert.equal(state.notePosts.at(-1).folderId, root.id)
    const deleting = state.notePosts.at(-1).id
    await page.getByRole('button', { name: '원고 삭제', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '원고 영구 삭제' })
    await dialog.getByText(/복구할 수 없습니다/).waitFor()
    assert.equal(await page.locator(':focus').textContent(), '취소')
    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    assert.equal(state.deletes.length, 0)
    assert.equal(await editorId(page), deleting)

    state.failDelete = true
    await page.getByRole('button', { name: '원고 삭제', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '원고 영구 삭제' })
    await duplicateSubmit(dialog)
    await until(async () => state.deletes.length === 1, 'delete attempt')
    assert.equal(await dialog.getByRole('button', { name: '영구 삭제', exact: true }).isDisabled(), true)
    await dialog.getByRole('alert').waitFor()
    await pause(350)
    assert.equal(state.deletes.length, 1)
    assert.equal(await editorId(page), deleting)
    assert.equal(await page.locator('[data-node-key="note:' + deleting + '"]').count(), 1)
    state.failDelete = false
    const ids = ordered(state), index = ids.indexOf(deleting), next = ids[index + 1] || ids[index - 1]
    await dialog.getByRole('button', { name: '영구 삭제', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await until(async () => await editorId(page) === next, 'delete selection recovery')
    assert.equal(await page.locator('[data-node-key="note:' + deleting + '"]').count(), 0)
    assert.equal(await page.locator('[aria-current="page"]').getAttribute('data-node-key'), 'note:' + next)

    // Failure never creates a fake folder; same-request retry keeps its UUID.
    state.failFolder = true
    await add('새 폴더')
    await page.getByRole('alert').waitFor()
    const failedFolder = state.folderPosts.at(-1).id
    assert.equal(await page.locator('[data-node-key="folder:' + failedFolder + '"]').count(), 0)
    state.failFolder = false
    await page.getByRole('button', { name: '같은 요청 다시 시도', exact: true }).click()
    await page.getByLabel('새 폴더 이름').waitFor()
    assert.equal(state.folderPosts.at(-1).id, failedFolder)
    await page.getByLabel('새 폴더 이름').press('Escape')
    state.loseResponse = true
    const selectedBeforeLoss = await editorId(page)
    await fab.click()
    await page.getByText(/응답만 유실됐을 수/).waitFor()
    assert.equal(await editorId(page), selectedBeforeLoss)
    const ambiguous = state.notePosts.at(-1).id
    await page.getByRole('button', { name: '목록 새로고침', exact: true }).click()
    await page.locator('[data-node-key="note:' + ambiguous + '"]').waitFor()
    await page.getByRole('button', { name: '같은 요청 다시 시도', exact: true }).click()
    await page.getByText(/이전 요청이 반영됐을 수/).waitFor()
    assert.equal(state.notePosts.at(-1).id, ambiguous)
    assert.equal(state.notes.filter(note => note.id === ambiguous).length, 1)
    assert.equal(await editorId(page), selectedBeforeLoss)
    await page.close()

    // Deleting the last Note gives an empty editor (not a stale detail).
    const last = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    last.on('pageerror', e => errors.push(e.message))
    const lastState = await install(last, true)
    await last.goto(origin)
    await until(async () => await editorId(last) === a.id, 'last-note initial')
    await last.getByRole('button', { name: '원고 삭제', exact: true }).click()
    await last.getByRole('button', { name: '영구 삭제', exact: true }).click()
    await last.getByText('표시할 원고가 없습니다.', { exact: true }).waitFor()
    assert.equal(await last.getByLabel('문서 내용').inputValue(), '')
    assert.equal(lastState.notes.length, 0)
    assert.equal(await editorId(last), null)
    await last.close()

    // A completely empty space can create its first root folder and then its first note.
    const fresh = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    fresh.on('pageerror', e => errors.push(e.message))
    const freshState = await install(fresh)
    freshState.folders = []; freshState.notes = []
    await fresh.goto(origin)
    await fresh.getByText('폴더가 없습니다.', { exact: true }).waitFor()
    await fresh.getByRole('button', { name: '새 문서', exact: true }).last().click()
    await fresh.getByText('먼저 폴더를 만들거나 원고를 넣을 폴더를 선택해주세요.', { exact: true }).waitFor()
    assert.equal(freshState.notePosts.length, 0)
    await fresh.getByLabel('폴더 또는 문서 추가').click()
    await fresh.getByRole('button', { name: '새 폴더', exact: true }).click()
    input = fresh.getByLabel('새 폴더 이름')
    await input.waitFor()
    assert.equal(freshState.folderPosts[0].parentId, null)
    await input.fill('첫 폴더'); await input.press('Enter'); await input.waitFor({ state: 'hidden' })
    await fresh.getByRole('button', { name: '새 문서', exact: true }).last().click()
    await until(async () => freshState.notePosts.length === 1 && await editorId(fresh) === freshState.notePosts[0].id, 'first note in empty space')
    await fresh.close()

    // Mobile dropdown: creation returns to the new note in the editor.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
    mobile.on('pageerror', e => errors.push(e.message))
    const mobileState = await install(mobile)
    await mobile.goto(origin)
    await until(async () => await editorId(mobile) === a.id, 'mobile initial')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
    mobileState.failFolder = true
    await mobile.getByLabel('폴더 또는 문서 추가').click()
    await mobile.getByRole('button', { name: '새 폴더', exact: true }).click()
    const drawer = mobile.getByRole('dialog')
    await drawer.getByRole('alert').waitFor()
    assert.equal(mobileState.folderPosts.length, 1)
    const mobileFolderId = mobileState.folderPosts[0].id
    mobileState.failFolder = false
    await drawer.getByRole('button', { name: '같은 요청 다시 시도', exact: true }).click()
    input = mobile.getByLabel('새 폴더 이름')
    await input.waitFor(); assert.equal(mobileState.folderPosts.at(-1).id, mobileFolderId); await input.fill('모바일 폴더'); await input.press('Enter'); await input.waitFor({ state: 'hidden' })
    await mobile.getByLabel('폴더 또는 문서 추가').click()
    await mobile.getByRole('button', { name: '새 문서', exact: true }).first().click()
    await until(async () => mobileState.notePosts.length === 1 && await editorId(mobile) === mobileState.notePosts[0].id, 'mobile creation selection')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).waitFor()
    await mobile.close()
    assert.deepEqual(errors, [])
    console.log('PASS: original plus dropdown, selected Folder/Note destination, inline folder rename, root/nested Folder, blank Note + auto selection, 204 DELETE, cancel/failure/empty recovery, Infinity refresh, duplicate guard, ambiguous network, mobile; mock writes only')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
