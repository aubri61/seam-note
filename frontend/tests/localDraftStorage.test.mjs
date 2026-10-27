import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const { DraftSession, hasUnprotectedChanges } = await load('features/local-drafts/draftSession')
const { LocalDraftConflict } = await load('features/local-drafts/localDraftTypes')
const { validateLocalDraft } = await load('features/local-drafts/draftDatabase')
const { localDraftStatus } = await load('features/local-drafts/localDraftStatus')
const { isDraftDirty } = await load('features/notes/noteDrafts')
const server = (id = 'A', version = 2, content = '서버 본문') => ({ id, folderId: 'folder', title: '제목', content, version, sortOrder: 0, createdAt: '', updatedAt: '' })
const stored = (id = 'A', content = '로컬 원고') => ({ noteId: id, title: '제목', content, baseVersion: 2, baseTitle: '제목', baseContent: '서버 본문', latestServerVersion: 2, localRevision: 7, localSavedAt: 1, storageToken: 'token-7', writerId: 'previous-session' })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const settle = () => new Promise(resolve => setImmediate(resolve))
class Clock {
  time = 0; next = 0; jobs = new Map()
  now = () => this.time
  setTimeout = (fn, delay) => { const id = ++this.next; this.jobs.set(id, { at: this.time + delay, fn }); return id }
  clearTimeout = id => this.jobs.delete(id)
  advance(ms) {
    const end = this.time + ms
    while (true) {
      const due = [...this.jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= end)
      if (!due) break
      this.time = due[1].at; this.jobs.delete(due[0]); due[1].fn()
    }
    this.time = end
  }
}
class Repository {
  records = new Map(); attempts = []; reads = 0; readGate; writeGate; failRead; failWrite; tokens = 10
  async read(id) {
    this.reads++
    if (this.readGate) await this.readGate.promise
    if (this.failRead) throw this.failRead
    return structuredClone(this.records.get(id))
  }
  async write(draft, revision, expectedToken, writerId) {
    this.attempts.push({ draft, revision, expectedToken })
    const gate = this.writeGate
    if (gate) await gate.promise
    if (this.failWrite) throw this.failWrite
    const previous = this.records.get(draft.noteId)
    if (previous?.storageToken !== expectedToken || previous && revision <= previous.localRevision) throw new LocalDraftConflict()
    const record = { ...draft, localRevision: revision, localSavedAt: 100, storageToken: 'token-' + this.tokens++, writerId }
    this.records.set(draft.noteId, record)
    return structuredClone(record)
  }
}
function setup(t, record) {
  t.mock.method(console, 'warn', () => {})
  const repo = new Repository(), clock = new Clock()
  if (record) repo.records.set(record.noteId, record)
  const session = new DraftSession(repo, 'writer-A', clock)
  return { repo, clock, session, get: id => session.getSnapshot()[id ?? 'A'] }
}
async function ready(session, note = server()) { session.select(note.id); session.receive(note); await settle() }

