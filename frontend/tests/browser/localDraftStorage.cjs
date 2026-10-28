// Real browser IndexedDB, isolated profiles/contexts, mock GET server only.
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const runtime = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = runtime
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const ids = { A: '00000000-0000-4000-8000-000000000401', B: '00000000-0000-4000-8000-000000000402', C: '00000000-0000-4000-8000-000000000403' }
const dbModule = '/src/features/local-drafts/draftDatabase.ts'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let i = 0; i < 300; i++) { if (await check()) return; await pause(20) } throw Error(label) }
const note = (id, order) => ({ id: ids[id], folderId: 'folder', title: id + ' 서버 제목', content: id + ' 서버 본문', version: 2, sortOrder: order, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' })
const fixture = (id = 'A', content = '저장된 로컬 원고') => ({ noteId: ids[id], title: id + ' 서버 제목', content, baseVersion: 2, baseTitle: id + ' 서버 제목', baseContent: id + ' 서버 본문', latestServerVersion: 2, localRevision: 7, localSavedAt: 100, storageToken: 'initial-token', writerId: 'test-fixture' })
async function mock(context) {
  const state = { notes: { A: note('A', 0), B: note('B', 1) }, hideA: false, gets: [] }
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const request = route.request(), path = new URL(request.url()).pathname
    assert.equal(request.method(), 'GET', 'No server writes in persistence tests')
    if (path === '/api/workspace/tree') return route.fulfill({ json: {
      folders: [{ id: 'folder', parentId: null, name: '원고', sortOrder: 0, version: 0, createdAt: '', updatedAt: '' }],
      notes: Object.entries(state.notes).filter(([key]) => !state.hideA || key !== 'A').map(([, { content, createdAt, ...summary }]) => summary),
    } })
    const key = Object.keys(ids).find(key => ids[key] === path.split('/').pop())
    state.gets.push(key)
    return route.fulfill(state.notes[key] && !(key === 'A' && state.hideA) ? { json: state.notes[key] }
      : { status: 404, json: { code: 'NOTE_NOT_FOUND', message: '서버 원고 없음', errors: [] } })
  })
  return state
}
const title = page => page.getByLabel('문서 제목')
const body = page => page.getByLabel('문서 내용')
const row = (page, key) => page.locator('[data-node-key="note:' + ids[key] + '"]')
async function record(page, id = 'A') { return page.evaluate(async ({ module, id }) => (await import(module)).draftDatabase.drafts.get(id), { module: dbModule, id: ids[id] }) }
async function saved(page, id, matches) {
  await until(async () => { const value = await record(page, id); return value && matches(value) }, 'IndexedDB commit ' + id)
  await until(async () => !(await warning(page)), 'latest draft acknowledged')
}
async function warning(page) { return page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }) }
async function boot(page, options = {}) {
  // A test HTML shell permits fault injection BEFORE React starts, without adding production test hooks.
  await page.route(url => url.pathname === '/storage-test-shell', async route => {
    const response = await route.fetch({ url: origin + '/' })
    // Preserve Vite's React refresh preamble, postponing only the application entry.
    const html = (await response.text()).replace(/<script[^>]*src=["']\/src\/main\.tsx(?:\?[^"']*)?["'][^>]*>\s*<\/script>/, '')
    await route.fulfill({ response, body: html })
  })
  await page.goto(origin + '/storage-test-shell')
  await page.evaluate(async ({ module, id, options }) => {
    if (options.foreignSchema) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('seam-note-local', 10)
        request.onupgradeneeded = () => request.result.createObjectStore('personal-notes')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('personal-notes', 'readwrite')
          tx.objectStore('personal-notes').put('기존 스키마의 원고', 'keep')
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
      })
    }
    const { draftRepository: repo, draftDatabase: db } = await import(module)
    if (options.seed) await db.drafts.put(options.seed)
    const read = repo.read.bind(repo), write = repo.write.bind(repo)
    const control = window.storageTest = { waitRead: !!options.waitRead, failRead: !!options.failRead, failWrite: !!options.failWrite, delayWrite: options.delayWrite || 0, failOnlyId: options.failOnlyId, writes: 0, reads: 0, releases: [] }
    control.releaseRead = () => { control.waitRead = false; control.releases.splice(0).forEach(resolve => resolve()) }
    repo.read = async key => {
      control.reads++
      if (control.waitRead) await new Promise(resolve => control.releases.push(resolve))
      if (control.failRead) throw new DOMException('Storage unavailable', 'SecurityError')
      return read(key)
    }
    repo.write = async (...args) => {
      control.writes++
      if (control.delayWrite) await new Promise(resolve => setTimeout(resolve, control.delayWrite))
      if (control.failWrite && (!control.failOnlyId || args[0].noteId === control.failOnlyId)) throw new DOMException('Storage limit', 'QuotaExceededError')
      return write(...args)
    }
    history.replaceState({}, '', '/notes/' + id)
    await import('/src/main.tsx')
  }, { module: dbModule, id: ids.A, options })
}
async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'seam-note-idb-profile-'))
  const contexts = [], errors = []
  let persistent, browser
  function watch(page) { page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => errors.push(error.message)); return page }
  try {
    persistent = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1360, height: 900 } })
    await mock(persistent)
    let page = watch(persistent.pages()[0])
    await page.goto(origin + '/notes/' + ids.A)
    await until(async () => await body(page).inputValue() === 'A 서버 본문', 'initial server draft')
    await saved(page, 'A', value => value.content === 'A 서버 본문')
    await title(page).fill('제목만 변경')
    assert.equal(await warning(page), true)
    await saved(page, 'A', value => value.title === '제목만 변경' && value.content === 'A 서버 본문')
    await page.reload()
    await until(async () => await title(page).inputValue() === '제목만 변경', 'title restored after reload')
    await body(page).fill('본문만 추가 편집')
    await saved(page, 'A', value => value.content === '본문만 추가 편집')
    await page.reload()
    await until(async () => await body(page).inputValue() === '본문만 추가 편집', 'body restored after reload')
    await title(page).fill(''); await body(page).fill('')
    await saved(page, 'A', value => value.title === '' && value.content === '')
    await page.reload()
    await page.getByText('로컬 저장됨 · 서버 미동기화', { exact: true }).waitFor()
    assert.equal(await title(page).inputValue(), '')
    assert.equal(await body(page).inputValue(), '')
    assert.equal(await title(page).getAttribute('placeholder'), '제목 없음')
    assert.equal((await record(page)).baseVersion, 2)
    await body(page).fill('전환 직전 A 입력')
    await row(page, 'B').click()
    await until(async () => await body(page).inputValue() === 'B 서버 본문', 'switch B')
    await until(async () => (await record(page)).content === '전환 직전 A 입력', 'switch flush A')
    await body(page).fill('B 독립 입력'); await row(page, 'A').click()
    await until(async () => await body(page).inputValue() === '전환 직전 A 입력', 'A returns')
    await until(async () => (await record(page, 'B')).content === 'B 독립 입력', 'switch flush B')
    await title(page).fill('브라우저 재시작 제목'); await body(page).fill('브라우저 재시작 본문')
    await saved(page, 'A', value => value.content === '브라우저 재시작 본문' && value.title === '브라우저 재시작 제목')
    const revision = (await record(page)).localRevision
    await persistent.close(); persistent = null
    persistent = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1360, height: 900 } })
    const restartedServer = await mock(persistent)
    restartedServer.notes.A = { ...restartedServer.notes.A, version: 1, content: '더 오래된 서버 원고' }
    page = watch(persistent.pages()[0])
    await page.goto(origin + '/notes/' + ids.A)
    await until(async () => await body(page).inputValue() === '브라우저 재시작 본문', 'actual browser reopen + direct URL restore')
    assert.equal(await title(page).inputValue(), '브라우저 재시작 제목')
    assert.equal((await record(page)).localRevision, revision)
    assert.equal(await warning(page), false)
    // Server disappearance does not delete or recreate the local manuscript.
    restartedServer.hideA = true
    await page.reload()
    await page.getByRole('alert').filter({ hasText: '404' }).waitFor()
    await until(async () => await body(page).inputValue() === '브라우저 재시작 본문', 'deleted server Note local recovery')
    assert.equal((await record(page)).content, '브라우저 재시작 본문')
    await persistent.close(); persistent = null

    browser = await chromium.launch({ channel: 'chrome', headless: true })
    async function isolated() { const context = await browser.newContext(); contexts.push(context); await mock(context); return watch(await context.newPage()) }
    const delayed = await isolated()
    await boot(delayed, { seed: fixture(), waitRead: true })
    await until(async () => await delayed.evaluate(() => window.storageTest.reads > 0), 'local read started')
    await pause(700) // Server GET succeeds first; local restoration is deliberately blocked.
    assert.equal(await body(delayed).inputValue(), '')
    assert.equal(await body(delayed).getAttribute('readonly'), '')
    assert.equal(await delayed.evaluate(() => window.storageTest.writes), 0)
    assert.equal((await record(delayed)).content, '저장된 로컬 원고')
    await delayed.evaluate(() => window.storageTest.releaseRead())
    await until(async () => await body(delayed).inputValue() === '저장된 로컬 원고', 'late local restore beats server initialization')
    assert.equal(await delayed.evaluate(() => window.storageTest.reads >= 1), true)
    await delayed.close()

    const slow = await isolated()
    await boot(slow, { seed: fixture('A', 'A 서버 본문'), delayWrite: 1000 })
    await until(async () => await body(slow).inputValue() === 'A 서버 본문', 'slow write initial')
    await body(slow).fill('느린 저장 이전 입력')
    await slow.getByText('로컬 저장 중', { exact: true }).waitFor()
    await body(slow).fill('느린 저장 중 최신 입력')
    assert.equal(await warning(slow), true)
    await row(slow, 'B').click()
    await until(async () => await body(slow).inputValue() === 'B 서버 본문', 'switch while write pending')
    await until(async () => (await record(slow))?.content === '느린 저장 중 최신 입력', 'latest snapshot wins after slow serial writes')
    await row(slow, 'A').click()
    await until(async () => await body(slow).inputValue() === '느린 저장 중 최신 입력', 'slow A return')
    await saved(slow, 'A', value => value.content === '느린 저장 중 최신 입력')
    assert.ok(await slow.evaluate(() => window.storageTest.writes <= 4), 'not one DB write per input event')
    await slow.close()

    const rapid = await isolated()
    await boot(rapid, { seed: fixture('A', 'A 서버 본문'), delayWrite: 150 })
    await until(async () => await body(rapid).inputValue() === 'A 서버 본문', 'continuous input initial')
    const longText = '긴 원고 '.repeat(4000)
    for (let i = 0; i < 35; i++) {
      await body(rapid).fill(longText + i)
      await pause(65)
    }
    assert.ok(await rapid.evaluate(() => window.storageTest.writes > 0), 'sustained input must not postpone all writes until typing stops')
    await saved(rapid, 'A', value => value.content === longText + 34)
    const writeCount = await rapid.evaluate(() => window.storageTest.writes)
    assert.ok(writeCount <= 5, 'long manuscript must not write for each input')
    console.log('Continuous-input fixture:', { inputEvents: 35, committedAttempts: writeCount })
    await rapid.close()

    const quota = await isolated()
    await boot(quota, { seed: fixture('A', 'A 서버 본문'), failWrite: true })
    await until(async () => await body(quota).inputValue() === 'A 서버 본문', 'quota initial')
    await body(quota).fill('공간 부족에도 메모리 보존')
    await quota.getByRole('alert').filter({ hasText: '공간이 부족' }).waitFor()
    assert.equal((await record(quota)).content, 'A 서버 본문')
    assert.equal(await body(quota).inputValue(), '공간 부족에도 메모리 보존')
    assert.equal(await warning(quota), true)
    await body(quota).fill('실패 이후 작성도 보존')
    const attempts = await quota.evaluate(() => window.storageTest.writes)
    await pause(600)
    assert.equal(await quota.evaluate(() => window.storageTest.writes), attempts)
    await quota.evaluate(() => { window.storageTest.failWrite = false })
    await quota.getByRole('button', { name: '로컬 저장 다시 시도', exact: true }).click()
    await saved(quota, 'A', value => value.content === '실패 이후 작성도 보존')
    await quota.reload()
    await until(async () => await body(quota).inputValue() === '실패 이후 작성도 보존', 'retry committed to actual IndexedDB')
    await quota.close()

    const background = await isolated()
    await boot(background, { seed: fixture('A', 'A 서버 본문'), failWrite: true, failOnlyId: ids.A, delayWrite: 500 })
    await until(async () => await body(background).inputValue() === 'A 서버 본문', 'background save initial')
    await body(background).fill('B를 여는 동안 저장 실패할 A 원고')
    await row(background, 'B').click()
    await until(async () => await body(background).inputValue() === 'B 서버 본문', 'B displayed during A save')
    await background.getByRole('alert').filter({ hasText: '다른 원고의 로컬 저장' }).waitFor()
    await background.getByRole('link', { name: '저장 실패 원고 확인', exact: true }).click()
    await until(async () => await body(background).inputValue() === 'B를 여는 동안 저장 실패할 A 원고', 'return to failed background draft')
    await background.evaluate(() => { window.storageTest.failWrite = false })
    await background.getByRole('button', { name: '로컬 저장 다시 시도', exact: true }).click()
    await saved(background, 'A', value => value.content === 'B를 여는 동안 저장 실패할 A 원고')
    await background.close()

    const unavailable = await isolated()
    await boot(unavailable, { failRead: true })
    await unavailable.getByRole('alert').filter({ hasText: '저장소' }).waitFor()
    await until(async () => await body(unavailable).inputValue() === 'A 서버 본문', 'read unavailable memory fallback')
    await body(unavailable).fill('DB 열기 실패 중 작성')
    assert.equal(await unavailable.evaluate(() => window.storageTest.writes), 0)
    await unavailable.evaluate(() => { window.storageTest.failRead = false })
    await unavailable.getByRole('button', { name: '로컬 저장 다시 시도', exact: true }).click()
    await saved(unavailable, 'A', value => value.content === 'DB 열기 실패 중 작성')
    await unavailable.close()

    const ambiguous = await isolated()
    await boot(ambiguous, { seed: fixture(), failRead: true })
    await ambiguous.getByRole('alert').waitFor()
    await until(async () => await body(ambiguous).inputValue() === 'A 서버 본문', 'failed read fallback')
    await body(ambiguous).fill('실패 도중 다른 메모리 원고')
    await ambiguous.evaluate(() => { window.storageTest.failRead = false })
    await ambiguous.getByRole('button', { name: '로컬 저장 다시 시도', exact: true }).click()
    await ambiguous.getByRole('alert').filter({ hasText: '저장을 중단' }).waitFor()
    assert.equal((await record(ambiguous)).content, '저장된 로컬 원고')
    assert.equal(await body(ambiguous).inputValue(), '실패 도중 다른 메모리 원고')
    await ambiguous.close()

    const foreign = await isolated()
    await boot(foreign, { foreignSchema: true })
    await foreign.getByRole('alert').filter({ hasText: '형식을 확인할 수 없어' }).waitFor()
    await until(async () => await body(foreign).inputValue() === 'A 서버 본문', 'unknown schema memory fallback')
    await body(foreign).fill('알 수 없는 DB에는 쓰지 않음')
    const untouched = await foreign.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('seam-note-local')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result, names = [...db.objectStoreNames], tx = db.transaction('personal-notes', 'readonly'), get = tx.objectStore('personal-notes').get('keep')
        get.onsuccess = () => { const value = get.result; db.close(); resolve({ names, value }) }
      }
    }))
    assert.deepEqual(untouched, { names: ['personal-notes'], value: '기존 스키마의 원고' })
    await foreign.close()

    // Two live tabs share the DB. Independent equal revisions do not grant ownership.
    for (const notifications of [true, false]) {
      const context = await browser.newContext(); contexts.push(context); await mock(context)
      if (!notifications) await context.addInitScript(() => { window.BroadcastChannel = undefined })
      const left = watch(await context.newPage()), right = watch(await context.newPage())
      await left.goto(origin + '/notes/' + ids.A)
      await until(async () => await body(left).inputValue() === 'A 서버 본문', 'left initial')
      await saved(left, 'A', value => value.content === 'A 서버 본문')
      await right.goto(origin + '/notes/' + ids.A)
      await right.getByText('변경사항 없음', { exact: true }).waitFor()
      // Delay the losing tab's write so both edit from the same acknowledged token.
      await right.evaluate(async module => {
        const { draftRepository: repo } = await import(module), original = repo.write.bind(repo)
        repo.write = async (...args) => { await new Promise(resolve => setTimeout(resolve, 800)); return original(...args) }
      }, dbModule)
      await body(right).fill('오래된 탭의 독립 편집')
      await body(left).fill('다른 탭의 먼저 완료된 편집')
      await until(async () => (await record(left)).content === '다른 탭의 먼저 완료된 편집', 'winner commits')
      await right.getByRole('alert').filter({ hasText: '저장을 중단' }).waitFor()
      assert.equal(await body(right).inputValue(), '오래된 탭의 독립 편집')
      assert.equal((await record(right)).content, '다른 탭의 먼저 완료된 편집')
      const queued = await right.evaluate(async ({ module, id }) => (await import(module)).draftRepository.listOperations(id), { module: dbModule, id: ids.A })
      assert.equal(queued.length, 1, 'losing tab cannot leave a partial Outbox write')
      assert.equal(queued[0].content, (await record(right)).content)
      assert.equal(queued[0].status, 'pending', 'foundation does not auto-send')
      assert.equal(await warning(right), true)
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await right.getByRole('button', { name: '현재 입력 복사', exact: true }).click()
      assert.match(await right.evaluate(() => navigator.clipboard.readText()), /오래된 탭의 독립 편집/)
      const downloaded = right.waitForEvent('download')
      await right.getByRole('button', { name: '현재 입력 파일로 보관', exact: true }).click()
      const download = await downloaded
      const fileText = require('node:fs').readFileSync(await download.path(), 'utf8')
      assert.match(fileText, /오래된 탭의 독립 편집/)
      await right.getByText('다른 탭과 로컬 충돌', { exact: true }).waitFor()
      await right.getByRole('button', { name: '로컬 저장 상태 다시 확인', exact: true }).click()
      assert.equal((await record(right)).content, '다른 탭의 먼저 완료된 편집')
      await left.close(); await right.close()
    }
    const atomic = await isolated()
    await boot(atomic, { seed: fixture() })
    await until(async () => await body(atomic).inputValue() === '저장된 로컬 원고', 'atomic baseline')
    const transactions = await atomic.evaluate(async ({ module, id }) => {
      const { draftRepository: repo, draftDatabase: db } = await import(module)
      const source = await repo.read(id)
      const results = await Promise.allSettled([
        repo.write({ ...source, content: '동시 트랜잭션 1' }, source.localRevision + 1, source.storageToken, 'tx1'),
        repo.write({ ...source, content: '동시 트랜잭션 2' }, source.localRevision + 1, source.storageToken, 'tx2'),
      ])
      const winner = await repo.read(id)
      let staleRejected = false
      try { await repo.write({ ...winner, content: '이전 revision' }, winner.localRevision - 1, winner.storageToken, 'old') } catch { staleRejected = true }
      let aborted = false
      try {
        await db.transaction('rw', db.drafts, async tx => { await db.drafts.put({ ...winner, content: '롤백되어야 할 내용' }); tx.abort() })
      } catch { aborted = true }
      return { states: results.map(value => value.status), staleRejected, winner: winner.content, after: (await repo.read(id)).content, aborted }
    }, { module: dbModule, id: ids.A })
    assert.equal(transactions.states.filter(value => value === 'fulfilled').length, 1)
    assert.equal(transactions.states.filter(value => value === 'rejected').length, 1)
    assert.equal(transactions.aborted, true)
    assert.equal(transactions.staleRejected, true)
    assert.equal(transactions.winner, transactions.after)
    await atomic.close()
    assert.deepEqual(errors, [])
    console.log('PASS: real IndexedDB title/body/empty reload + browser reopen, switch, older server, delayed recovery, slow serial writes, quota/read failure retry, failed recovery conflict, StrictMode, two tabs with/without notifications, atomic CAS/rollback, deleted-server preservation, unload conditions; mock GET only')
    console.log('WebKit executable available:', existsSync(runtime.webkit.executablePath()), '(WebKit is not Safari)')
  } finally {
    if (persistent) await persistent.close()
    for (const context of contexts) await context.close().catch(() => {})
    if (browser) await browser.close()
    rmSync(profile, { recursive: true, force: true }) // This script-created isolated test profile only.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
