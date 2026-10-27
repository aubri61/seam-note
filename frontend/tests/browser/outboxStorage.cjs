// Real IndexedDB in disposable contexts. No app/user profile, no server writes or sync engine.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext(), page = await context.newPage()
    let apiCalls = 0
    page.on('console', message => { if (message.text().startsWith('OUTBOX TEST:')) console.log(message.text()) })
    await page.route(url => url.pathname.startsWith('/api/'), route => { apiCalls++; return route.abort() })
    await page.route(url => url.pathname === '/outbox-test', async route => {
      const response = await route.fetch({ url: origin + '/' })
      const html = (await response.text()).replace(/<script[^>]*src=["']\/src\/main\.tsx["'][^>]*>\s*<\/script>/, '')
      await route.fulfill({ response, body: html })
    })
    await page.goto(origin + '/outbox-test')
    const results = await page.evaluate(async () => {
      try {
      window.testStage = "imports"
      const { DraftDatabase, DexieDraftRepository } = await import('/src/features/local-drafts/draftDatabase.ts')
      const { DraftSession } = await import('/src/features/local-drafts/draftSession.ts')
      const Dexie = Object.getPrototypeOf(DraftDatabase), results = []
      const stage = name => { window.testStage = name; console.log('OUTBOX TEST: ' + name) }
      const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
      const check = (value, label) => { if (!value) throw Error(label) }
      const reject = async (fn, name) => { try { await fn() } catch(e) { check(!name || e.name === name, 'unexpected rejection type'); return } throw Error('Expected rejection') }
      const draft = (id = crypto.randomUUID(), dirty = true) => ({ noteId: id, title: '', content: dirty ? 'local' : 'server',
        baseTitle: '', baseContent: 'server', baseVersion: 2, latestServerVersion: 2, localRevision: 7,
        localSavedAt: 100, storageToken: 'seed-token', writerId: 'fixture' })
      const open = async record => {
        const db = new DraftDatabase('test-outbox-' + crypto.randomUUID()), repo = new DexieDraftRepository(db)
        if (record) await db.drafts.put(record)
        return { db, repo }
      }
      stage('legacy upgrade')
      const dirty = draft(), clean = draft(crypto.randomUUID(),false), legacyName = 'test-legacy-' + crypto.randomUUID()
      const legacy = new Dexie(legacyName);legacy.version(1).stores({drafts:'&noteId'})
      await legacy.table('drafts').bulkPut([dirty,clean]);legacy.close()
      const migrated = new DraftDatabase(legacyName), repo = new DexieDraftRepository(migrated)
      const dirtyView=await repo.read(dirty.noteId),cleanView=await repo.read(clean.noteId)
      check(same(await migrated.drafts.get(dirty.noteId),dirty),'v1 persisted dirty record unchanged')
      check(same(await migrated.drafts.get(clean.noteId),clean),'v1 persisted clean record unchanged')
      check(dirtyView.canRebaseLocalEdits===true&&cleanView.canRebaseLocalEdits===true,'read-only compatibility projections are available')
      check(!('canRebaseLocalEdits' in await migrated.drafts.get(dirty.noteId)),'read projection is never persisted')
      check(migrated.verno===4,'upgraded through unchanged v2/v3 to additive v4')
      let operations = await repo.listOperations(dirty.noteId)
      check(operations.length===1&&operations[0].expectedVersion===2&&operations[0].localRevision===7,'dirty backfill')
      check((await repo.listOperations(clean.noteId)).length===0,'clean is not queued')
      migrated.close()
      const reopened = new DraftDatabase(legacyName), reopenedRepo = new DexieDraftRepository(reopened)
      await reopenedRepo.read(dirty.noteId)
      check((await reopenedRepo.listOperations(dirty.noteId)).length===1,'reopen does not duplicate backfill')
      reopened.close()
      results.push('v1 data preserved, dirty-only atomic backfill, no duplicate on reopen')

      stage('upgrade rollback')
      const badName='test-bad-upgrade-'+crypto.randomUUID(), bad = new Dexie(badName)
      bad.version(1).stores({drafts:'&noteId'});const invalid={...draft(),localRevision:0}
      await bad.table('drafts').bulkPut([draft(),invalid]);bad.close()
      const invalidDB = new DraftDatabase(badName), invalidRepo = new DexieDraftRepository(invalidDB)
      await reject(()=>invalidRepo.read(invalid.noteId));invalidDB.close()
      const inspect = new Dexie(badName);await inspect.open()
      check(inspect.verno===1&&inspect.tables.length===1,'failed upgrade rolled back schema')
      check(same(await inspect.table('drafts').get(invalid.noteId),invalid),'invalid original record preserved');inspect.close()
      results.push('failed v1 upgrade rolls back schema and all backfill')

      stage('atomic write and rollback')
      const base=draft(), current = await open(base)
      let saved=await current.repo.write({...base,content:'first'},8,base.storageToken,'writer')
      const first=(await current.repo.listOperations(base.noteId))[0]
      check(first.content===saved.content&&first.localRevision===saved.localRevision,'draft+outbox commit')
      const before=await current.db.drafts.get(base.noteId), beforeOps=await current.repo.listOperations(base.noteId)
      const fail=()=>{throw new Error('test outbox insert failure')}
      current.db.outbox.hook('creating',fail)
      await reject(()=>current.repo.write({...saved,content:'must rollback'},9,saved.storageToken,'writer'))
      current.db.outbox.hook('creating').unsubscribe(fail)
      check(same(await current.db.drafts.get(base.noteId),before),'Draft rolled back')
      check(same(await current.repo.listOperations(base.noteId),beforeOps),'deleted pending restored on rollback')
      results.push('Draft/CAS/coalescing/Outbox insert atomic rollback')

      stage('coalescing and claim')
      for(let i=0;i<100;i++) saved=await current.repo.write({...saved,content:'x'.repeat(19990)+String(i).padStart(10,'0')},saved.localRevision+1,saved.storageToken,'writer')
      operations=await current.repo.listOperations(base.noteId)
      check(operations.length===1&&operations[0].content===saved.content,'100 updates coalesced to latest snapshot')
      check(operations[0].operationId!==first.operationId,'coalescing never repurposes keys')
      const frozen=await current.repo.claim(operations[0].operationId), frozenCopy=structuredClone(frozen)
      await reject(()=>current.repo.claim(frozen.operationId),'LocalDraftConflict')
      saved=await current.repo.write({...saved,content:'after claim'},saved.localRevision+1,saved.storageToken,'writer')
      operations=await current.repo.listOperations(base.noteId)
      check(same(operations.find(op=>op.operationId===frozen.operationId),frozenCopy),'inFlight request immutable')
      const successor=operations.find(op=>op.status==='pending')
      await reject(()=>current.repo.claim(successor.operationId),'LocalDraftConflict')
      saved=await current.repo.write({...saved,content:saved.baseContent},saved.localRevision+1,saved.storageToken,'writer')
      check((await current.repo.listOperations(base.noteId)).some(op=>op.status==='pending'&&op.content==='server'),'clean revert queued behind uncertain write')
      const conflict=await current.repo.markConflict(frozen.operationId)
      check(conflict.status==='conflict'&&conflict.operationId===frozen.operationId&&conflict.content===frozen.content&&conflict.expectedVersion===frozen.expectedVersion,'conflict retains snapshot')
      saved=await current.repo.write({...saved,content:'latest behind conflict'},saved.localRevision+1,saved.storageToken,'writer')
      check((await current.repo.listOperations(base.noteId)).length===2,'conflict plus one pending only')
      results.push('100 serial writes coalesce; claimed key frozen; uncertain/conflict blocks successor; clean compensation retained')

      stage('clean revert')
      const cleanBase=draft(), reverted=await open(cleanBase)
      let changed=await reverted.repo.write(cleanBase,8,cleanBase.storageToken,'writer')
      check((await reverted.repo.listOperations(cleanBase.noteId)).length===1,'initial dirty queued')
      changed=await reverted.repo.write({...changed,content:changed.baseContent},9,changed.storageToken,'writer')
      check((await reverted.repo.listOperations(cleanBase.noteId)).length===0,'unsent clean revert removes pending only')

      stage('two connections')
      const raceBase=draft(),left=await open(raceBase),rightDB=new DraftDatabase(left.db.name),rightRepo=new DexieDraftRepository(rightDB)
      await rightRepo.read(raceBase.noteId)
      const writes=await Promise.allSettled([left.repo.write({...raceBase,content:'left'},8,raceBase.storageToken,'left'),rightRepo.write({...raceBase,content:'right'},8,raceBase.storageToken,'right')])
      check(writes.filter(r=>r.status==='fulfilled').length===1,'two connections only one CAS succeeds')
      check(writes.filter(r=>r.status==='rejected'&&r.reason.name==='LocalDraftConflict').length===1,'stale CAS rejected')
      const winner=await left.repo.read(raceBase.noteId), queued=await left.repo.listOperations(raceBase.noteId)
      check(queued.length===1&&queued[0].content===winner.content,'no loser Outbox partial commit')
      const claimRace=await Promise.allSettled([left.repo.claim(queued[0].operationId),rightRepo.write({...winner,content:'new edit'},9,winner.storageToken,'right')])
      check(claimRace[1].status==='fulfilled','edit still saved during claim')
      const raceOps=await left.repo.listOperations(raceBase.noteId)
      check(raceOps.filter(op=>op.status==='pending').length===1,'claim race keeps latest pending')
      if(claimRace[0].status==='fulfilled')check(same(raceOps.find(op=>op.status==='inFlight'),claimRace[0].value),'claimed snapshot survived race')
      results.push('two connections stale CAS and claim/coalescing race protect both stores')

      stage('session edits')
      const quickBase=draft(),quick=await open(quickBase),session=new DraftSession(quick.repo,'session')
      session.select(quickBase.noteId)
      const deadline=Date.now()+5000
      while(session.getSnapshot()[quickBase.noteId]?.phase!=='saved') { check(Date.now()<deadline,'session ready timeout: '+session.getSnapshot()[quickBase.noteId]?.phase); await new Promise(r=>setTimeout(r,5)) }
      for(let i=0;i<100;i++)session.edit(quickBase.noteId,{content:'rapid '+i})
      await session.flush(quickBase.noteId)
      const quickDraft=await quick.repo.read(quickBase.noteId),quickOps=await quick.repo.listOperations(quickBase.noteId)
      check(quickDraft.content==='rapid 99'&&quickOps.length===1&&quickOps[0].content===quickDraft.content,'rapid session input records latest Outbox')
      results.push('100 immediate session edits persist matching latest Draft+Outbox')
      for(const db of [migrated,current.db,reverted.db,left.db,rightDB,quick.db])db.close()
      return results
      } catch(error) { throw new Error(window.testStage + ': ' + error.name + ': ' + error.message) }
    })
    assert.equal(apiCalls,0,'Outbox foundation must not send HTTP requests')
    for(const result of results)console.log('PASS: '+result)
    await context.close()
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