test('recovery barrier: server first cannot initialize or write over a delayed dirty local draft', async t => {
  const { repo, session, get, clock } = setup(t, stored())
  repo.readGate = deferred()
  session.select('A'); session.receive(server('A', 1))
  clock.advance(5000)
  assert.equal(get().draft, null)
  assert.equal(repo.attempts.length, 0)
  repo.readGate.resolve(); await settle()
  assert.equal(get().draft.content, '로컬 원고')
  assert.equal(get().draft.baseVersion, 2)
  assert.equal(isDraftDirty(get().draft), true)
  assert.equal(repo.attempts.length, 0)
})
test('StrictMode-like repeated select/flush reuses one pending recovery and never writes blank data', async t => {
  const { repo, session, get } = setup(t, stored())
  repo.readGate = deferred()
  session.select('A'); session.receive(server()); await session.flush('A'); session.select('A'); session.receive(server())
  assert.equal(repo.reads, 1)
  repo.readGate.resolve(); await settle()
  assert.equal(get().draft.content, '로컬 원고')
  assert.equal(repo.attempts.length, 0)
})
test('400ms debounce coalesces edits and only marks saved after commit', async t => {
  const { repo, session, get, clock } = setup(t)
  await ready(session); await session.flush('A')
  const initial = repo.attempts.length
  session.edit('A', { title: '편집 제목', content: '초안 1' })
  clock.advance(300); session.edit('A', { content: '초안 2' })
  clock.advance(399); assert.equal(repo.attempts.length, initial)
  clock.advance(1); await settle()
  assert.equal(repo.attempts.length, initial + 1)
  assert.equal(repo.records.get('A').content, '초안 2')
  assert.equal(get().phase, 'saved')
  assert.equal(get().revision, get().savedRevision)
  assert.equal(isDraftDirty(get().draft), true)
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), false)
})
test('continuous typing attempts storage within 2s rather than writing each keystroke', async t => {
  const { repo, session, clock } = setup(t)
  await ready(session); await session.flush('A')
  const count = repo.attempts.length
  for (let i = 0; i < 25; i++) {
    session.edit('A', { content: '입력 ' + i }); clock.advance(100); await settle()
    if (i === 19) assert.equal(repo.attempts.length, count + 1)
  }
  clock.advance(400); await settle()
  assert.equal(repo.records.get('A').content, '입력 24')
  assert.equal(repo.attempts.length, count + 2)
})
test('slow write plus newer input serializes and drains the latest revision without a false saved state', async t => {
  const { repo, session, get, clock } = setup(t)
  await ready(session); await session.flush('A')
  const observed = []
  const unsubscribe = session.subscribe(() => observed.push(get()))
  repo.writeGate = deferred()
  session.edit('A', { content: '이전 스냅샷' }); clock.advance(400)
  assert.equal(get().phase, 'saving')
  session.edit('A', { content: '최신 입력' }); clock.advance(400)
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), true)
  const gate = repo.writeGate; repo.writeGate = null; gate.resolve(); await settle(); await settle()
  assert.equal(repo.records.get('A').content, '최신 입력')
  assert.equal(get().phase, 'saved')
  assert.ok(observed.filter(entry => entry.phase === 'saved').every(entry => entry.revision === entry.savedRevision))
  unsubscribe()
})
test('switch flush writes immediately and A/B state remains independently keyed', async t => {
  const { repo, session, get } = setup(t)
  await ready(session); await session.flush('A')
  session.edit('A', { content: 'A 전환 직전' })
  await session.flush('A')
  await ready(session, server('B'))
  session.edit('B', { title: '' }); await session.flush('B')
  session.select('A')
  assert.equal(repo.records.get('A').content, 'A 전환 직전')
  assert.equal(get().draft.content, 'A 전환 직전')
  assert.equal(get('B').draft.title, '')
})
test('dirty stays true after local save, and reverting still requires persisting over the old local draft', async t => {
  const { session, get } = setup(t)
  await ready(session); await session.flush('A')
  session.edit('A', { title: '', content: '' }); await session.flush('A')
  assert.equal(isDraftDirty(get().draft), true)
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), false)
  session.edit('A', { title: '제목', content: '서버 본문' })
  assert.equal(isDraftDirty(get().draft), false)
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), true)
  await session.flush('A')
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), false)
})
test('quota failure preserves memory and previous record, has no automatic loop, and retries latest input', async t => {
  const { repo, session, get, clock } = setup(t)
  await ready(session); await session.flush('A')
  repo.failWrite = Object.assign(new Error('private payload must not be logged'), { name: 'QuotaExceededError' })
  session.edit('A', { content: '보존할 작성 내용' }); await session.flush('A')
  const failedAttempts = repo.attempts.length
  session.edit('A', { content: '실패 후 추가 작성' }); clock.advance(10000); await settle()
  assert.equal(repo.attempts.length, failedAttempts)
  assert.equal(get().draft.content, '실패 후 추가 작성')
  assert.equal(get().phase, 'failed')
  assert.match(get().error, /공간/)
  assert.equal(repo.records.get('A').content, '서버 본문')
  repo.failWrite = null; await session.retry('A')
  assert.equal(repo.records.get('A').content, '실패 후 추가 작성')
  assert.equal(get().phase, 'saved')
})
test('read failure allows memory input but no blind write; retry with no record safely persists it', async t => {
  const { repo, session, get } = setup(t)
  repo.failRead = Error('DB closed')
  await ready(session)
  session.edit('A', { content: '메모리 입력' }); await session.flush('A')
  assert.equal(get().phase, 'failed')
  assert.equal(repo.attempts.length, 0)
  repo.failRead = null; await session.retry('A'); await session.flush('A')
  assert.equal(repo.records.get('A').content, '메모리 입력')
})
test('late recovery after read failure never discards a different dirty local record or memory edit', async t => {
  const { repo, session, get } = setup(t, stored())
  repo.failRead = Error('unavailable')
  await ready(session)
  session.edit('A', { content: '복구 실패 중 입력' })
  repo.failRead = null; await session.retry('A')
  assert.equal(get().phase, 'conflict')
  assert.equal(get().draft.content, '복구 실패 중 입력')
  assert.equal(repo.records.get('A').content, '로컬 원고')
  assert.equal(repo.attempts.length, 0)
})
test('equal independently incremented revisions in two tabs cannot overwrite the winning transaction', async t => {
  const { repo, session, clock, get } = setup(t, stored())
  const second = new DraftSession(repo, 'writer-B', clock)
  await ready(session); await ready(second)
  session.edit('A', { content: '첫 탭 변경' }); second.edit('A', { content: '둘째 탭 변경' })
  assert.equal(get().revision, second.getSnapshot().A.revision)
  await session.flush('A'); await second.flush('A')
  assert.equal(repo.records.get('A').content, '첫 탭 변경')
  assert.equal(second.getSnapshot().A.draft.content, '둘째 탭 변경')
  assert.equal(second.getSnapshot().A.phase, 'conflict')
  assert.equal(hasUnprotectedChanges(second.getSnapshot()), true)
  await second.retry('A')
  assert.equal(repo.records.get('A').content, '첫 탭 변경')
})
test('server rebase is persisted only when clean; dirty recovered baseline is never advanced', async t => {
  const { repo, session, get } = setup(t, stored('A', '서버 본문'))
  await ready(session, server('A', 3, '새 서버 원고')); await session.flush('A')
  assert.equal(get().draft.baseVersion, 3)
  session.edit('A', { content: '사용자 초안' })
  session.receive(server('A', 4, '서버 4')); await session.flush('A')
  assert.equal(repo.records.get('A').baseVersion, 3)
  assert.equal(repo.records.get('A').latestServerVersion, 4)
  assert.equal(repo.records.get('A').content, '사용자 초안')
})
test('invalid records and stale revisions fail closed; status separates local commit from server dirty', () => {
  assert.equal(validateLocalDraft(stored()).localRevision, 7)
  assert.throws(() => validateLocalDraft({ ...stored(), storageToken: '' }), /not supported/)
  assert.throws(() => validateLocalDraft({ ...stored(), localRevision: 0 }), /not supported/)
  const entry = { draft: stored(), revision: 8, savedRevision: 7, savedAt: 1, phase: 'waiting', error: null }
  assert.equal(localDraftStatus(entry, false, false, null), '편집 중 / 로컬 저장 대기')
  assert.equal(localDraftStatus({ ...entry, phase: 'saving' }, false, false, null), '로컬 저장 중')
  assert.equal(localDraftStatus({ ...entry, phase: 'saved', savedRevision: 8 }, false, false, null), '로컬 저장됨 · 서버 미동기화')
  assert.equal(localDraftStatus({ ...entry, phase: 'failed' }, false, false, null), '로컬 저장 실패')
})

