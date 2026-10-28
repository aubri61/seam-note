// Mock GETs only. No server writes, persistence, application test hooks or new dependencies.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await pause(20) }
  throw new Error(label)
}
const ids = { A: '00000000-0000-4000-8000-000000000201', B: '00000000-0000-4000-8000-000000000202', C: '00000000-0000-4000-8000-000000000203' }
const alias = id => Object.keys(ids).find(key => ids[key] === id)
const stamp = '2026-10-25T00:00:00Z'
const folder = { id: 'folder', parentId: null, name: '소설', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const note = (id, sortOrder, version) => ({ id: ids[id], folderId: folder.id, title: id + ' 제목', content: id + ' 본문', sortOrder, version, createdAt: stamp, updatedAt: stamp })
async function warningRequested(page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}
async function refetch(page) {
  // Advance only staleness calculations, then exercise TanStack's normal focus path.
  await page.evaluate(() => {
    const now = Date.now.bind(Date)
    Date.now = () => now() + 31_000
    // Query listens on window. A synthetic Event on document does not bubble
    // by default, unlike the browser's native visibility notification path.
    window.dispatchEvent(new Event('visibilitychange'))
  })
}
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    page.setDefaultTimeout(7000)
    page.on('pageerror', error => errors.push(error.message))
    const server = { A: note('A', 0, 2), B: note('B', 1, 1), C: note('C', 2, 0) }
    const gets = { A: 0, B: 0, C: 0 }
    let releaseA, holdA = false, holdC = false, releaseC, failA = false
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const request = route.request(), path = new URL(request.url()).pathname
      assert.equal(request.method(), 'GET', 'Draft edits must never send a mutation')
      if (path === '/api/workspace/tree') return route.fulfill({ json: {
        folders: [folder], notes: Object.values(server).map(({ content, createdAt, ...summary }) => summary),
      } })
      const id = alias(path.split('/').pop())
      assert.ok(server[id], 'unknown API path ' + path)
      gets[id]++
      const response = structuredClone(server[id])
      if (id === 'A' && holdA) await new Promise(resolve => { releaseA = resolve })
      if (id === 'C' && holdC) await new Promise(resolve => { releaseC = resolve })
      if (id === 'A' && failA) return route.fulfill({ status: 404, json: { code: 'NOTE_NOT_FOUND', message: 'mock 조회 실패', errors: [] } })
      await route.fulfill({ json: response }).catch(() => {}) // A cancelled obsolete GET may complete late.
    })
    await page.goto(origin)
    const editor = page.getByRole('region', { name: '노트 편집기' })
    const title = page.getByLabel('문서 제목'), body = page.getByLabel('문서 내용')
    const select = id => page.locator('[data-node-key="note:' + ids[id] + '"]').click()
    const status = text => text === '저장되지 않은 변경사항'
      ? page.getByRole('status').filter({ hasText: /^(편집 중 \/ 로컬 저장 대기|로컬 저장 중|로컬 저장됨 · 서버 미동기화)$/ }).first()
      : page.getByText(text, { exact: true }).first()
    await until(async () => await body.inputValue() === 'A 본문', 'initial Draft')
    await status('변경사항 없음').waitFor()
    assert.equal(await warningRequested(page), false)
    assert.equal(await title.getAttribute('maxlength'), '200')
    await title.fill('가'.repeat(200)); await title.press('End'); await title.pressSequentially('나')
    assert.equal((await title.inputValue()).length, 200)
    await title.fill(''); await body.fill('')
    assert.equal(await title.inputValue(), '')
    assert.equal(await title.getAttribute('placeholder'), '제목 없음')
    assert.equal(await body.inputValue(), '')
    await status('저장되지 않은 변경사항').waitFor()
    assert.equal(await warningRequested(page), true)
    assert.equal(server.A.title, 'A 제목'); assert.equal(server.A.content, 'A 본문')

    await title.fill('A 초안 제목'); await body.fill('A 초안 본문')
    await select('B')
    await until(async () => await body.inputValue() === 'B 본문', 'B isolated Draft')
    await until(async () => !(await warningRequested(page)), 'inactive A is committed before removing warning')
    await status('변경사항 없음').waitFor()
    await body.fill('B 초안 본문')
    await select('A')
    await until(async () => await title.inputValue() === 'A 초안 제목', 'A draft restored')
    assert.equal(await body.inputValue(), 'A 초안 본문')
    await select('B')
    await until(async () => await body.inputValue() === 'B 초안 본문', 'B draft committed after Link transition')
    await body.fill('B 본문')
    await status('변경사항 없음').waitFor()
    assert.equal(await warningRequested(page), false)
    await select('A')
    await until(async () => await title.inputValue() === 'A 초안 제목', 'A visible before reverting its fields')
    await title.fill('A 제목'); await body.fill('A 본문')
    await status('변경사항 없음').waitFor()
    await until(async () => !(await warningRequested(page)), 'all reverted removes unload listener')

    // Clean Draft may adopt a strictly newer full server snapshot.
    server.A = { ...server.A, version: 3, title: 'A 서버 3', content: 'A 서버 본문 3' }
    const beforeClean = gets.A
    await refetch(page)
    await until(async () => gets.A > beforeClean, 'clean refetch request did not start')
    await until(async () => await body.inputValue() === 'A 서버 본문 3', 'clean refetch did not update Draft')
    assert.equal(await page.locator('[data-node-key="note:' + ids.A + '"]').innerText(), 'A 서버 3')
    await status('변경사항 없음').waitFor()
    // Same-ID old response cannot roll back even a clean Draft.
    server.A = { ...server.A, version: 2, title: 'A 오래된 제목', content: 'A 오래된 본문' }
    const beforeOld = gets.A
    await refetch(page)
    await until(async () => gets.A > beforeOld, 'older same-note response')
    await status('변경사항 없음').waitFor()
    assert.equal(await body.inputValue(), 'A 서버 본문 3')

    // Edit after a refetch has started, before its newer response arrives.
    server.A = { ...server.A, version: 4, title: 'A 원격 4', content: 'A 원격 본문 4' }
    holdA = true
    await refetch(page)
    await until(async () => !!releaseA, 'in-flight same-note GET')
    await status('원고 로딩 중').waitFor()
    await title.fill('A 유지할 제목'); await body.fill('A 응답 대기 중 작성')
    releaseA(); holdA = false
    await status('저장되지 않은 변경사항').waitFor()
    assert.equal(await body.inputValue(), 'A 응답 대기 중 작성')
    assert.equal(await title.inputValue(), 'A 유지할 제목')
    assert.equal(await page.locator('[data-node-key="note:' + ids.A + '"]').innerText(), 'A 유지할 제목')
    // Failed refetch keeps the dirty editor enabled and input intact.
    failA = true
    await refetch(page)
    await status('원고 조회 실패').waitFor()
    assert.equal(await body.inputValue(), 'A 응답 대기 중 작성')
    await body.fill('A 조회 실패 후에도 작성')
    assert.equal(await body.inputValue(), 'A 조회 실패 후에도 작성')
    failA = false
    await page.getByRole('button', { name: '다시 시도', exact: true }).click()
    await status('저장되지 않은 변경사항').waitFor()
    assert.equal(await body.inputValue(), 'A 조회 실패 후에도 작성')

    // Late C response must not display C while B is selected.
    holdC = true
    await select('C')
    await until(async () => !!releaseC, 'C slow GET')
    assert.equal(await body.inputValue(), '')
    assert.equal(await body.getAttribute('readonly'), '')
    await select('B')
    await until(async () => await body.inputValue() === 'B 본문', 'B selected before C response')
    releaseC(); holdC = false
    await pause(200)
    assert.equal(await editor.getAttribute('data-note-id'), ids.B)
    assert.equal(await body.inputValue(), 'B 본문')
    await select('A')
    await until(async () => await body.inputValue() === 'A 조회 실패 후에도 작성', 'A survives late response and transitions')
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 })
    assert.equal(await page.getByText(/원고는 이 브라우저에 로컬 저장되며/).count(),0)
    assert.equal(await page.locator('[data-node-key="note:' + ids.A + '"]').getAttribute('aria-selected'), 'true')
    await pause(200) // Let the existing selection background transition settle.
    await page.screenshot({ path: '/private/tmp/seam-note-drafts-desktop.png', fullPage: true })

    await page.evaluate(async () => {
      const { draftRepository: repo } = await import('/src/features/local-drafts/draftDatabase.ts')
      const original = repo.write.bind(repo)
      repo.write = async (...args) => { await new Promise(resolve => setTimeout(resolve, 900)); return original(...args) }
    })
    await body.fill('새로고침 경고를 검증할 최신 입력')
    await body.click() // A trusted gesture is required by Chrome's beforeunload policy.
    assert.equal(await warningRequested(page), true)
    // Real Chrome warning, after user input. Browser policy may vary outside this test environment.
    let warned = false
    page.once('dialog', async dialog => { assert.equal(dialog.type(), 'beforeunload'); warned = true; await dialog.dismiss() })
    const navigation = page.reload({ timeout: 2000 }).catch(error => {
      assert.ok(warned, 'navigation failed before an unload warning: ' + error.message)
    })
    await until(async () => warned, 'Chrome reload beforeunload warning')
    await navigation // Dismissing beforeunload may leave reload waiting until timeout.
    assert.equal(page.isClosed(), false)
    assert.equal(await body.inputValue(), '새로고침 경고를 검증할 최신 입력')
    await page.close() // Test cleanup bypasses beforeunload, like forced termination.

    // Mobile editing survives the responsive Drawer selection flow.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
    mobile.on('pageerror', error => errors.push(error.message))
    await mobile.route(url => url.pathname.startsWith('/api/'), route => {
      assert.equal(route.request().method(), 'GET')
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path === '/api/workspace/tree'
        ? { folders: [folder], notes: Object.values(server).map(({ content, createdAt, ...summary }) => summary) }
        : server[alias(path.split('/').pop())] })
    })
    await mobile.goto(origin)
    await until(async () => await mobile.getByLabel('문서 내용').inputValue() === 'A 원격 본문 4', 'mobile initial')
    await mobile.getByLabel('문서 내용').fill('모바일 A 초안')
    for (const id of ['B', 'A']) {
      await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).click()
      await mobile.locator('[data-node-key="note:' + ids[id] + '"]').click()
      await mobile.getByRole('button', { name: '사이드바 펼치기', exact: true }).waitFor()
    }
    await until(async () => await mobile.getByLabel('문서 내용').inputValue() === '모바일 A 초안', 'mobile A Draft transition committed')
    await mobile.screenshot({ path: '/private/tmp/seam-note-drafts-mobile.png', fullPage: true })
    await mobile.close()
    assert.deepEqual(errors, [])
    console.log('PASS: independent React Drafts, editable/empty/200-char, A-B-A, clean/dirty/older/in-flight refetch, query error recovery, late ID protection, unload conditions + Chrome reload dialog, local commit aware unload, mobile; mock GET only')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
