// Real browser -> Vite proxy -> Spring -> disposable PostgreSQL. All writes target fixture.noteId only.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const fixture = JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'))
assert.equal(fixture.dbName,'seam_note_manual_lab'); assert.notEqual(fixture.dbPort,15439)
assert.match(fixture.noteId,/^[0-9a-f-]{36}$/)
const id=fixture.noteId, url=fixture.origin+'/notes/'+id, modulePath='/src/features/local-drafts/draftDatabase.ts'
const sha=s=>createHash('sha256').update(s).digest('hex'), md5=s=>createHash('md5').update(s).digest('hex')
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check,label) { const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await pause(20)}throw Error('Timeout: '+label) }
const title=p=>p.getByLabel('문서 제목'), body=p=>p.getByLabel('문서 내용'), button=p=>p.getByRole('button',{name:'서버에 저장',exact:true})
async function storage(page) { return page.evaluate(async({modulePath,id})=>{const {draftRepository:r}=await import(modulePath);return {draft:await r.read(id),ops:await r.listOperations(id)}},{modulePath,id}) }
async function stored(page,test,label) {await until(async()=>{const s=await storage(page);return !!s.draft&&test(s)},label)}
function sqlState() {
  const sql=`select json_build_object('noteId',n.id,'version',n.version,'titleMd5',md5(n.title),'contentMd5',md5(n.content),'ledger',coalesce((select json_agg(json_build_object('operationId',operation_id,'version',(response_json::jsonb->>'version')::bigint)) from note_update_operations where note_id=n.id),'[]'::json)) from notes n where id='${id}'::uuid`
  return JSON.parse(execFileSync('psql',['-h','127.0.0.1','-p',String(fixture.dbPort),'-U','postgres','-d',fixture.dbName,'-Atc',sql],{encoding:'utf8'}))
}
async function main() {
  const browser=await chromium.launch({channel:'chrome',headless:true}),contexts=[],network=[],steps=[],scenarios=[],pageErrors=[]
  const done=result=>{scenarios.push(result);fs.writeFileSync(path.join(fixture.workDirectory,'progress.json'),JSON.stringify({steps,scenarios,network},null,2));console.log('PASS: '+result.name)}
  let fresh,profile
  async function pageFor(context) {
    const page=await context.newPage();page.setDefaultTimeout(12000)
    page.on('pageerror',e=>pageErrors.push(e.message))
    page.on('request',r=>{
      if(r.method()==='PUT'){
        assert.equal(new URL(r.url()).pathname,'/api/notes/'+id,'Never PUT another note')
        const b=r.postDataJSON();network.push({operationId:r.headers()['idempotency-key'],expectedVersion:b.expectedVersion,titleHash:sha(b.title),contentHash:sha(b.content)})
      }
    })
    await page.goto(url)
    await until(async()=>await title(page).inputValue()!=='','editor recovery')
    await until(async()=>(await title(page).getAttribute('readonly'))===null,'editor enabled')
    await button(page).waitFor()
    return page
  }
  async function isolated() {const c=await browser.newContext({viewport:{width:1360,height:900}});contexts.push(c);return pageFor(c)}
  async function edit(page,t,c) {await title(page).fill(t);await body(page).fill(c)}
  async function acked(page,version,content) {
    await stored(page,s=>s.draft.baseVersion===version&&s.draft.content===content&&s.ops.length===0,'ack '+version)
    await until(()=>button(page).isDisabled(),'clean save is disabled')
    await page.getByText('서버에 저장할 변경사항이 없습니다.',{exact:false}).first().waitFor()
  }
  try {
    let page=await isolated();assert.equal(network.length,0,'Opening a note never sends PUT')
    const t1='학습 원고 1',c1='첫 수동 전송 본문'
    await edit(page,t1,c1)
    assert.equal(await title(page).inputValue(),t1)
    assert.equal(await page.locator(`[data-node-key="note:${id}"]`).innerText(),t1)
    steps.push({step:1,event:'edit-title',titleHash:sha(t1)},{step:2,event:'React-controlled-input-and-sidebar',titleHash:sha(await title(page).inputValue())})
    await stored(page,s=>s.draft.title===t1&&s.draft.content===c1&&s.ops.length===1,'initial Draft + pending')
    const pending=await storage(page),op1=pending.ops[0]
    assert.equal(op1.status,'pending');assert.equal(op1.expectedVersion,0)
    steps.push({step:3,event:'IndexedDB-drafts-commit',localRevision:pending.draft.localRevision,baseVersion:pending.draft.baseVersion,contentHash:sha(pending.draft.content)},
      {step:4,event:'Outbox-pending',operationId:op1.operationId,expectedVersion:op1.expectedVersion,localRevision:op1.localRevision})
    const responsePromise=page.waitForResponse(r=>r.request().method()==='PUT')
    await button(page).click();steps.push({step:5,event:'explicit-button-click'})
    const response=await responsePromise;assert.equal(response.status(),200);assert.equal(response.headers()['idempotency-key'],op1.operationId)
    const received=await response.json();assert.equal(received.version,1)
    steps.push({step:6,event:'Chrome-network-real-PUT',operationId:op1.operationId,status:response.status(),version:received.version})
    await acked(page,1,c1)
    const pg=sqlState();assert.equal(pg.version,1);assert.equal(pg.contentMd5,md5(c1));assert.equal(pg.titleMd5,md5(t1))
    assert.ok(pg.ledger.some(row=>row.operationId===op1.operationId&&row.version===1))
    steps.push({step:7,event:'PostgreSQL-idempotency-ledger',operationId:op1.operationId,records:pg.ledger.length},
      {step:8,event:'PostgreSQL-note-update',version:pg.version,contentMd5:pg.contentMd5},
      {step:9,event:'IndexedDB-atomic-ack',baseVersion:1,outboxCount:0})
    profile=fs.mkdtempSync(path.join(os.tmpdir(),'seam-note-manual-fresh-'))
    fresh=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true})
    const freshPage=await pageFor(fresh)
    assert.equal(await title(freshPage).inputValue(),t1);assert.equal(await body(freshPage).inputValue(),c1)
    await stored(freshPage,s=>s.draft.baseVersion===1,'fresh profile initial local commit')
    const recovered=await storage(freshPage);assert.equal(recovered.draft.baseVersion,1);assert.equal(recovered.ops.length,0)
    steps.push({step:10,event:'new-Chrome-profile-real-server-GET',baseVersion:1,contentHash:sha(await body(freshPage).inputValue())})
    await fresh.close();fresh=null
    await page.screenshot({path:path.join(fixture.workDirectory,'manual-sync-success.png'),fullPage:true})
    done({name:'real-vertical-slice',passed:true,version:1})

    // A successful HTTP update is held while both disk-backed and not-yet-written React edits occur.
    let held,forwarded=false
    await page.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const result=await route.fetch();forwarded=true
      await new Promise(resolve=>{held=resolve});await route.fulfill({response:result})
    })
    await page.evaluate(async modulePath=>{
      const {draftRepository:r}=await import(modulePath),original=r.acknowledge.bind(r)
      window.ackGate={started:false,release:null,restore:()=>{r.acknowledge=original}}
      r.acknowledge=async(...args)=>{window.ackGate.started=true;await new Promise(resolve=>{window.ackGate.release=resolve});return original(...args)}
    },modulePath)
    await edit(page,'전송 snapshot 2','전송할 본문 2');await button(page).click()
    await until(()=>forwarded,'server committed held response')
    await edit(page,'네트워크 대기 중 편집','네트워크 대기 중 본문')
    await stored(page,s=>s.ops.length===2&&s.ops.some(op=>op.status==='pending'&&op.content==='네트워크 대기 중 본문'),'successor before ack')
    const beforeAck=await storage(page),oldSuccessor=beforeAck.ops.find(op=>op.status==='pending').operationId
    held();await until(()=>page.evaluate(()=>window.ackGate.started),'ack fence entered')
    const latest='네트워크 대기 중 본문 + ack 중 추가 입력'
    await edit(page,'ack 중 최신 제목',latest)
    await page.evaluate(()=>{window.ackGate.release();window.ackGate.restore()})
    await page.unroute('**/api/notes/'+id)
    await stored(page,s=>s.draft.content===latest&&s.draft.baseVersion===2&&s.ops.length===1&&s.ops[0].expectedVersion===2,'rebase preserves unsaved React input')
    const successor=(await storage(page)).ops[0]
    assert.notEqual(successor.operationId,oldSuccessor)
    assert.equal(sqlState().contentMd5,md5('전송할 본문 2'))
    const afterAckPuts=network.length;await pause(600);assert.equal(network.length,afterAckPuts,'No automatic successor PUT')
    done({name:'editing-during-network-and-ack',passed:true,baseVersion:2,pendingOperationId:successor.operationId,contentHash:sha(latest)})
    await button(page).click();await acked(page,3,latest)

    // Same-tab duplicate click + another tab's explicit click do not queue another network call.
    let releaseDuplicate,duplicateForwarded=false
    await edit(page,'중복 클릭 실험','중복 클릭 본문')
    await stored(page,s=>s.draft.content==='중복 클릭 본문','duplicate fixture stored')
    const right=await pageFor(contexts[0])
    await page.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const result=await route.fetch();duplicateForwarded=true
      await new Promise(resolve=>{releaseDuplicate=resolve});await route.fulfill({response:result})
    })
    const beforeDuplicate=network.length
    await until(()=>button(page).isEnabled(),'save becomes available before duplicate events')
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='서버에 저장');b.click();b.click()})
    await until(()=>duplicateForwarded,'duplicate first request')
    await button(right).click();await right.getByText(/다른 탭에서 이 원고를 동기화/).waitFor()
    assert.equal(network.length,beforeDuplicate+1)
    releaseDuplicate();await acked(page,4,'중복 클릭 본문');await page.unroute('**/api/notes/'+id);await right.close()
    done({name:'duplicate-click-and-two-tab-lock',passed:true,putCount:1,version:4})

    // Remote actor is explicitly restricted to the SAME freshly created lab note.
    await edit(page,'충돌 시 보존 제목','충돌 시 보존 본문')
    await stored(page,s=>s.draft.content==='충돌 시 보존 본문','conflict fixture stored')
    const remote=await page.request.put(fixture.apiOrigin+'/api/notes/'+id,{headers:{'Idempotency-Key':randomUUID()},data:{title:'격리 원격 제목',content:'격리 원격 본문',expectedVersion:4}})
    assert.equal(remote.status(),200)
    await button(page).click();await page.getByText(/VERSION_CONFLICT: 로컬 원고를 보존/).waitFor()
    const conflict=await storage(page);assert.equal(conflict.draft.content,'충돌 시 보존 본문');assert.equal(conflict.ops[0].status,'conflict');assert.equal(conflict.draft.baseVersion,4)
    assert.equal(sqlState().version,5);assert.equal(sqlState().contentMd5,md5('격리 원격 본문'))
    done({name:'version-conflict-keeps-local',passed:true,serverVersion:5,localBaseVersion:4,operationId:conflict.ops[0].operationId})
    await contexts[0].close()

    page=await isolated()
    await edit(page,'응답 유실 제목','응답 유실 본문')
    await page.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const result=await route.fetch();assert.equal(result.status(),200);await route.abort('failed')
    })
    const beforeLost=network.length;await button(page).click();await page.getByText(/서버 결과를 확정하지 못했습니다/).waitFor()
    const lost=await storage(page),lostId=lost.ops[0].operationId
    assert.equal(lost.ops[0].status,'inFlight');assert.equal(sqlState().version,6);assert.equal(lost.draft.baseVersion,5)
    await page.unroute('**/api/notes/'+id);await page.reload()
    await until(async()=>await title(page).inputValue()==='응답 유실 제목','inFlight restored after reload')
    await button(page).click();await acked(page,6,'응답 유실 본문')
    assert.equal(network[beforeLost].operationId,lostId);assert.equal(network[beforeLost+1].operationId,lostId)
    assert.equal(network[beforeLost].contentHash,network[beforeLost+1].contentHash);assert.equal(network[beforeLost+1].expectedVersion,5)
    assert.equal(sqlState().ledger.filter(op=>op.operationId===lostId).length,1)
    done({name:'lost-response-reload-same-key-replay',passed:true,operationId:lostId,attempts:2,serverVersion:6})

    await edit(page,'500 뒤 재시도 제목','500 뒤 재시도 본문')
    await page.route('**/api/notes/'+id,route=>route.request().method()==='PUT'?route.fulfill({status:500,json:{code:'LAB_FAILURE',message:'Injected isolated failure',errors:[]}}):route.continue())
    const beforeFailure=network.length;await button(page).click();await page.getByText(/서버 결과를 확정하지 못했습니다/).waitFor()
    const failureId=(await storage(page)).ops[0].operationId
    assert.equal(sqlState().version,6)
    await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('visibilitychange'))})
    await pause(600);assert.equal(network.length,beforeFailure+1,'No online automatic retry')
    await page.unroute('**/api/notes/'+id);await button(page).click();await acked(page,7,'500 뒤 재시도 본문')
    assert.equal(network.at(-1).operationId,failureId)
    done({name:'server-failure-explicit-same-key-retry',passed:true,operationId:failureId,serverVersion:7})

    await edit(page,'응답 검증 제목','응답 검증 본문')
    await page.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const result=await route.fetch();await route.fulfill({response:result,headers:{...result.headers(),'idempotency-key':randomUUID()}})
    })
    await button(page).click();await page.getByText(/서버 결과를 확정하지 못했습니다/).waitFor()
    const invalid=await storage(page);assert.equal(invalid.draft.baseVersion,7);assert.equal(invalid.ops[0].status,'inFlight');assert.equal(sqlState().version,8)
    await page.unroute('**/api/notes/'+id);await button(page).click();await acked(page,8,'응답 검증 본문')
    done({name:'wrong-response-operation-id-no-ack',passed:true,serverVersion:8})

    await edit(page,'ack rollback 제목','ack rollback 본문')
    await page.evaluate(async modulePath=>{
      const {draftDatabase:db}=await import(modulePath),fail=()=>{throw Error('Injected ack delete failure')}
      db.outbox.hook('deleting',fail);window.removeAckFailure=()=>db.outbox.hook('deleting').unsubscribe(fail)
    },modulePath)
    await button(page).click();await page.getByText(/서버 성공 응답은 받았지만 로컬 ack/).waitFor()
    const rolledBack=await storage(page),rollbackId=rolledBack.ops[0].operationId
    assert.equal(rolledBack.draft.baseVersion,8);assert.equal(rolledBack.ops[0].status,'inFlight');assert.equal(sqlState().version,9)
    await page.evaluate(()=>window.removeAckFailure());await page.getByRole('button',{name:'로컬 저장 다시 시도',exact:true}).click();await button(page).click();await acked(page,9,'ack rollback 본문')
    assert.equal(network.at(-1).operationId,rollbackId)
    done({name:'ack-transaction-rollback-and-replay',passed:true,operationId:rollbackId,serverVersion:9})

    // A different tab writes a new DB head: the first session must STOP ack, not delete the operation.
    await edit(page,'다른 탭 경쟁 전송','다른 탭 경쟁 전송 본문')
    let releaseStale,staleForwarded=false
    await page.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const result=await route.fetch();staleForwarded=true;await new Promise(resolve=>{releaseStale=resolve});await route.fulfill({response:result})
    })
    await button(page).click();await until(()=>staleForwarded,'stale head request committed')
    const other=await pageFor(contexts.at(-1))
    await edit(other,'다른 탭 최신 원고','다른 탭 최신 본문')
    await stored(other,s=>s.draft.content==='다른 탭 최신 본문'&&s.ops.length===2,'other writer head stored')
    releaseStale();await page.getByText(/로컬 ack를 확정하지 못했습니다/).waitFor();await page.unroute('**/api/notes/'+id)
    const protectedState=await storage(other);assert.equal(protectedState.ops.length,2);assert.ok(protectedState.ops.some(op=>op.status==='inFlight'));assert.equal(protectedState.draft.content,'다른 탭 최신 본문')
    assert.equal(sqlState().version,10)
    await button(other).click()
    await stored(other,s=>s.draft.baseVersion===10&&s.ops.length===1&&s.ops[0].expectedVersion===10,'other owner safely replayed and rebased')
    await button(other).click();await acked(other,11,'다른 탭 최신 본문')
    done({name:'stale-head-ack-stops-then-owner-replays',passed:true,serverVersion:11})
    // A deliberate revert is clean relative to the old baseline, but still needs protection.
    const keepTitle=await title(other).inputValue(),keepBody=await body(other).inputValue()
    let releaseRevert,revertCommitted=false
    await other.route('**/api/notes/'+id,async route=>{
      if(route.request().method()!=='PUT')return route.continue()
      const response=await route.fetch();assert.equal(response.status(),200);revertCommitted=true
      await new Promise(resolve=>{releaseRevert=resolve});await route.abort('failed')
    })
    await edit(other,'원복 이전의 전송 snapshot','원복 이전의 전송 본문')
    await button(other).click();await until(()=>revertCommitted,'clean revert server committed')
    await edit(other,keepTitle,keepBody)
    await stored(other,s=>s.draft.content===keepBody&&s.draft.baseVersion===11&&s.ops.length===2,'clean revert stored')
    await other.evaluate(async id=>{
      const {queryClient}=await import('/src/lib/query/queryClient.ts'),{noteKeys}=await import('/src/lib/query/queryKeys.ts')
      await queryClient.refetchQueries({queryKey:noteKeys.detail(id)})
    },id)
    await pause(100)
    const probe={expectedHash:sha(keepBody),actualHash:sha(await body(other).inputValue()),localBaseVersion:(await storage(other)).draft.baseVersion,serverVersion:sqlState().version}
    fs.writeFileSync(path.join(fixture.workDirectory,'clean-revert-probe.json'),JSON.stringify(probe,null,2))
    releaseRevert();await other.getByText(/서버 결과를 확정하지 못했습니다/).waitFor();await other.unroute('**/api/notes/'+id)
    assert.equal(probe.actualHash,probe.expectedHash,'Refetch must preserve a clean revert while an operation is uncertain')
    await other.reload();await until(async()=>await body(other).inputValue()===keepBody,'clean revert survives reload + server GET')
    await button(other).click()
    await stored(other,s=>s.draft.content===keepBody&&s.draft.baseVersion===12&&s.ops.length===1&&s.ops[0].expectedVersion===12,'replay rebases compensating intent')
    await button(other).click();await acked(other,13,keepBody)
    done({name:'clean-revert-refetch-lost-response-reload',passed:true,serverVersion:13,contentHash:sha(keepBody)})
    const final=sqlState();assert.equal(final.version,13);assert.equal(final.contentMd5,md5('다른 탭 최신 본문'))
    assert.deepEqual(pageErrors,[])
    fs.writeFileSync(path.join(fixture.workDirectory,'browser-results.json'),JSON.stringify({noteId:id,chrome:browser.version(),steps,scenarios,network,finalVersion:13,finalOutboxCount:(await storage(other)).ops.length},null,2))
    console.log('PASS: 10 real storage stages + '+scenarios.length+' manual sync scenarios; final version13, acked Outbox empty. No manuscript content logged.')
  }finally{
    if(fresh)await fresh.close();for(const context of contexts)await context.close().catch(()=>{});await browser.close()
    if(profile)fs.rmSync(profile,{recursive:true,force:true})
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