test('a failed head verification of an already saved draft can recover without getting stuck waiting', async t => {
  const { repo, session, get } = setup(t, stored())
  const read = repo.read.bind(repo)
  let failVerification = true
  repo.read = async id => {
    const record = await read(id)
    if (repo.reads > 1 && failVerification) throw Error('verification unavailable')
    return record
  }
  await ready(session)
  assert.equal(get().phase, 'failed')
  assert.equal(get().revision, get().savedRevision)
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), true)
  failVerification = false
  await session.retry('A')
  assert.equal(get().phase, 'saved')
  assert.equal(hasUnprotectedChanges(session.getSnapshot()), false)
  assert.equal(repo.attempts.length, 0)
})

test('flushLatest drains edits made while an earlier local write is still pending', async t => {
  const { repo, session, get } = setup(t, stored('A', '서버 본문'))
  await ready(session)
  repo.writeGate = deferred(); session.edit('A', { content: '첫 입력' })
  const complete = session.flushLatest('A'); await settle()
  session.edit('A', { content: '최종 입력' }); repo.writeGate.resolve()
  await complete
  assert.equal(repo.records.get('A').content, '최종 입력')
  assert.equal(get().revision, get().savedRevision)
})
test('ack fence preserves new input and rebases its baseline while local writes are paused', async t => {
  const { repo, session, get } = setup(t, stored('A', '서버 본문'))
  await ready(session);session.edit('A',{content:'전송 snapshot'});await session.flushLatest('A')
  const gate=deferred(),response=server('A',3,'전송 snapshot')
  const ack=session.acceptServerAck('A',response,async(token,revision,writerId)=>{
    await gate.promise
    const old=repo.records.get('A');assert.equal(old.storageToken,token);assert.equal(old.localRevision,revision)
    const next={...old,baseVersion:3,baseContent:response.content,localRevision:revision+1,storageToken:'ack-token',writerId}
    repo.records.set('A',next);return next
  })
  await settle();const attempts=repo.attempts.length
  session.edit('A',{content:'ack 중 추가 입력'});session.receive(server('A',4,'다른 서버 원고'))
  await session.flush('A');assert.equal(repo.attempts.length,attempts);assert.equal(get().phase,'waiting')
  gate.resolve();await ack;await session.flushLatest('A')
  assert.equal(get().draft.content,'ack 중 추가 입력');assert.equal(get().draft.baseContent,'전송 snapshot')
  assert.equal(get().draft.baseVersion,3);assert.equal(get().draft.latestServerVersion,4)
  assert.equal(repo.records.get('A').content,'ack 중 추가 입력')
})
test('a newer server snapshot received during a clean ack is applied after the fence', async t => {
  const {repo,session,get}=setup(t,stored('A','서버 본문'))
  await ready(session);session.edit('A',{content:'전송'});await session.flushLatest('A')
  const gate=deferred(),response=server('A',3,'전송')
  const ack=session.acceptServerAck('A',response,async()=>{
    await gate.promise;const old=repo.records.get('A')
    const next={...old,baseVersion:3,baseContent:'전송',localRevision:old.localRevision+1,storageToken:'ack-token'}
    repo.records.set('A',next);return next
  })
  await settle();session.receive(server('A',4,'최신 서버'));gate.resolve();await ack;await session.flushLatest('A')
  assert.equal(get().draft.content,'최신 서버');assert.equal(get().draft.baseVersion,4)
})
test('a stale-head ack rejection stops saving without clearing the current draft', async t => {
  const {repo,session,get}=setup(t,stored())
  await ready(session);const before=structuredClone(repo.records.get('A'))
  await assert.rejects(()=>session.acceptServerAck('A',server('A',3,'로컬 원고'),async()=>{throw new LocalDraftConflict()}))
  assert.equal(get().phase,'conflict');assert.equal(get().draft.content,'로컬 원고')
  assert.deepEqual(repo.records.get('A'),before)
})


