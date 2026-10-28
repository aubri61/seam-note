// Actual SIGKILL + persistent Chrome profile, real IndexedDB and isolated Spring/PostgreSQL.
// Never uses the developer DB. A missing successor is explicitly fault-injected, not a product claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'))
assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439);assert.notEqual(new URL(fixture.apiOrigin).port,'18765');assert.notEqual(new URL(fixture.origin).port,'5173')
const root=path.resolve(__dirname,'../../..'),work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-inflight-crash-')),results=[],children=new Set(),connections=new Set()
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',pause=ms=>new Promise(r=>setTimeout(r,ms)),hash=s=>createHash('sha256').update(s).digest('hex')
async function until(fn,label){for(let i=0;i<600;i++){if(await fn())return;await pause(25)}throw Error(label)}
async function api(method,route,input,key){const r=await fetch(fixture.apiOrigin+'/api'+route,{method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:input?JSON.stringify(input):undefined});assert.ok(r.ok,method+' '+route+' '+r.status);return r.json()}
function sql(text){return execFileSync('psql',['-h','127.0.0.1','-p',String(fixture.dbPort),'-U','postgres','-d',fixture.dbName,'-Atc',text],{encoding:'utf8'}).trim()}
function ledger(id){assert.match(id,/^[a-f0-9-]{36}$/);return Number(sql(`select count(*) from note_update_operations where operation_id='${id}'::uuid`))}
async function launch(profile,id,note){
 fs.mkdirSync(profile,{recursive:true});const portFile=path.join(profile,'DevToolsActivePort');try{fs.unlinkSync(portFile)}catch{}
 const log=fs.openSync(path.join(profile,'chrome.log'),'a'),child=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--password-store=basic','--use-mock-keychain','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});fs.closeSync(log);children.add(child)
 child.on('exit',()=>children.delete(child));await until(()=>fs.existsSync(portFile),'Chrome CDP port')
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);connections.add(browser)
 const ctx=browser.contexts()[0];await ctx.setOffline(true);await ctx.setOffline(false)
 await ctx.route('**/__inflight_crash__',r=>r.fulfill({contentType:'text/html',body:'<html><body>Isolated crash verification</body></html>'}))
 const page=await ctx.newPage();await page.goto(fixture.origin+'/__inflight_crash__')
 await page.evaluate(async({id,note})=>{
  const {draftRepository:repo}=await import('/src/features/local-drafts/draftDatabase.ts'),{DraftSession}=await import('/src/features/local-drafts/draftSession.ts')
  // Explicit flushes control input boundaries; no product method or CAS condition is patched.
  const clock={now:()=>Date.now(),setTimeout:()=>setTimeout(()=>{},3600000),clearTimeout:id=>clearTimeout(id)}
  const session=new DraftSession(repo,crypto.randomUUID(),clock);window.lab={id,repo,session};session.connect();if(note)session.receive(note);await session.readyForSync(id)
 },{id,note})
 return {child,browser,ctx,page,profile}
}
async function crash(run){
 const exited=new Promise(ok=>run.child.once('exit',(code,signal)=>ok({code,signal})))
 run.child.kill('SIGKILL');const ended=await exited;assert.equal(ended.signal,'SIGKILL');connections.delete(run.browser);await pause(150);return ended.signal
}
async function state(page){return page.evaluate(async()=>{const {id,repo,session}=window.lab,record=await repo.read(id),ops=await repo.listOperations(id);return {record,ops,phase:session.getSnapshot()[id]?.phase}})}
const safe=s=>({phase:s.phase,baseVersion:s.record?.baseVersion,revision:s.record?.localRevision,token:s.record?.storageToken,titleHash:hash(s.record?.title??''),contentHash:hash(s.record?.content??''),dirty:!!s.record&&(s.record.title!==s.record.baseTitle||s.record.content!==s.record.baseContent),ops:s.ops.map(o=>({id:o.operationId,status:o.status,expectedVersion:o.expectedVersion,titleHash:hash(o.title),contentHash:hash(o.content)}))})
async function edit(page,title,content){await page.evaluate(async({title,content})=>{window.lab.session.edit(window.lab.id,{title,content});await window.lab.session.flushLatest(window.lab.id)},{title,content})}
async function directSync(page){return page.evaluate(async()=>{try{const {syncOneNote}=await import('/src/features/manual-sync/manualSync.ts');const value=await syncOneNote(window.lab.id,window.lab.session);return {kind:value.kind,version:value.note?.version}}catch(e){return {error:String(e)}}})}
async function workspaceSync(page){return page.evaluate(async()=>{const {syncWorkspace}=await import('/src/features/manual-sync/SyncCoordinator.ts');return syncWorkspace(window.lab.session)})}
async function forward(r){const request=r.request(),response=await fetch(fixture.apiOrigin+'/api/notes/'+windowlessId(request.url()),{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':request.headers()['idempotency-key']},body:request.postData()});return {status:response.status,headers:{'Content-Type':'application/json','Idempotency-Key':response.headers.get('Idempotency-Key')??''},body:await response.text()}}
function windowlessId(url){return new URL(url).pathname.split('/').at(-1)}
async function main(){try{
 for(const config of [{mode:'before-server',missing:false},{mode:'after-server-response-held',missing:false},{mode:'before-server',missing:true},{mode:'after-server-response-held',missing:true,abortAck:true}]){
  const id=randomUUID(),profile=path.join(work,'profile-'+results.length),base='synthetic baseline '+'.'.repeat(20000),aBody=base+' A',abBody=base+' A+B'
  await api('POST','/notes',{id,folderId:fixture.folderId,title:'baseline',content:base})
  await api('PUT','/notes/'+id,{title:'baseline1',content:base,expectedVersion:0},randomUUID())
  const server2=await api('PUT','/notes/'+id,{title:'baseline2',content:base,expectedVersion:1},randomUUID());assert.equal(server2.version,2)
  let run=await launch(profile,id,server2);await run.page.evaluate(async n=>{window.lab.session.receive(n);await window.lab.session.flushLatest(n.id)},server2)
  await edit(run.page,'A-title',aBody)
  const planned=await state(run.page),opA=planned.ops[0];assert.equal(opA.expectedVersion,2)
  let held=false,release,crashed=false;const gate=new Promise(ok=>release=ok),requests=[]
  await run.page.route('**/api/notes/'+id,async r=>{
   requests.push({key:r.request().headers()['idempotency-key'],payload:r.request().postDataJSON()})
   let response;if(config.mode==='after-server-response-held')response=await forward(r)
   held=true;await gate;if(crashed)return
   if(!response)response=await forward(r);await r.fulfill(response)
  })
  await run.page.evaluate(()=>{window.lab.sending=import('/src/features/manual-sync/manualSync.ts').then(({syncOneNote})=>syncOneNote(window.lab.id,window.lab.session)).then(()=>({done:true})).catch(e=>({error:String(e)}))})
  await until(()=>held,'A actual HTTP held');assert.equal(requests[0].key,opA.operationId)
  await edit(run.page,'AB-title',abBody)
  const committed=await state(run.page);assert.equal(committed.record.content,abBody);assert.equal(committed.ops.length,2,'normal write atomically records successor already')
  assert.equal(committed.ops.find(o=>o.operationId===opA.operationId).status,'inFlight')
  if(config.missing)await run.page.evaluate(async key=>{const {draftDatabase}=await import('/src/features/local-drafts/draftDatabase.ts');await draftDatabase.transaction('rw',draftDatabase.outbox,async()=>{const all=await draftDatabase.outbox.toArray();for(const op of all)if(op.operationId!==key)await draftDatabase.outbox.delete(op.operationId)})},opA.operationId)
  const beforeCrash=await state(run.page);assert.equal(beforeCrash.ops.length,config.missing?1:2)
  crashed=true;const killed=await crash(run);release()
  const serverAfterCrash=await api('GET','/notes/'+id);assert.equal(serverAfterCrash.version,config.mode==='before-server'?2:3)
  run=await launch(profile,id);const recovered=await state(run.page);assert.equal(recovered.record.content,abBody);assert.equal(recovered.record.title,'AB-title');assert.equal(recovered.ops.find(o=>o.operationId===opA.operationId).content,aBody)
  await run.page.route('**/api/notes/'+id,async r=>{requests.push({key:r.request().headers()['idempotency-key'],payload:r.request().postDataJSON()});await r.fulfill(await forward(r))})
  let rollback
  if(config.abortAck){
   // Abort at successor add, after A delete was requested inside the real ACK transaction.
   await run.page.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='outbox')throw new DOMException('Synthetic successor add failure','QuotaExceededError');return original.apply(this,args)}})
   const attempt=await directSync(run.page);assert.ok(attempt.error)
   const rolled=await state(run.page);assert.equal(rolled.record.baseVersion,2);assert.equal(rolled.record.content,abBody);assert.equal(rolled.ops.length,1);assert.equal(rolled.ops[0].operationId,opA.operationId);rollback=safe(rolled)
   await crash(run);run=await launch(profile,id)
   await run.page.route('**/api/notes/'+id,async r=>{requests.push({key:r.request().headers()['idempotency-key'],payload:r.request().postDataJSON()});await r.fulfill(await forward(r))})
  }
  const retry=config.missing?await workspaceSync(run.page):await directSync(run.page)
  if(config.missing){assert.equal(retry.acknowledged.length,1);assert.equal(retry.localFailures.length,0)}else assert.equal(retry.kind,'synced')
  const acked=await state(run.page);assert.equal(acked.record.baseVersion,3);assert.equal(acked.record.content,abBody);assert.equal(acked.ops.length,1);const opB=acked.ops[0];assert.notEqual(opB.operationId,opA.operationId);assert.equal(opB.expectedVersion,3);assert.equal(opB.content,abBody);assert.equal(opB.status,'pending')
  assert.equal((await api('GET','/notes/'+id)).version,3);assert.equal(ledger(opA.operationId),1)
  for(const r of requests){assert.equal(r.key,opA.operationId);assert.deepEqual(r.payload,{title:opA.title,content:opA.content,expectedVersion:2})}
  const afterARequestCount=requests.length,next=await workspaceSync(run.page);assert.equal(next.acknowledged.length,1);assert.equal(next.localFailures.length,0)
  const final=await state(run.page),server4=await api('GET','/notes/'+id);assert.equal(final.ops.length,0);assert.equal(final.record.baseVersion,4);assert.equal(final.record.title,'AB-title');assert.equal(server4.version,4);assert.equal(server4.title,'AB-title');assert.equal(server4.content,abBody);assert.equal(ledger(opB.operationId),1);assert.equal(sql(`select version from notes where id='${id}'::uuid`),'4');assert.equal(sql(`select md5(content) from notes where id='${id}'::uuid`),createHash('md5').update(abBody).digest('hex'))
  results.push({config,noteId:id,passed:true,killSignal:killed,committedNormal:safe(committed),beforeCrash:safe(beforeCrash),recovered:safe(recovered),rollback,afterAck:safe(acked),final:safe(final),serverVersionAfterCrash:serverAfterCrash.version,serverVersionAfterA:3,finalServerVersion:4,requestsForA:afterARequestCount,ledgerA:1,ledgerB:1,noDirtyEmptyOutbox:!safe(final).dirty&&final.ops.length===0})
  console.log('PASS: '+JSON.stringify({config,version:server4.version,requestsForA:afterARequestCount}))
  // Final cleanup is graceful; all failure/recovery boundaries above used SIGKILL.
  await run.browser.close();connections.delete(run.browser)
 }
 const source=['frontend/src/features/local-drafts/draftDatabase.ts','frontend/src/features/local-drafts/draftSession.ts','frontend/src/features/outbox/outboxModel.ts','frontend/src/features/manual-sync/SyncCoordinator.ts']
 fs.writeFileSync(path.join(root,'docs/verification/2026-10-28-inflight-crash-recovery.json'),JSON.stringify({results,environment:{origin:fixture.origin,apiOrigin:fixture.apiOrigin,dbName:fixture.dbName,dbPort:fixture.dbPort,profiles:work},method:'Each normal additional-input write already creates B atomically. missing=true explicitly deletes only the synthetic pending successor to test ACK repair; not a naturally observed product bug. Chrome root process SIGKILL; no close/pagehide flush at crash boundary. Not a power-loss durability guarantee.',sourceHashes:Object.fromEntries(source.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))},null,2)+'\n')
 }finally{for(const browser of connections)try{await browser.close()}catch{};for(const child of children)try{child.kill('SIGKILL')}catch{}}}
main().catch(e=>{console.error(e);process.exitCode=1})
