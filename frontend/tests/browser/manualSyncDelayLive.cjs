// Uses the actual development delay switches and real HTTP; no response routing or mocked timers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {spawn,execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'))
assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439);assert.notEqual(new URL(fixture.origin).port,'5173');assert.notEqual(new URL(fixture.apiOrigin).port,'18765')
const id=fixture.noteId,origin=fixture.origin,work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-delay-ui-')),results=[],children=new Set()
const pause=ms=>new Promise(r=>setTimeout(r,ms)),hash=s=>createHash('sha256').update(s).digest('hex')
async function until(fn,label){for(let i=0;i<900;i++){if(await fn())return;await pause(30)}throw Error(label)}
async function api(method='GET',payload){const r=await fetch(fixture.apiOrigin+'/api/notes/'+id,{method,headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:payload?JSON.stringify(payload):undefined});assert.ok(r.ok,'isolated API '+r.status);return r.json()}
function ledger(key){return Number(execFileSync('psql',['-h','127.0.0.1','-p',String(fixture.dbPort),'-U','postgres','-d',fixture.dbName,'-Atc',`select count(*) from note_update_operations where operation_id='${key}'::uuid`],{encoding:'utf8'}).trim())}
async function launch(profile){
 fs.mkdirSync(profile,{recursive:true});const portFile=path.join(profile,'DevToolsActivePort');try{fs.unlinkSync(portFile)}catch{}
 const log=fs.openSync(path.join(profile,'chrome.log'),'a'),child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});fs.closeSync(log);children.add(child)
 await until(()=>{try{const v=fs.readFileSync(portFile,'utf8').split('\n');return Number(v[0])>0&&!!v[1]}catch{return false}},'CDP port ready')
 const browser=await chromium.connectOverCDP('http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split('\n')[0]),ctx=browser.contexts()[0];await ctx.setOffline(true);await ctx.setOffline(false)
 const p=await ctx.newPage(),requests=[];p.on('request',r=>{if(r.method()==='PUT'){const payload=r.postDataJSON();requests.push({key:r.headers()['idempotency-key'],expectedVersion:payload.expectedVersion,titleHash:hash(payload.title),contentHash:hash(payload.content)})}})
 await p.goto(origin+'/notes/'+id);await p.getByRole('complementary',{name:'격리 동기화 지연 실험'}).waitFor()
 await until(async()=>(await state(p)).record!=null,'draft ready');return {p,browser,child,requests}
}
function state(p){return p.evaluate(async id=>{const {draftRepository:repo}=await import('/src/features/local-drafts/draftDatabase.ts');return {record:await repo.read(id),ops:await repo.listOperations(id)}},id)}
async function close(run,force){
 const ended=new Promise(ok=>run.child.once('exit',ok))
 if(force==='graceful'){const cdp=await run.browser.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{})}
 else run.child.kill(force?'SIGKILL':'SIGTERM')
 await ended;children.delete(run.child);await pause(150)
}
async function clickSync(p){const button=p.getByRole('button',{name:'모든 변경사항 동기화',exact:true});await until(()=>button.isEnabled(),'sync enabled');await button.click()}
async function main(){try{
 let baseline=await api();while(baseline.version<2)baseline=await api('PUT',{title:baseline.title,content:baseline.content+' seed',expectedVersion:baseline.version})
 const report=path.join(__dirname,'../../../docs/verification/2026-10-28-manual-delay-live.json')
 if(process.env.SEAM_NOTE_DELAY_GRACEFUL_ONLY && fs.existsSync(report))results.push(...JSON.parse(fs.readFileSync(report,'utf8')).results)
 for(const mode of ['A','B'])for(const termination of (process.env.SEAM_NOTE_DELAY_GRACEFUL_ONLY?['graceful']:['complete','graceful','force'])){
  const force=termination!=='complete'
  const before=await api(),profile=path.join(work,mode+'-'+termination);let run=await launch(profile),p=run.p
  const title='Synthetic '+mode+' '+force+' '+randomUUID().slice(0,8),a='Synthetic snapshot A '+randomUUID(),ab=a+' plus B'
  await p.getByLabel('문서 제목',{exact:true}).fill(title);await p.getByLabel('문서 내용',{exact:true}).fill(a)
  await until(async()=>{const s=await state(p);return s.record?.content===a&&s.ops.length===1},'A commit')
  const initial=await state(p),op=initial.ops[0]
  await p.getByRole('button',{name:mode==='A'?'A: 응답 전달 전 10초':'B: ACK 직전 10초',exact:true}).click();await clickSync(p)
  const waiting=p.locator(mode==='A'?'[data-lab-proxy]':'[data-lab-ack]')
  await until(async()=>/대기 중/.test(await waiting.innerText()),'real delay visible');const started=Date.now(),serverA=await api()
  assert.equal(serverA.version,before.version+1);assert.equal(serverA.content,a);assert.equal(ledger(op.operationId),1)
  assert.equal((await state(p)).ops.find(o=>o.operationId===op.operationId).status,'inFlight')
  await p.getByLabel('문서 내용',{exact:true}).fill(ab)
  await until(async()=>(await state(p)).record?.content===ab,'B commits during delay')
  const during=await state(p);assert.equal(during.record.baseVersion,before.version)
  let restored=null,retriedSameSnapshot=false
  if(force){
   const sent=run.requests[0];await close(run,termination==='graceful'?'graceful':true);run=await launch(profile);p=run.p
   await until(async()=>await p.getByLabel('문서 내용',{exact:true}).inputValue()===ab,'B restored after SIGKILL')
   restored=await state(p);assert.equal(restored.record.content,ab);assert.ok(restored.ops.some(o=>o.operationId===op.operationId&&o.status==='inFlight'))
   await clickSync(p);await until(async()=>!(await state(p)).ops.some(o=>o.operationId===op.operationId),'replayed A ACK')
   const retry=run.requests.find(r=>r.key===op.operationId);assert.deepEqual(retry,sent);retriedSameSnapshot=true
  }else{
   await until(async()=>!(await state(p)).ops.some(o=>o.operationId===op.operationId),'normal A ACK')
   assert.ok(Date.now()-started>=8500,'real 10s delay must elapse')
  }
  let postAck=await state(p),server=await api()
  // A recovered click may include a pre-existing B and safely send its rebased successor in the same bounded pass.
  if(server.version===before.version+1){assert.ok(postAck.ops.some(o=>o.content===ab&&o.expectedVersion===before.version+1));await clickSync(p)}
  await until(async()=>{const s=await state(p);return s.ops.length===0&&s.record.baseVersion===before.version+2},'B ACK')
  server=await api();assert.equal(server.version,before.version+2);assert.equal(server.title,title);assert.equal(server.content,ab);assert.equal(ledger(op.operationId),1)
  const final=await state(p);assert.equal(final.record.content,ab);assert.equal(final.record.baseContent,ab)
  results.push({mode,termination:force?(termination==='graceful'?'Browser.close and same profile relaunch':'SIGKILL and same profile relaunch'):'normal delay completion',initialVersion:before.version,serverWhileWaiting:serverA.version,finalVersion:server.version,originalOperationId:op.operationId,sameKeyPayloadRetry:retriedSameSnapshot,localInputCommittedDuringDelay:true,restoredInFlight:!!restored,successorBeforeAck:during.ops.some(o=>o.operationId!==op.operationId),successorSnapshotAfterAck:postAck.ops.map(o=>({id:o.operationId,expectedVersion:o.expectedVersion,contentHash:hash(o.content)})),finalHash:hash(ab),remaining:final.ops.length,ledgerOriginalCount:ledger(op.operationId)})
  console.log('PASS',mode,termination,before.version,'->',server.version);await close(run,false)
 }
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-28-manual-delay-live.json'),JSON.stringify({environment:{...fixture,profiles:work},method:'Actual rendered UI and dev-only proxy/ACK gates; 10s real timers, PostgreSQL ledger checked, CDP Browser.close or SIGKILL Chrome root; no route mocking or artificial deletion of successors.',results},null,2)+'\n')
 }finally{for(const child of children)child.kill('SIGKILL')}}
main().catch(e=>{console.error(e);process.exitCode=1})