test('manual uncertainty protects a clean revert from refetch until the real ack', async t => {
  const {session,get}=setup(t,stored('A','서버 본문'))
  await ready(session)
  session.protectServerForManual('A')
  session.edit('A',{content:'전송 snapshot'});await session.flushLatest('A')
  session.edit('A',{content:'서버 본문'})
  session.receive(server('A',3,'전송 snapshot'));await session.flushLatest('A')
  assert.equal(get().draft.content,'서버 본문');assert.equal(get().draft.baseVersion,2)
  assert.equal(get().draft.latestServerVersion,3);assert.equal(get().serverProtected,true)
  assert.equal(localDraftStatus(get(),false,false,null),'서버 결과 확인 필요')
})
test('recovery derives protection from a frozen Outbox even when the draft is clean', async t => {
  const {session,get}=setup(t,{...stored('A','서버 본문'),serverOperationPending:true})
  await ready(session,server('A',3,'未確定 snapshot'))
  assert.equal(get().draft.content,'서버 본문');assert.equal(get().draft.baseVersion,2)
  assert.equal(get().serverProtected,true)
})

// Multi-tab reconciliation: checkpoint means the last committed local text, not the server baseline.
const external = (repo, changes = {}) => {
  const old = repo.records.get('A')
  const record = { ...old, localRevision: old.localRevision + 1, storageToken: old.storageToken + '-external', ...changes }
  repo.records.set('A', record); return record
}
test('ACK-only changes adopt the verified base and leave the body unchanged', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session)
  const record = external(repo, { baseVersion: 3, baseContent: '로컬 원고', latestServerVersion: 3 })
  await session.checkHead('A')
  assert.equal(get().phase, 'saved'); assert.equal(get().draft.content, '로컬 원고'); assert.equal(get().draft.baseVersion, 3)
  assert.deepEqual(session.savedHead('A'), { token: record.storageToken, revision: record.localRevision })
})
test('uncommitted edit rebases over metadata only with a transactional compatibility proof', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session)
  session.edit('A', { content: 'new memory' })
  external(repo, { baseVersion: 3, baseContent: '로컬 원고', latestServerVersion: 3, canRebaseLocalEdits: true })
  await session.checkHead('A')
  assert.equal(get().phase, 'waiting'); assert.equal(get().draft.content, 'new memory'); assert.equal(get().draft.baseVersion, 3)
  assert.ok(get().revision > get().savedRevision); assert.equal(hasUnprotectedChanges(session.getSnapshot()), true)
  await session.flushLatest('A'); assert.equal(repo.records.get('A').content, 'new memory'); assert.equal(get().phase, 'saved')
})
test('uncertain operation blocks carrying new edits onto a different token', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); session.edit('A', { content: 'memory' })
  external(repo, { baseVersion: 3, serverOperationPending: true, canRebaseLocalEdits: false })
  await session.checkHead('A'); assert.equal(get().phase, 'conflict'); assert.equal(get().draft.content, 'memory'); assert.equal(repo.attempts.length, 0)
})
test('equal text can follow the record without deleting an uncertain operation protection', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session)
  external(repo, { serverOperationPending: true, canRebaseLocalEdits: false })
  await session.checkHead('A'); assert.equal(get().phase, 'saved'); assert.equal(get().serverProtected, true)
})
test('observer follows latest local text after previously editing and committing its own text', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); session.edit('A', { content: 'own committed' }); await session.flushLatest('A')
  external(repo, { content: 'other tab committed' }); await session.checkHead('A')
  assert.equal(get().draft.content, 'other tab committed'); assert.equal(get().phase, 'saved')
})
test('divergent text remains a conflict across repeated retry without writes', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); session.edit('A', { content: 'my memory' }); external(repo, { content: 'other text', canRebaseLocalEdits: true })
  await session.checkHead('A'); await session.retry('A'); await session.retry('A')
  assert.equal(get().phase, 'conflict'); assert.equal(get().draft.content, 'my memory'); assert.equal(repo.records.get('A').content, 'other text'); assert.equal(repo.attempts.length, 0)
  assert.equal(localDraftStatus(get(), false, false, null), '다른 탭과 로컬 충돌')
})
test('missing committed record is never interpreted as permission to recreate', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); repo.records.delete('A'); await session.checkHead('A'); await session.retry('A')
  assert.equal(get().phase, 'conflict'); assert.equal(get().draft.content, '로컬 원고'); assert.equal(repo.attempts.length, 0)
})
test('older base cannot be adopted even with equal text', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); external(repo, { baseVersion: 1 }); await session.checkHead('A')
  assert.equal(get().phase, 'conflict'); assert.equal(get().draft.baseVersion, 2)
})
test('missed ACK notification re-reads after CAS then retries using the normal CAS', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session)
  const record = external(repo, { baseVersion: 3, latestServerVersion: 3, canRebaseLocalEdits: true }); session.edit('A', { content: 'memory after ACK' })
  await session.flushLatest('A'); assert.equal(get().phase, 'saved'); assert.equal(repo.records.get('A').baseVersion, 3)
  assert.equal(repo.attempts.length, 2); assert.notEqual(repo.attempts[0].expectedToken, record.storageToken); assert.equal(repo.attempts[1].expectedToken, record.storageToken)
})
test('second concurrent change is still caught by CAS after a verified metadata rebase', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session); session.edit('A', { content: 'my memory' })
  external(repo, { baseVersion: 3, canRebaseLocalEdits: true }); await session.checkHead('A')
  external(repo, { content: 'other changed again' }); await session.flushLatest('A').catch(() => {})
  assert.equal(get().phase, 'conflict'); assert.equal(get().draft.content, 'my memory'); assert.equal(repo.records.get('A').content, 'other changed again')
})
test('input during head read is compared at resolution and is not replaced by an old captured memory', async t => {
  const { repo, session, get } = setup(t, stored()); await ready(session)
  repo.readGate = deferred(); const checking = session.checkHead('A'); session.edit('A', { content: 'during read' })
  external(repo, { content: 'other text' }); repo.readGate.resolve(); await checking
  assert.equal(get().phase, 'conflict'); assert.equal(get().draft.content, 'during read')
})
