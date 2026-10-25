// API requests are GET-only mocks; creation/deletion routing is covered by workspaceCreateDelete.cjs.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const ids = {
  A: 'abcdefab-1234-4000-8000-000000000301',
  B: '00000000-0000-4000-8000-000000000302',
  C: '00000000-0000-4000-8000-000000000303',
  missing: '00000000-0000-4000-8000-000000000399',
}
const path = id => '/notes/' + ids[id]
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, message) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await pause(20) }
  throw new Error(message)
}
const stamp = '2026-10-25T00:00:00Z'
const folder = (id, parentId) => ({ id, parentId, name: id, sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp })
const note = (id, folderId, sortOrder) => ({ id: ids[id], folderId, title: id + ' 제목', content: id + ' 서버 본문', sortOrder, version: 0, createdAt: stamp, updatedAt: stamp })
async function install(page, options = {}) {
  const notes = { A: note('A', 'nested', 0), B: note('B', 'root', 0), C: note('C', 'root', 1) }
  const state = { gets: [], trees: 0, releaseTree: null, releaseNote: null, holdNote: null, includeMissing: false }
  await page.addInitScript(() => {
    window.__routingDocument = crypto.randomUUID()
    window.__entryHistoryLength = history.length
  })
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    assert.equal(request.method(), 'GET')
    if (pathname === '/api/workspace/tree') {
      state.trees++
      if (options.holdTree) await new Promise(resolve => { state.releaseTree = resolve })
      return route.fulfill({ json: options.empty ? { folders: [], notes: [] } : {
        folders: [folder('root', null), folder('nested', 'root')],
        notes: [notes.B, notes.C, notes.A, ...(state.includeMissing ? [note('missing', 'root', 99)] : [])].map(({ content, createdAt, ...summary }) => summary),
      } })
    }
    const id = Object.keys(ids).find(key => ids[key] === pathname.split('/').pop())
    assert.ok(id, 'invalid UUID must not make a detail request: ' + pathname)
    state.gets.push(id)
    if (id === state.holdNote) await new Promise(resolve => { state.releaseNote = resolve })
    if (id === 'missing' && !options.outsideWorkspace) return route.fulfill({ status: 404, json: { code: 'NOTE_NOT_FOUND', message: 'mock 없음', errors: [] } })
    await route.fulfill({ json: id === 'missing' ? note('missing', 'root', 99) : notes[id] }).catch(() => {})
  })
  return state
}
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const errors = []
  async function page(options) {
    const result = await browser.newPage({ viewport: { width: 1360, height: 900 }, ...options })
    result.setDefaultTimeout(7000)
    result.on('pageerror', error => errors.push(error.message))
    return result
  }
  const url = page => new URL(page.url()).pathname
  const row = (page, id) => page.locator('[data-node-key="note:' + ids[id] + '"]')
  const body = page => page.getByLabel('문서 내용')
  try {
    const home = await page()
    const state = await install(home)
    await home.goto(origin)
    await until(async () => url(home) === path('A') && await body(home).inputValue() === 'A 서버 본문', 'home -> first sorted descendant')
    assert.equal(await home.evaluate(() => history.length === window.__entryHistoryLength), true, 'home must replace, not push')
    assert.equal(await row(home, 'A').getAttribute('aria-current'), 'page')
    assert.equal(await row(home, 'B').getAttribute('href'), path('B'))
    const documentId = await home.evaluate(() => window.__routingDocument)
    await body(home).fill('A 미저장 원고')
    await row(home, 'B').click()
    await until(async () => url(home) === path('B') && await body(home).inputValue() === 'B 서버 본문', 'Link -> B')
    await body(home).fill('B 미저장 원고')
    await home.goBack()
    await until(async () => url(home) === path('A') && await body(home).inputValue() === 'A 미저장 원고', 'Back preserves A')
    await home.goForward()
    await until(async () => url(home) === path('B') && await body(home).inputValue() === 'B 미저장 원고', 'Forward preserves B')
    await row(home, 'A').click()
    await until(async () => await body(home).inputValue() === 'A 미저장 원고', 'reselect A')
    assert.equal(await home.evaluate(() => window.__routingDocument), documentId, 'no full document navigation')
    // A previously collapsed ancestor must reopen on history navigation back to A.
    await home.locator('[data-node-key="folder:nested"]').click()
    await row(home, 'B').click()
    await until(async () => url(home) === path('B') && await body(home).inputValue() === 'B 미저장 원고', 'B committed before history Back')
    await home.goBack()
    await row(home, 'A').waitFor()
    assert.equal(await home.locator('[data-node-key="folder:nested"]').getAttribute('aria-expanded'), 'true')
    assert.equal(await body(home).inputValue(), 'A 미저장 원고')
    // In-flight C response cannot select C after navigating back to B.
    state.holdNote = 'C'
    await row(home, 'C').click()
    await until(async () => !!state.releaseNote, 'C request starts')
    await row(home, 'B').click()
    state.releaseNote()
    await pause(200)
    assert.equal(url(home), path('B'))
    assert.equal(await body(home).inputValue(), 'B 미저장 원고')
    assert.equal(await home.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }), true)
    await home.close()

    // Direct B entry starts only B detail even while metadata is still loading.
    const direct = await page()
    const directState = await install(direct, { holdTree: true })
    const response = await direct.goto(origin + path('B'))
    assert.equal(response.status(), 200, 'Vite must serve index.html for a deep link')
    await until(async () => directState.releaseTree && directState.gets.includes('B'), 'parallel metadata/detail')
    directState.releaseTree()
    await until(async () => await body(direct).inputValue() === 'B 서버 본문', 'direct B displays')
    assert.equal(url(direct), path('B'))
    assert.ok(directState.gets.length >= 1 && directState.gets.every(id => id === 'B'))
    await row(direct, 'B').waitFor()
    assert.equal(await row(direct, 'B').getAttribute('aria-selected'), 'true')
    directState.releaseTree = null
    await direct.reload()
    await until(async () => !!directState.releaseTree, 'reload metadata')
    directState.releaseTree()
    await until(async () => await body(direct).inputValue() === 'B 서버 본문', 'direct reload B')
    assert.equal(url(direct), path('B'))
    await direct.close()

    // An uppercase UUID canonicalizes without becoming a false workspace miss.
    const upper = await page()
    await install(upper)
    await upper.goto(origin + '/notes/' + ids.A.toUpperCase())
    await until(async () => await body(upper).inputValue() === 'A 서버 본문', 'uppercase UUID entry')
    assert.equal(url(upper), path('A'))
    await upper.close()

    for (const [target, expected, options] of [
      ['/notes/not-a-uuid', 'UUID 형식을 확인해주세요', {}],
      [path('missing'), '404 · 원고를 찾을 수 없습니다.', {}],
      [path('missing'), '404 · 원고를 찾을 수 없습니다.', { outsideWorkspace: true }],
      ['/notes/' + ids.A + '/extra', '404 · 페이지를 찾을 수 없습니다.', {}],
    ]) {
      const invalid = await page()
      const invalidState = await install(invalid, options)
      await invalid.goto(origin + target)
      await invalid.getByRole('alert').filter({ hasText: expected }).waitFor()
      assert.equal(url(invalid), target)
      assert.equal(await body(invalid).inputValue(), '')
      assert.equal(await invalid.getByRole('button', { name: '원고 삭제', exact: true }).isDisabled(), true)
      assert.ok(invalidState.gets.every(id => id === 'missing'), 'invalid/missing path must not request first note')
      if (options.outsideWorkspace) {
        invalidState.includeMissing = true
        await invalid.getByRole('button', { name: '다시 시도', exact: true }).click()
        await until(async () => await body(invalid).inputValue() === 'missing 서버 본문', '404 retries workspace metadata before enabling detail')
        assert.equal(url(invalid), target)
      }
      await invalid.close()
    }
    const empty = await page()
    const emptyState = await install(empty, { empty: true })
    await empty.goto(origin)
    await empty.getByText('표시할 원고가 없습니다.', { exact: true }).waitFor()
    const settledTrees = emptyState.trees
    await pause(200)
    assert.equal(url(empty), '/')
    assert.equal(emptyState.trees, settledTrees)
    assert.deepEqual(emptyState.gets, [])
    await empty.close()

    const mobile = await page({ viewport: { width: 390, height: 844 } })
    await install(mobile)
    await mobile.goto(origin + path('B'))
    await until(async () => await body(mobile).inputValue() === 'B 서버 본문', 'mobile direct entry')
    await body(mobile).fill('모바일 B Draft')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
    await mobile.locator('[data-node-key="folder:nested"]').click()
    await row(mobile, 'A').click()
    await until(async () => url(mobile) === path('A'), 'mobile Link route')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).waitFor()
    await mobile.goBack()
    await until(async () => url(mobile) === path('B') && await body(mobile).inputValue() === '모바일 B Draft', 'mobile Back Draft')
    await mobile.screenshot({ path: '/private/tmp/seam-note-routing-mobile.png', fullPage: true })
    await mobile.close()
    assert.deepEqual(errors, [])
    console.log('PASS: replace root, Link/no reload, direct/parallel/reload, Back/Forward + dirty Draft, ancestor reveal, slow response, UUID/404/workspace exclusion, empty root, mobile, beforeunload; mock GET only')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
