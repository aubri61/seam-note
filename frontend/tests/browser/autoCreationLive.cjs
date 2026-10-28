// Actual production PWA + native IndexedDB + isolated Spring/PostgreSQL, synthetic UUIDs only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8')),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25177'
assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439);assert.notEqual(new URL(fixture.apiOrigin).port,'18765');assert.notEqual(new URL(origin).port,'5173')
const work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-auto-creation-')),results=[],events=[],contexts=new Set(),pause=ms=>new Promise(r=>setTimeout(r,ms)),sha=s=>createHash('sha256').update(s).digest('hex')
let controls={}
async function until(fn,label){for(let i=0;i<1000;i++){if(await fn())return;await pause(25)}throw Error(label)}
async function api(route){const r=await fetch(fixture.apiOrigin+'/api'+route);assert.equal(r.status,200);return r.json()}
function ledger(key){assert.match(key,/^[a-f0-9-]{36}$/);return Number(execFileSync('psql',['-h','127.0.0.1','-p',String(fixture.dbPort),'-U','postgres','-d',fixture.dbName,'-Atc',`select count(*) from creation_operations where operation_id='${key}'::uuid`],{encoding:'utf8'}).trim())}
async function records(p){return p.evaluate(async()=>{const db=await new Promise((ok,no)=>{const q=indexedDB.open('seam-note-local');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});try{return await new Promise((ok,no)=>{const tx=db.transaction([...db.objectStoreNames],'readonly'),out={};for(const n of db.objectStoreNames){const q=tx.objectStore(n).getAll();q.onsuccess=()=>out[n]=q.result}tx.oncomplete=()=>ok(out);tx.onerror=()=>no(tx.error)})}finally{db.close()}})}
async function launch(profile,offline=false){const ctx=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,offline,viewport:{width:1440,height:1000}});contexts.add(ctx);return ctx}
async function visit(ctx,id=fixture.noteId){const p=await ctx.newPage();await p.goto(origin+'/notes/'+id);await until(async()=>await p.getByLabel('문서 제목',{exact:true}).getAttribute('readonly')===null,'editor ready');return p}
async function folder(p,name,top=true){if(top)await p.locator(`[data-node-key="folder:${fixture.folderId}"]`).click();await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByRole('button',{name:'새 폴더',exact:true}).click();const input=p.getByLabel('새 폴더 이름',{exact:true});await input.fill(name);await input.press('Enter');await until(async()=>(await records(p)).localEntities.some(e=>e.folder?.name===name),'local folder');return (await records(p)).localEntities.find(e=>e.folder?.name===name).id}
async function note(p){const before=p.url();await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByLabel('추가할 항목',{exact:true}).getByRole('button',{name:'새 문서',exact:true}).click();await until(()=>p.url()!==before,'local note route');const id=new URL(p.url()).pathname.split('/').at(-1);await until(async()=>await p.locator('[aria-label="노트 편집기"]').getAttribute('data-note-id')===id&&await p.getByLabel('문서 제목',{exact:true}).getAttribute('readonly')===null,'new draft');return id}
async function confirmed(p,ids){await until(async()=>{const r=await records(p);return ids.every(id=>r.localEntities.find(e=>e.id===id)?.confirmed)&&!r.creationOutbox.some(o=>ids.includes(o.entityId))},'automatic creation ACK')}
async function close(ctx){await ctx.close();contexts.delete(ctx)}
async function main(){try{
 // Patch only the isolated preview's API transport to inject failures; GET always uses lab API.
 // For offline cold starts, SW shell is genuine and API calls remain network requests.
 const install=async ctx=>ctx.route('**/api/**',async r=>{
  const req=r.request(),url=new URL(req.url()),input=req.postDataJSON(),key=req.headers()['idempotency-key']
  if(req.method()!=='GET')assert.equal(req.method(),'POST','ordinary NOTE_UPDATE must never auto-send')
  let event
  if(req.method()==='POST'){event={entityId:input.id,key,path:url.pathname,payloadHash:sha(req.postData()),name:input.name};events.push(event)}
  if(event&&controls.blockName&&controls.blockName===input.name){event.status=503;return r.fulfill({status:503,json:{code:'LAB_UNAVAILABLE',message:'synthetic blocked parent',errors:[]}})}
  const response=await fetch(fixture.apiOrigin+url.pathname+url.search,{method:req.method(),headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:req.postData()||undefined}),body=await response.text()
  if(event){event.status=response.status;if(controls.dropNext){controls.dropNext=false;event.responseLost=true;return r.abort('failed')}}
  await r.fulfill({status:response.status,body,headers:{'Content-Type':'application/json',...(response.headers.get('idempotency-key')?{'Idempotency-Key':response.headers.get('idempotency-key')}:{})}})
 })
 let ctx=await launch(path.join(work,'online'));await install(ctx);let p=await visit(ctx)
 const f=await folder(p,'auto online root');await confirmed(p,[f]);assert.equal((await api('/folders/'+f)).name,'auto online root')
 const n=await note(p);await confirmed(p,[n]);assert.equal((await api('/notes/'+n)).id,n)
 await p.getByLabel('문서 제목',{exact:true}).fill('manual edit stays local');await p.getByLabel('문서 내용',{exact:true}).fill('manual synthetic body')
 await until(async()=>(await records(p)).outbox.some(o=>o.noteId===n),'manual update remains queued');await pause(500);assert.equal((await api('/notes/'+n)).title,'')
 assert.equal(await p.getByText('서버 미반영 폴더',{exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'폴더 서버에 저장',exact:true}).count(),0)
 results.push({name:'online-folder-note-immediate-POST-ACK-no-auto-PUT',passed:true});await close(ctx);console.log('PASS: '+results.at(-1).name)
 // Offline hierarchy, close/restart under the same PWA origin, reconnect from two tabs.
 const profile=path.join(work,'offline');ctx=await launch(profile);await install(ctx);p=await visit(ctx)
 await p.evaluate(()=>navigator.serviceWorker.ready);await until(()=>p.getByText(/오프라인 앱 파일 준비됨/).count(),'PWA precached');await p.reload();await until(async()=>await p.getByLabel('문서 제목',{exact:true}).getAttribute('readonly')===null,'controlled app')
 await ctx.setOffline(true);const start=events.length,a=await folder(p,'offline A'),b=await folder(p,'offline B',false),c=await note(p)
 await p.getByLabel('문서 제목',{exact:true}).fill('offline title');await p.getByLabel('문서 내용',{exact:true}).fill('offline manuscript')
 await until(async()=>(await records(p)).drafts.find(d=>d.noteId===c)?.content==='offline manuscript','offline committed');assert.equal(events.length,start)
 await close(ctx);ctx=await launch(profile,true);p=await visit(ctx,c);assert.equal(await p.getByLabel('문서 내용',{exact:true}).inputValue(),'offline manuscript');assert.equal((await records(p)).creationOutbox.length,3)
 await install(ctx);const second=await visit(ctx,c);await ctx.setOffline(false);await confirmed(p,[a,b,c])
 const sent=events.slice(start);assert.deepEqual([...new Set(sent.map(e=>e.entityId))],[a,b,c]);for(const e of sent)assert.equal(ledger(e.key),1)
 assert.equal((await api('/notes/'+c)).content,'offline manuscript');assert.equal((await records(second)).creationOutbox.length,0)
 results.push({name:'offline-hierarchy-PWA-restart-two-tabs-reconnect-parent-order',passed:true,postAttempts:sent.length});await close(ctx);console.log('PASS: '+results.at(-1).name)
 ctx=await launch(path.join(work,'lost'));await install(ctx);p=await visit(ctx);controls.dropNext=true
 const lostStart=events.length,lost=await folder(p,'lost response root');await confirmed(p,[lost]);const replay=events.slice(lostStart).filter(e=>e.entityId===lost);assert.equal(replay.length,2);assert.equal(replay[0].key,replay[1].key);assert.equal(replay[0].payloadHash,replay[1].payloadHash);assert.equal(ledger(replay[0].key),1)
 results.push({name:'lost-POST-response-bounded-retry-same-key-ledger-one',passed:true});await close(ctx);console.log('PASS: '+results.at(-1).name)
 ctx=await launch(path.join(work,'parent-failure'));await install(ctx);p=await visit(ctx);await ctx.setOffline(true)
 const parent=await folder(p,'blocked parent'),child=await folder(p,'blocked child',false),independent=await folder(p,'independent root');controls.blockName='blocked parent';const failureStart=events.length
 await ctx.setOffline(false);await confirmed(p,[independent]);await until(()=>events.slice(failureStart).some(e=>e.entityId===parent&&e.status===503),'parent failed');assert.equal(events.slice(failureStart).some(e=>e.entityId===child),false)
 assert.ok((await records(p)).creationOutbox.some(o=>o.entityId===child));await ctx.setOffline(true);controls.blockName='';await ctx.setOffline(false);await confirmed(p,[parent,child])
 results.push({name:'failed-parent-preserves-child-independent-root-and-reconnect',passed:true});await close(ctx);console.log('PASS: '+results.at(-1).name)
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-28-auto-creation-live.json'),JSON.stringify({results,events,environment:{origin,api:fixture.apiOrigin,db:fixture.dbName,chrome:'actual Chrome channel',profiles:work},note:'POST-only automatic creation. Existing NOTE_UPDATE explicitly remained queued. Synthetic data only.'},null,2)+'\n')
 console.log('PASS: '+results.length+' automatic creation groups')
 }catch(error){for(const ctx of contexts)for(const p of ctx.pages())try{const r=await records(p);console.error('DIAGNOSTIC',JSON.stringify({url:p.url(),alerts:await p.getByRole('alert').allTextContents(),online:await p.evaluate(()=>navigator.onLine),operations:r.creationOutbox?.map(o=>({id:o.entityId,key:o.operationId,status:o.status,type:o.type})),entities:r.localEntities?.map(e=>({id:e.id,confirmed:e.confirmed})),events}));}catch{}throw error}finally{for(const ctx of contexts)await ctx.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
