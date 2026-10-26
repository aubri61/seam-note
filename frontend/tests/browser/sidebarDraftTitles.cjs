// Mock GETs only; isolated Chrome contexts use their own real IndexedDB.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const ids = { A: '00000000-0000-4000-8000-000000000501', B: '00000000-0000-4000-8000-000000000502' }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  for (let i = 0; i < 250; i++) { if (await check()) return; await pause(20) }
  throw Error(label)
}
const row = (page, id) => page.locator(`[data-node-key="note:${ids[id]}"]`)
const title = page => page.getByLabel('문서 제목')
async function mock(page) {
  const folder = { id: 'folder', parentId: null, name: '소설', sortOrder: 0, version: 0, createdAt: '', updatedAt: '' }
  const notes = Object.fromEntries(Object.entries(ids).map(([key, id], sortOrder) => [key, {
    id, folderId: folder.id, title: `${key} 서버 제목`, content: `${key} 본문`, sortOrder, version: 2, createdAt: '', updatedAt: '',
  }]))
  const gets = []
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const request = route.request(), path = new URL(request.url()).pathname
    assert.equal(request.method(), 'GET', 'Never write to the server')
    gets.push(path)
    if (path === '/api/workspace/tree') return route.fulfill({ json: {
      folders: [folder], notes: Object.values(notes).map(({ content, createdAt, ...summary }) => summary),
    } })
    const key = Object.keys(ids).find(key => path === '/api/notes/' + ids[key])
    assert.ok(key, 'Unexpected API: ' + path)
    return route.fulfill({ json: notes[key] })
  })
  return { gets, notes }
}
async function record(page, key) {
  return page.evaluate(async id => (await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase.drafts.get(id), ids[key])
}
async function committed(page, key, expected) {
  await until(async () => (await record(page, key))?.title === expected, 'local title commit: ' + expected)
}
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    page.on('pageerror', error => errors.push(error.message))
    const state = await mock(page)
    await page.goto(origin + '/notes/' + ids.A)
    await until(async () => await title(page).inputValue() === 'A 서버 제목', 'A server Draft')
    await committed(page, 'A', 'A 서버 제목')
    assert.equal(await row(page, 'B').innerText(), 'B 서버 제목', 'no Draft: server fallback')
    const order = await page.locator('[data-node-key]').evaluateAll(nodes => nodes.map(node => node.dataset.nodeKey))
    const initialGets = state.gets.length
    await page.evaluate(async () => {
      const { draftRepository } = await import('/src/features/local-drafts/draftDatabase.ts')
      const write = draftRepository.write.bind(draftRepository)
      draftRepository.write = async (...args) => { await new Promise(resolve => setTimeout(resolve, 1000)); return write(...args) }
    })
    await title(page).fill('A 즉시 반영')
    assert.equal(await row(page, 'A').innerText(), 'A 즉시 반영')
    assert.equal(await row(page, 'A').getAttribute('title'), 'A 즉시 반영')
    assert.equal((await record(page, 'A')).title, 'A 서버 제목', 'render before IDB commit')
    await page.getByLabel('문서 내용').fill('A 로컬 본문')
    await pause(600)
    assert.equal(state.gets.length, initialGets, 'no input-triggered query refetch')
    assert.equal(state.notes.A.title, 'A 서버 제목')
    assert.equal(new URL(page.url()).pathname, '/notes/' + ids.A)
    assert.equal(await row(page, 'A').getAttribute('aria-selected'), 'true')
    await row(page, 'B').click()
    await until(async () => await title(page).inputValue() === 'B 서버 제목', 'B selected')
    await title(page).fill('B 별도 제목')
    assert.equal(await row(page, 'A').innerText(), 'A 즉시 반영')
    assert.equal(await row(page, 'B').innerText(), 'B 별도 제목')
    await row(page, 'A').click()
    await until(async () => await title(page).inputValue() === 'A 즉시 반영', 'A preserved')
    const cache = await page.evaluate(async () => {
      const { queryClient } = await import('/src/lib/query/queryClient.ts')
      const { workspaceKeys, noteKeys } = await import('/src/lib/query/queryKeys.ts')
      const before = structuredClone(queryClient.getQueryData(workspaceKeys.tree()))
      await queryClient.refetchQueries({ queryKey: workspaceKeys.tree() })
      await queryClient.refetchQueries({ queryKey: noteKeys.detail(location.pathname.split('/').pop()) })
      return { before, after: queryClient.getQueryData(workspaceKeys.tree()) }
    })
    assert.equal(cache.before.notes.find(note => note.id === ids.A).title, 'A 서버 제목')
    assert.equal(cache.before.notes.find(note => note.id === ids.B).title, 'B 서버 제목')
    assert.deepEqual(cache.after, cache.before, 'cache stays a server snapshot')
    assert.equal(await row(page, 'A').innerText(), 'A 즉시 반영', 'dirty title survives server refetch')
    assert.equal(await row(page, 'B').innerText(), 'B 별도 제목')
    assert.deepEqual(await page.locator('[data-node-key]').evaluateAll(nodes => nodes.map(node => node.dataset.nodeKey)), order)
    await committed(page, 'A', 'A 즉시 반영')
    await committed(page, 'B', 'B 별도 제목')
    await page.reload()
    await until(async () => await title(page).inputValue() === 'A 즉시 반영', 'restored editor')
    assert.equal(await row(page, 'A').innerText(), 'A 즉시 반영', 'restored sidebar title')
    await row(page, 'B').click()
    await until(async () => await title(page).inputValue() === 'B 별도 제목', 'B restored')
    assert.equal(await row(page, 'B').innerText(), 'B 별도 제목')
    await title(page).fill('')
    assert.equal(await row(page, 'B').innerText(), '제목 없음')
    assert.equal(await row(page, 'B').getAttribute('title'), '제목 없음')
    assert.equal(await title(page).inputValue(), '')
    await committed(page, 'B', '')
    await page.reload()
    await until(async () => await row(page, 'B').innerText() === '제목 없음', 'empty local title restored')
    assert.equal(await title(page).inputValue(), '')
    await page.close()
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
    mobile.on('pageerror', error => errors.push(error.message))
    const mobileState = await mock(mobile)
    await mobile.goto(origin + '/notes/' + ids.A)
    await until(async () => await title(mobile).inputValue() === 'A 서버 제목', 'mobile A')
    const mobileGets = mobileState.gets.length
    await title(mobile).fill('모바일 A 제목')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
    assert.equal(await row(mobile, 'A').innerText(), '모바일 A 제목')
    await row(mobile, 'B').click()
    await until(async () => await title(mobile).inputValue() === 'B 서버 제목', 'mobile B')
    await title(mobile).fill('모바일 B 제목')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
    assert.equal(await row(mobile, 'A').innerText(), '모바일 A 제목')
    assert.equal(await row(mobile, 'B').innerText(), '모바일 B 제목')
    assert.equal(await row(mobile, 'B').getAttribute('aria-selected'), 'true')
    assert.equal(new URL(mobile.url()).pathname, '/notes/' + ids.B)
    assert.equal(mobileState.gets.length, mobileGets + 1, 'only B detail GET')
    await mobile.close()
    assert.deepEqual(errors, [])
    console.log('Sidebar titles passed: immediate before IDB, no extra GET/cache mutation, A/B, refetch, tree/URL, reload, empty, mobile.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
