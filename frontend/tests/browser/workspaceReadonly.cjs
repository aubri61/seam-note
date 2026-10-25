// Uses an existing Playwright runtime; no browser/test dependency is added to the app.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const stamp = '2026-10-25T00:00:00Z'
const folder = (id, parentId, sortOrder, name) => ({ id, parentId, sortOrder, name, version: 0, createdAt: stamp, updatedAt: stamp })
const note = (id, folderId, sortOrder, title) => ({ id, folderId, sortOrder, title, version: 0, updatedAt: stamp })
const snapshot = {
  folders: [folder('later', null, 20, '소설 B'), folder('nested', 'first', 5, '1부'), folder('first', null, 0, '소설 A')],
  notes: [note('00000000-0000-4000-8000-000000000103', 'later', 0, '다른 원고'), note('00000000-0000-4000-8000-000000000102', 'first', 0, '루트 원고'), note('00000000-0000-4000-8000-000000000101', 'nested', 0, '첫 원고')],
}
const full = id => ({ ...snapshot.notes.find(n => n.id === id), content: `body:${id}`, createdAt: stamp })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  const end = Date.now() + 5000
  while (Date.now() < end) { if (await check()) return; await pause(20) }
  throw new Error(label)
}
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    page.setDefaultTimeout(7000)
    page.on('pageerror', e => errors.push(e.message))
    const calls = []
    let delayRoot = true
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const path = new URL(route.request().url()).pathname
      assert.equal(route.request().method(), 'GET')
      calls.push(path)
      if (path === '/api/workspace/tree') return route.fulfill({ json: snapshot })
      const id = path.split('/').pop()
      if (id === '00000000-0000-4000-8000-000000000102' && delayRoot) await pause(500)
      await route.fulfill({ json: full(id) }).catch(() => {})
    })
    await page.goto(origin)
    const editor = page.getByRole('region', { name: '노트 편집기' })
    await until(async () => await editor.getAttribute('data-note-id') === '00000000-0000-4000-8000-000000000101', 'first sorted descendant was not selected')
    assert.equal(await page.getByLabel('문서 제목').inputValue(), '첫 원고')
    assert.equal(await page.getByLabel('문서 내용').inputValue(), 'body:00000000-0000-4000-8000-000000000101')
    assert.equal(await page.getByLabel('문서 내용').getAttribute('readonly'), null)
    assert.equal(await page.getByLabel('문서 제목').getAttribute('readonly'), null)
    assert.equal(await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000101"]').getAttribute('aria-current'), 'page')
    // Tree has one tab stop and exposes hierarchy; arrows move focus without selecting notes.
    assert.equal(await page.locator('[role="treeitem"][tabindex="0"]').count(), 1)
    const autoRow = page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000101"]')
    assert.equal(await autoRow.getAttribute('aria-level'), '3')
    await autoRow.focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.locator(':focus').getAttribute('data-node-key'), 'folder:nested')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.locator(':focus').getAttribute('data-node-key'), 'note:00000000-0000-4000-8000-000000000101')
    const metadataCalls = calls.filter(p => p === '/api/workspace/tree').length
    await page.locator('[data-node-key="folder:first"]').click()
    assert.equal(await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000101"]').count(), 0)
    await page.locator('[data-node-key="folder:first"]').click()
    assert.equal(calls.filter(p => p === '/api/workspace/tree').length, metadataCalls)
    // Let A's slow request start, then select B before A returns.
    await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000102"]').click()
    await until(async () => calls.includes('/api/notes/00000000-0000-4000-8000-000000000102'), 'slow request did not start')
    assert.equal(await page.getByLabel('문서 내용').inputValue(), '')
    await page.locator('[data-node-key="folder:later"]').click()
    await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000103"]').click()
    await until(async () => await editor.getAttribute('data-note-id') === '00000000-0000-4000-8000-000000000103', 'B did not become active')
    await pause(650)
    assert.equal(await page.getByLabel('문서 내용').inputValue(), 'body:00000000-0000-4000-8000-000000000103')
    assert.equal(await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000103"]').getAttribute('aria-current'), 'page')
    assert.equal(await editor.getAttribute('data-note-id'), '00000000-0000-4000-8000-000000000103')
    // Returning to cached auto must not add another detail request.
    const before = calls.filter(p => p === '/api/notes/00000000-0000-4000-8000-000000000101').length
    await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000101"]').click()
    await until(async () => await editor.getAttribute('data-note-id') === '00000000-0000-4000-8000-000000000101', 'cached note not selected')
    assert.equal(calls.filter(p => p === '/api/notes/00000000-0000-4000-8000-000000000101').length, before)
    assert.equal(await page.getByText('변경사항 없음', { exact: true }).count(), 1)
    assert.equal(await page.locator('[data-node-key="note:00000000-0000-4000-8000-000000000101"]').getAttribute('aria-current'), 'page')
    assert.equal(await page.getByRole('button', { name: '새 문서', exact: true }).last().isEnabled(), true)
    await pause(150) // Let the existing row background transition settle for the screenshot.
    await page.screenshot({ path: '/private/tmp/seam-note-workspace.png', fullPage: true })
    await page.close()

    // Preserve responsive navigation: drawer opens, selection changes, drawer closes.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
    mobile.on('pageerror', e => errors.push(e.message))
    await mobile.route(url => url.pathname.startsWith('/api/'), route => {
      assert.equal(route.request().method(), 'GET')
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path === '/api/workspace/tree' ? snapshot : full(path.split('/').pop()) })
    })
    await mobile.goto(origin)
    await until(async () => await mobile.getByLabel('문서 내용').inputValue() === 'body:00000000-0000-4000-8000-000000000101', 'mobile initial note failed')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
    await mobile.locator('[data-node-key="folder:later"]').click()
    await mobile.locator('[data-node-key="note:00000000-0000-4000-8000-000000000103"]').click()
    await until(async () => await mobile.getByLabel('문서 내용').inputValue() === 'body:00000000-0000-4000-8000-000000000103', 'mobile selection failed')
    await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).waitFor()
    await mobile.close()

    // A failed initial detail must not prevent another selection.
    const failure = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    failure.on('pageerror', e => errors.push(e.message))
    await failure.route(url => url.pathname.startsWith('/api/'), route => {
      assert.equal(route.request().method(), 'GET')
      const path = new URL(route.request().url()).pathname
      if (path === '/api/workspace/tree') return route.fulfill({ json: snapshot })
      const id = path.split('/').pop()
      return id === '00000000-0000-4000-8000-000000000101' ? route.fulfill({ status: 404, json: { code: 'NOTE_NOT_FOUND', message: '원고가 없습니다.', errors: [] } }) : route.fulfill({ json: full(id) })
    })
    await failure.goto(origin)
    await failure.getByRole('alert').filter({ hasText: '404 · 원고를 찾을 수 없습니다.' }).waitFor()
    await failure.locator('[data-node-key="note:00000000-0000-4000-8000-000000000102"]').click()
    await until(async () => await failure.getByLabel('문서 내용').inputValue() === 'body:00000000-0000-4000-8000-000000000102', 'selection after error failed')
    await failure.close()

    for (const data of [{ folders: [], notes: [] }, { folders: [snapshot.folders[2]], notes: [] }]) {
      const empty = await browser.newPage({ viewport: { width: 1360, height: 900 } })
      empty.on('pageerror', e => errors.push(e.message))
      await empty.route(url => url.pathname.startsWith('/api/'), route => {
        assert.equal(new URL(route.request().url()).pathname, '/api/workspace/tree')
        return route.fulfill({ json: data })
      })
      await empty.goto(origin)
      await empty.getByText('표시할 원고가 없습니다.', { exact: true }).waitFor()
      if (!data.folders.length) await empty.getByText('폴더가 없습니다.', { exact: true }).waitFor()
      assert.equal(await empty.getByLabel('문서 내용').inputValue(), '')
      await empty.close()
    }

    // Metadata error and manual retry recover without any writes.
    const retry = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    let fail = true
    await retry.route(url => url.pathname.startsWith('/api/'), route => fail
      ? route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: '목록 오류', errors: [] } })
      : route.fulfill({ json: { folders: [], notes: [] } }))
    await retry.goto(origin)
    await retry.getByRole('alert').first().waitFor()
    fail = false
    await retry.getByRole('button', { name: '다시 시도' }).first().click()
    await retry.getByText('폴더가 없습니다.', { exact: true }).waitFor()
    await retry.close()
    if (process.env.SEAM_NOTE_LIVE_GET === '1') {
      const live = await browser.newPage({ viewport: { width: 1360, height: 900 } })
      live.on('pageerror', e => errors.push(e.message))
      const apiMethods = []
      live.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiMethods.push(req.method()) })
      await live.goto(origin)
      const liveEditor = live.getByRole('region', { name: '노트 편집기' })
      await until(async () => !!(await liveEditor.getAttribute('data-note-id')), 'live server note did not load')
      const id = await liveEditor.getAttribute('data-note-id')
      const result = await live.request.get(origin + '/api/notes/' + encodeURIComponent(id))
      assert.equal(result.status(), 200)
      const body = await result.json()
      assert.equal(await live.getByLabel('문서 제목').inputValue(), body.title)
      assert.equal(await live.getByLabel('문서 내용').inputValue(), body.content)
      assert.equal(await live.locator('[aria-current="page"]').getAttribute('data-node-key'), 'note:' + id)
      assert.ok(apiMethods.length >= 2 && apiMethods.every(method => method === 'GET'))
      await live.close()
      console.log('PASS: live Vite proxy -> backend GET, selected ID and full editor content match')
    }
    assert.deepEqual(errors, [])
    console.log('PASS: sorted auto selection, editable clean draft, collapse, fast switch, cache, detail error recovery, empty/folders-only, metadata retry; GET only')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
