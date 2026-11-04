// Runs against npm run build output and a disposable HTTP/auth fixture.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')

const dist = path.resolve(__dirname, '../../dist')
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const worker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
const legacyAsset = '/assets/update-test-legacy00.js'
const user = { id: '00000000-0000-4000-8000-000000000901', issuer: 'fixture', audience: 'fixture',
  email: 'editor@example.test', nickname: '편집자', emailVerified: true }
const note = { id: '00000000-0000-4000-8000-000000000902', folderId: null, title: '테스트 원고',
  content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '이전 본문' }] }] }), version: 0, sortOrder: 0, createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' }
let version = 'A'
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture')
  res.setHeader('Cache-Control', 'no-store')
  function send(status, contentType, body) {
    res.writeHead(status, { 'Content-Type': contentType })
    res.end(body)
  }
  const json = (status, data) => send(status, 'application/json', JSON.stringify(data))
  if (url.pathname === '/api/auth/config') return json(200, { googleEnabled: false })
  if (url.pathname === '/api/auth/csrf') return json(200, { headerName: 'X-CSRF-TOKEN', token: 'fixture' })
  if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/refresh') {
    return json(200, { user, accessToken: 'header.body.signature', tokenType: 'Bearer', expiresIn: 300 })
  }
  if (url.pathname === '/api/workspace/tree') return json(200, { folders: [], notes: [note] })
  if (url.pathname === '/api/notes/' + note.id && req.method === 'GET') return json(200, note)
  if (url.pathname.startsWith('/api/')) return json(503, { code: 'TEST_OFFLINE', message: '서버 전송 차단', errors: [] })
  if (url.pathname === '/sw.js') {
    const revision = /url:"index\.html",revision:"[^"]+"/
    assert.ok(revision.test(worker))
    const script = worker.replace(revision, `url:"index.html",revision:"update-fixture-${version}"${version === 'A' ? `},{url:"${legacyAsset.slice(1)}",revision:null` : ''}`)
    return send(200, 'text/javascript', script)
  }
  if (url.pathname === legacyAsset && version === 'A') return send(200, 'text/javascript', '/* legacy chunk */')
  if (url.pathname === '/' || url.pathname === '/index.html' || /^\/(login|register|notes\/[^/]+)$/.test(url.pathname)) {
    return send(200, 'text/html', html.replace('</head>', `<meta name="fixture-build" content="${version}"></head>`))
  }
  const file = path.join(dist, url.pathname)
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, 'text/plain', 'missing')
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
  send(200, types[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file))
})

async function queuedIds(page) {
  return page.evaluate(async noteId => {
    const { name } = (await indexedDB.databases()).find(db => db.name.startsWith('seam-note-tiptap-v1:account:'))
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('outbox').objectStore('outbox').index('noteId').getAll(noteId)
        request.onsuccess = () => resolve(request.result.map(operation => operation.operationId).sort())
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  }, note.id)
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext()
    const editor = await context.newPage()
    await editor.goto(origin + '/login')
    await editor.getByLabel('이메일', { exact: true }).fill(user.email)
    await editor.getByLabel('비밀번호', { exact: true }).fill('synthetic-password')
    await editor.getByRole('button', { name: '로그인', exact: true }).click()
    await editor.waitForURL(origin + '/notes/' + note.id)
    const body = editor.getByLabel('문서 내용', { exact: true })
    await editor.locator('[contenteditable=true][aria-label]').waitFor()
    await body.fill('서버에 보내지 않은 원고')
    await editor.getByText(/로컬 저장됨/).waitFor()
    const queued = await queuedIds(editor)
    assert.ok(queued.length > 0)
    await editor.waitForFunction(() => !!navigator.serviceWorker.controller)
    await body.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))

    const register = await context.newPage()
    await register.goto(origin + '/register')
    await register.getByRole('heading', { name: '이메일로 가입하기' }).waitFor()
    assert.equal(await register.locator('meta[name="fixture-build"]').getAttribute('content'), 'A')
    version = 'B'
    await register.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await register.locator('meta[name="fixture-build"][content="B"]').waitFor({ state: 'attached' })
    assert.equal(await editor.locator('meta[name="fixture-build"]').getAttribute('content'), 'A')
    assert.equal(await editor.evaluate(async url => (await fetch(url)).text(), legacyAsset), '/* legacy chunk */')

    await context.setOffline(true)
    await body.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await editor.locator('meta[name="fixture-build"][content="B"]').waitFor({ state: 'attached' })
    await editor.getByText('서버에 보내지 않은 원고', { exact: true }).waitFor()
    assert.deepEqual(await queuedIds(editor), queued)
    console.log('PASS: registration updates first, older chunk stays available, editing tab reloads offline and restores its unsent draft')
  } finally {
    await browser?.close()
    server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
