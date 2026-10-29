// Isolated real IndexedDB + production PWA. HTTP API is a synthetic fixture; no cloud access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '../../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'seam-initial-recovery-'))
const results = []
const contexts = new Set()
const pause = ms => new Promise(ok => setTimeout(ok, ms))
const rich = text => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const pass = name => { results.push({ name, passed: true }); console.log('PASS:', name) }
async function until(fn, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await fn()) return; await pause(50) }
  throw Error('Timeout: ' + label)
}
async function state(page, id) {
  return page.evaluate(async id => {
    const db = await new Promise((ok, no) => { const r = indexedDB.open('seam-note-tiptap-v1'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
    try {
      return await new Promise((ok, no) => {
        const tx = db.transaction(['drafts', 'outbox'], 'readonly'), all = {}
        for (const name of ['drafts', 'outbox']) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { all[name] = r.result } }
        tx.oncomplete = () => ok({ draft: all.drafts.find(d => d.noteId === id), ops: all.outbox.filter(o => o.noteId === id) }); tx.onabort = () => no(tx.error)
      })
    } finally { db.close() }
  }, id)
}
const editor = page => page.locator('[aria-label="문서 내용"][contenteditable="true"]')
async function acked(page, id, text) {
  await until(async () => { const s = await state(page, id); return s.draft?.content.includes(text) && s.draft.content === s.draft.baseContent && s.ops.length === 0 }, 'ACK ' + text)
}
async function storageGuards(viteOrigin) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext()
  try {
    await context.route('**/__storage_probe__', route => route.fulfill({ contentType: 'text/html', body: '<html>Isolated storage probe</html>' }))
    const page = await context.newPage(); await page.goto(viteOrigin + '/__storage_probe__')
    const checks = await page.evaluate(async () => {
      const { draftRepository: repo, draftDatabase: db } = await import('/src/features/local-drafts/draftDatabase.ts')
      const { DraftSession } = await import('/src/features/local-drafts/draftSession.ts')
      const checks = [], check = (condition, label) => { if (!condition) throw Error(label); checks.push(label) }
      const doc = text => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
      const draft = id => ({ noteId: id, title: 'synthetic', content: doc('server'), baseTitle: 'synthetic', baseContent: doc('server'), baseVersion: 0, latestServerVersion: 0 })
      const fails = async (fn, name) => { try { await fn() } catch (e) { if (e.name === name) return true; throw e } return false }
      const fresh = crypto.randomUUID()
      check(await repo.read(fresh, { initial: true }) === undefined, 'empty IndexedDB is a normal first-open state')
      for (const status of ['pending', 'inFlight', 'conflict']) {
        const id = crypto.randomUUID(), initial = await repo.write(draft(id), 1, undefined, 'fixture')
        const saved = await repo.write({ ...draft(id), content: doc('unsent original') }, 2, initial.storageToken, 'fixture')
        const op = (await db.outbox.where('noteId').equals(id).toArray())[0]
        if (status !== 'pending') await db.outbox.put({ ...op, status, attemptedAt: op.createdAt, updatedAt: op.createdAt, ...(status === 'conflict' ? { failureCode: 'VERSION_CONFLICT' } : {}) })
        await db.drafts.delete(id)
        const before = JSON.stringify(await db.outbox.where('noteId').equals(id).toArray())
        check(await fails(() => repo.read(id, { initial: true }), 'MissingDraftRecoveryBlocked'), 'orphan ' + status + ' queue blocks initial recovery')
        check(await fails(() => repo.write(draft(id), 1, undefined, 'new session'), 'MissingDraftRecoveryBlocked'), 'orphan ' + status + ' queue blocks first write atomically')
        check(before === JSON.stringify(await db.outbox.where('noteId').equals(id).toArray()) && !await db.drafts.get(id), 'orphan ' + status + ' operation payload and key survive')
        if (status === 'pending') {
          const restored = await repo.restoreMissing({ ...saved, content: doc('checkpoint recovery') }, 3, { draft: saved, revision: saved.localRevision, storageToken: saved.storageToken }, 'original session')
          check(restored.content === doc('checkpoint recovery'), 'known missing checkpoint still restores matching pending queue')
        } else {
          check(await fails(() => repo.restoreMissing(saved, 3, { draft: saved, revision: saved.localRevision, storageToken: saved.storageToken }, 'original session'), 'MissingDraftRecoveryBlocked'), 'frozen ' + status + ' checkpoint cannot overwrite unresolved queue')
        }
      }
      const race = crypto.randomUUID(); await repo.read(race, { initial: true })
      await db.outbox.add({ operationId: crypto.randomUUID(), noteId: race, type: 'NOTE_UPDATE', title: 'original', content: doc('original'), expectedVersion: 0, localRevision: 1, status: 'pending', attemptedAt: null, createdAt: Date.now(), updatedAt: Date.now() })
      check(await fails(() => repo.write(draft(race), 1, undefined, 'new session'), 'MissingDraftRecoveryBlocked'), 'queue appearing after initial read still blocks the write')
      const competing = crypto.randomUUID(); await repo.read(competing, { initial: true })
      const winner = await repo.write({ ...draft(competing), content: doc('other tab') }, 1, undefined, 'other tab')
      check(await fails(() => repo.write(draft(competing), 1, undefined, 'this tab'), 'LocalDraftConflict') && (await db.drafts.get(competing)).storageToken === winner.storageToken, 'first-write CAS preserves a competing tab record')
      const create = crypto.randomUUID(); await repo.createLocalNote({ id: create, folderId: null, title: 'local creation', content: doc('local-only content') }); await db.drafts.delete(create)
      const queuedCreation = JSON.stringify(await db.creationOutbox.where('entityId').equals(create).toArray())
      check(await fails(() => repo.read(create, { initial: true }), 'MissingDraftRecoveryBlocked') && await fails(() => repo.write(draft(create), 1, undefined, 'new session'), 'MissingDraftRecoveryBlocked') && queuedCreation === JSON.stringify(await db.creationOutbox.where('entityId').equals(create).toArray()), 'orphan creation and unconfirmed local entity are preserved')
      const deleted = crypto.randomUUID(); await db.deletedEntities.put({ key: 'note:' + deleted, id: deleted, kind: 'note', deletedAt: Date.now() })
      check(await fails(() => repo.read(deleted, { initial: true }), 'LocalNoteDeleted') && await fails(() => repo.write(draft(deleted), 1, undefined, 'fixture'), 'LocalNoteDeleted'), 'explicit tombstone cannot be initialized again')
      const dirty = crypto.randomUUID(), clean = await repo.write(draft(dirty), 1, undefined, 'fixture')
      const pending = await repo.write({ ...draft(dirty), content: doc('dirty remains') }, 2, clean.storageToken, 'fixture')
      const session = new DraftSession(repo, 'this tab', { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} })
      session.select(dirty); await session.readyForSync(dirty)
      session.receive({ id: dirty, folderId: null, title: 'remote title', content: doc('late newer server'), version: 9, sortOrder: 0, createdAt: '', updatedAt: '' })
      const entry = session.getSnapshot()[dirty]
      check(entry.draft.content === pending.content && entry.draft.baseVersion === 0 && (await db.drafts.get(dirty)).storageToken === pending.storageToken, 'late GET preserves a dirty IndexedDB draft and original version fence')
      db.close(); return checks
    })
    for (const name of checks) pass(name)
  } finally { await context.close(); await browser.close() }
}
async function main() {
  const { createServer } = await import('vite')
  let vite, server
  const notes = new Map(), ledger = new Map(), puts = [], gets = new Set()
  let heldId, release
  const stamp = '2026-10-30T00:00:00Z'
  const seed = name => { const note = { id: randomUUID(), folderId: null, title: name, content: rich(name + ' server'), version: 0, sortOrder: notes.size, createdAt: stamp, updatedAt: stamp }; notes.set(note.id, note); return note }
  try {
    vite = await createServer({ root: path.join(root, 'frontend'), server: { host: '127.0.0.1', port: 0 } }); await vite.listen()
    await storageGuards('http://127.0.0.1:' + vite.httpServer.address().port)
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://fixture'), p = url.pathname
      const json = (status, body, headers = {}) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)) } }
      if (p.startsWith('/api/')) {
        if (p === '/api/workspace/tree') return json(200, { folders: [], notes: [...notes.values()] })
        const id = p.split('/').at(-1), note = notes.get(id)
        if (!note) return json(404, { code: 'NOTE_NOT_FOUND', message: 'synthetic', errors: [] })
        if (req.method === 'GET') {
          gets.add(id)
          if (id === heldId) await new Promise(ok => { release = ok })
          else await pause(1800)
          return json(200, note)
        }
        assert.equal(req.method, 'PUT')
        let raw = ''; for await (const chunk of req) raw += chunk
        const body = JSON.parse(raw), key = req.headers['idempotency-key']; assert.ok(key)
        puts.push({ id, key, version: body.expectedVersion })
        if (ledger.has(key)) return json(200, ledger.get(key), { 'Idempotency-Key': key })
        if (body.expectedVersion !== note.version) return json(409, { code: 'VERSION_CONFLICT', message: 'synthetic', errors: [] })
        const saved = { ...note, title: body.title, content: body.content, version: note.version + 1 }; notes.set(id, saved); ledger.set(key, saved)
        return json(200, saved, { 'Idempotency-Key': key })
      }
      const file = path.resolve(root, 'frontend/dist', p === '/' || p.startsWith('/notes/') ? 'index.html' : p.slice(1))
      if (!file.startsWith(path.join(root, 'frontend/dist/')) || !fs.existsSync(file)) { res.writeHead(404); return res.end() }
      res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'text/html')
      res.end(fs.readFileSync(file))
    })
    await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const origin = 'http://127.0.0.1:' + server.address().port
    const launch = async (name, offline = false) => { const c = await chromium.launchPersistentContext(path.join(work, name), { channel: 'chrome', headless: true, offline }); await c.setOffline(!offline); await c.setOffline(offline); contexts.add(c); return c }
    const close = async c => { await c.close(); contexts.delete(c) }
    const first = seed('first slow note')
    let context = await launch('first'), page = await context.newPage()
    await page.goto(origin + '/notes/' + first.id); await editor(page).waitFor()
    await until(async () => !!(await state(page, first.id)).draft, 'first snapshot after delayed GET')
    assert.equal(await page.getByRole('dialog').count(), 0); pass('1800ms first GET no longer causes initial LocalDraftConflict')
    await editor(page).fill('first automatic input'); await acked(page, first.id, 'first automatic input')
    assert.equal(notes.get(first.id).version, 1); pass('first edit automatically PUTs with version and ACK')
    await until(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), 'SW active')
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) { await page.reload(); await editor(page).waitFor() }
    await context.setOffline(true); await editor(page).fill('offline recovery input')
    await until(async () => (await state(page, first.id)).draft?.content.includes('offline recovery input'), 'offline local write'); await close(context)
    context = await launch('first', true); page = await context.newPage(); await page.goto(origin + '/notes/' + first.id); await editor(page).waitFor()
    assert.ok((await editor(page).innerText()).includes('offline recovery input')); pass('offline close and reopen retain draft and Outbox')
    await context.setOffline(false); await acked(page, first.id, 'offline recovery input'); assert.equal(notes.get(first.id).version, 2); pass('online recovery applies automatic ACK after delayed GET'); await close(context)
    const a = seed('late A'), b = seed('selected B'); heldId = a.id
    context = await launch('switch'); page = await context.newPage(); await page.goto(origin + '/notes/' + a.id)
    await until(() => gets.has(a.id) && !!release, 'held A request')
    await page.locator(`[data-node-key="note:${b.id}"] a`).click(); await editor(page).waitFor()
    await until(async () => !!(await state(page, b.id)).draft, 'B snapshot'); await editor(page).fill('B input remains'); release(); heldId = undefined
    await acked(page, b.id, 'B input remains'); assert.ok((await editor(page).innerText()).includes('B input remains')); assert.equal(puts.filter(p => p.id === a.id).length, 0); pass('A to B during first GET preserves B input and sends no A update'); await close(context)
    const output = { scope: 'LOCAL real Chromium/IndexedDB + production PWA with synthetic HTTP API; no EC2/Supabase/Vercel changes', results, count: results.length }
    fs.writeFileSync(process.env.SEAM_INITIAL_RECOVERY_REPORT || path.join(root, 'docs/verification/2026-10-30-initial-draft-recovery-browser.json'), JSON.stringify(output, null, 2) + '\n')
  } finally {
    release?.(); for (const c of contexts) await c.close()
    if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)) }
    if (vite) await vite.close()
    console.log('Isolated browser artifacts:', work)
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
