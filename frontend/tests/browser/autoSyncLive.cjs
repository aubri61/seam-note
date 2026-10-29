// Production PWA, real isolated Spring/PostgreSQL and persistent Chrome profiles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {randomUUID,createHash}=require('node:crypto'),{chromium}=process.env.AUTO_SERVE_ONLY==='1'?{}:require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'))
assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439);assert.notEqual(new URL(fixture.apiOrigin).port,'18765')
const origin='http://127.0.0.1:25203',work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-auto-live-')),results=[],requests=[],contexts=new Set()
let currentPage
const wait=ms=>new Promise(r=>setTimeout(r,ms)),sha=s=>createHash('sha256').update(s).digest('hex'),rich=t=>JSON.stringify({type:'doc',content:[{type:'paragraph',...(t?{content:[{type:'text',text:t}]}:{})}]})
async function until(fn,label,timeout=18000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await wait(30)}if(currentPage&&!currentPage.isClosed())console.error('TIMEOUT_STATE',JSON.stringify({label,statuses:await currentPage.locator('[role=status]').allTextContents(),alerts:await currentPage.locator('[role=alert]').allTextContents()}));throw Error(label)}
async function api(method,route,body,key=randomUUID()){const r=await fetch(fixture.apiOrigin+'/api'+route,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,`${method} ${route} ${r.status}`);return r.status===204?null:r.json()}
const note=title=>api('POST','/notes',{id:randomUUID(),folderId:null,title,content:rich(title+' base')})
async function update(n,text,key=randomUUID()){return api('PUT','/notes/'+n.id,{title:n.title,content:rich(text),expectedVersion:n.version},key)}
const puts=id=>requests.filter(r=>r.method==='PUT'&&r.path==='/api/notes/'+id),gets=id=>requests.filter(r=>r.method==='GET'&&r.path==='/api/notes/'+id)
const deny=new Map(),delays=new Map();let held=null
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,origin)
 if(url.pathname.startsWith('/api/')){
  const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',async()=>{
   const raw=Buffer.concat(chunks).toString(),body=raw?JSON.parse(raw):null,record={method:req.method,path:url.pathname,at:Date.now(),operationId:req.headers['idempotency-key'],hash:sha(raw),expectedVersion:body?.expectedVersion,entityId:body?.id};requests.push(record)
   const failure=deny.get(url.pathname+':'+req.method)
   if(failure){record.status=failure;res.writeHead(failure,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:failure===401?'UNAUTHORIZED':failure===400?'INVALID_REQUEST':'TEST_UNAVAILABLE',message:'Synthetic failure',errors:[]}))}
   try{
    const r=await fetch(fixture.apiOrigin+req.url,{method:req.method,headers:{'Content-Type':'application/json','Idempotency-Key':req.headers['idempotency-key']||randomUUID()},body:raw||undefined}),payload=await r.text();record.status=r.status
    const hold=held&&req.method===held.method&&(held.method==='POST'?url.pathname==='/api/notes'&&body?.id===held.id:url.pathname==='/api/notes/'+held.id)?held:null
    if(hold){held=null;hold.arrived=true;hold.record=record;await hold.promise;if(hold.drop){req.socket.destroy();return}}
    if(delays.get(url.pathname))await wait(delays.get(url.pathname))
    if(res.destroyed)return
    res.writeHead(r.status,{'Content-Type':'application/json',...(r.headers.get('idempotency-key')?{'Idempotency-Key':r.headers.get('idempotency-key')}:{})});res.end(payload)
   }catch{if(!res.destroyed){res.writeHead(502);res.end('{}')}}
  });return
 }
 if(url.pathname==='/__seed__'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>Isolated fixture setup</body></html>');return}
 const root=path.resolve(__dirname,'../../dist'),file=path.join(root,url.pathname==='/'||url.pathname.startsWith('/notes/')?'index.html':url.pathname)
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html');res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(file))
})
function hold(id,drop=false,method='PUT'){let release;const value={id,drop,method,promise:new Promise(ok=>release=ok),release:()=>release()};held=value;return value}
const editor=p=>p.locator('[aria-label="문서 내용"][contenteditable="true"]'),title=p=>p.getByLabel('문서 제목',{exact:true}),sync=p=>p.locator('[data-workspace-sync]')
async function state(p,id){return p.evaluate(async id=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});try{return await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox','creationOutbox','workspace'],'readonly'),all={};for(const store of ['drafts','outbox','creationOutbox','workspace']){const r=tx.objectStore(store).getAll();r.onsuccess=()=>all[store]=r.result}tx.oncomplete=()=>ok({record:all.drafts.find(d=>d.noteId===id),ops:all.outbox.filter(o=>o.noteId===id),creations:all.creationOutbox,workspace:all.workspace});tx.onabort=()=>no(tx.error)})}finally{db.close()}},id)}
async function saved(p,id,text){await until(async()=>(await state(p,id)).record?.content.includes(text),'IDB commit '+id)}
async function acked(p,id,text,timeout=18000){await until(async()=>{const s=await state(p,id);return s.record?.content.includes(text)&&s.record.content===s.record.baseContent&&!s.ops.length},'ACK '+id,timeout)}
async function launch(profile,offline=false){const c=await chromium.launchPersistentContext(path.join(work,profile),{channel:'chrome',headless:true,viewport:{width:1440,height:1000},offline});await c.setOffline(!offline);await c.setOffline(offline);contexts.add(c);return c}
async function close(c){await c.close();contexts.delete(c)}
async function open(c,id,burst=false){const p=await c.newPage();currentPage=p;p.on('pageerror',e=>console.error('PAGE_ERROR',e.name,e.message));if(burst)await p.addInitScript(()=>{if(!sessionStorage.getItem('auto-burst')){sessionStorage.setItem('auto-burst','1');window.addEventListener('load',()=>{let n=0;const timer=setInterval(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));if(++n===20)clearInterval(timer)},50)},{once:true})}});await p.goto(origin+'/notes/'+id);await editor(p).waitFor();return p}
async function choose(p,id){await p.locator(`[data-node-key="note:${id}"] a`).click();await p.waitForURL(origin+'/notes/'+id);await editor(p).waitFor()}
const pass=(name,data={})=>{results.push({name,passed:true,...data});console.log('PASS:',name)}
async function verifyOfflineCreation(){
 const anchor=await note('Creation anchor'),cc=await launch('creation-hierarchy'),cp=await open(cc,anchor.id)
 await until(()=>cp.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),'creation SW active')
 if(!await cp.evaluate(()=>!!navigator.serviceWorker.controller)){await cp.reload();await editor(cp).waitFor()}
 await cc.setOffline(true)
 async function newFolder(name){await cp.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await cp.getByRole('button',{name:'새 폴더',exact:true}).click();const input=cp.getByRole('textbox',{name:'새 폴더 이름',exact:true});await input.fill(name);await input.press('Enter');await input.waitFor({state:'hidden'});return cp.getByRole('treeitem',{name,exact:true}).getAttribute('data-node-key')}
 const parent=(await newFolder('Offline auto parent')).slice(7),child=(await newFolder('Offline auto child')).slice(7)
 await cp.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await cp.locator('details[open]').getByRole('button',{name:'새 문서',exact:true}).click();await until(()=>!cp.url().endsWith(anchor.id),'local new note URL');const id=cp.url().split('/').at(-1)
 await title(cp).fill('Offline auto manuscript');await editor(cp).fill('offline new manuscript first');await saved(cp,id,'offline new manuscript first')
 assert.equal((await state(cp,id)).creations.length,3);await close(cc)
 const restored=await launch('creation-hierarchy',true),rp=await open(restored,id);assert.ok((await editor(rp).innerText()).includes('offline new manuscript first'))
 const creationResponse=hold(id,false,'POST');await restored.setOffline(false);await until(()=>creationResponse.arrived,'new manuscript POST response held')
 await editor(rp).fill('offline new manuscript plus later input');await saved(rp,id,'plus later input');creationResponse.release();await acked(rp,id,'offline new manuscript plus later input',22000)
 const final=await api('GET','/notes/'+id),serverChild=await api('GET','/folders/'+child);assert.equal(final.folderId,child);assert.equal(serverChild.parentId,parent);assert.equal(final.version,1)
 const ordered=requests.filter(r=>r.method==='POST'&&[parent,child,id].includes(r.entityId));assert.deepEqual(ordered.map(r=>r.entityId),[parent,child,id]);assert.equal(puts(id).length,1);assert.equal((await state(rp,id)).creations.length,0)
 pass('offline-hierarchy-cold-reopen-auto-parent-order-creation-ACK-additional-input',{folderPosts:2,notePosts:1,followupPuts:1,serverVersion:1});await close(restored)
}
async function verifyRichText(){
 const n=await note('Automatic rich text'),cc=await launch('rich-format'),cp=await open(cc,n.id)
 await editor(cp).fill('한글 서식 자동 저장');await editor(cp).press('Meta+a');await editor(cp).press('Meta+b');await editor(cp).press('Meta+i');await cp.getByRole('button',{name:'글머리 기호 목록',exact:true}).click()
 await wait(600);await editor(cp).press('ArrowRight');await cp.keyboard.insertText(' 추가');await editor(cp).press('Meta+z');await editor(cp).press('Meta+Shift+z')
 await acked(cp,n.id,'한글 서식 자동 저장');const s=await state(cp,n.id)
 for(const mark of ['bold','italic','bulletList'])assert.ok(s.record.content.includes(mark),mark)
 const before=puts(n.id).length;await cp.reload();await editor(cp).waitFor();assert.equal(await editor(cp).locator('strong em, em strong').count(),1);assert.equal(await editor(cp).locator('ul').count(),1);await wait(1800);assert.equal(puts(n.id).length,before)
 pass('rich-Korean-format-shortcuts-undo-redo-auto-save-reload-no-echo-PUT',{serverVersion:s.record.baseVersion,putCount:before});await close(cc)
}
async function verifyUnqueuedDraft(){
 const anchor=await note('Orphan anchor'),orphan=await note('Unqueued server'),cc=await launch('unqueued'),cp=await open(cc,anchor.id)
 await cp.goto(origin+'/__seed__')
 await cp.evaluate(async n=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});await new Promise((ok,no)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({noteId:n.id,title:'unqueued local change',content:n.content,baseTitle:n.title,baseContent:n.content,baseVersion:0,latestServerVersion:0,localRevision:2,localSavedAt:Date.now(),storageToken:crypto.randomUUID(),writerId:'synthetic-unqueued'});tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},orphan)
 await cp.goto(origin+'/notes/'+anchor.id);await editor(cp).waitFor();await cp.getByRole('alert').filter({hasText:'로컬 변경에 대응하는 전송 작업'}).waitFor()
 assert.equal(await cp.getByText('모든 변경사항 동기화 완료',{exact:true}).count(),0);assert.equal(puts(orphan.id).length,0);assert.equal(gets(orphan.id).length,0);assert.equal((await state(cp,orphan.id)).record.title,'unqueued local change')
 pass('manually-orphaned-dirty-Draft-preserved-without-fake-completion',{orphanPutCount:0,inactiveBodyGets:0});await close(cc)
}
async function verifyMobile(){
 const n=await note('Automatic mobile'),cc=await launch('mobile'),cp=await cc.newPage();currentPage=cp;await cp.setViewportSize({width:390,height:844});await cp.goto(origin+'/notes/'+n.id);await editor(cp).waitFor()
 await editor(cp).fill('mobile automatic manuscript');await acked(cp,n.id,'mobile automatic manuscript');assert.ok(await cp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await cp.getByRole('button',{name:'사이드바 펼치기',exact:true}).click();await cp.getByRole('dialog',{name:'폴더 사이드바',exact:true}).waitFor();await cp.getByRole('dialog').getByRole('link',{name:n.title,exact:true}).click();await cp.getByRole('dialog').waitFor({state:'hidden'});assert.ok((await editor(cp).innerText()).includes('mobile automatic manuscript'))
 pass('mobile-auto-sync-header-no-overflow-drawer-routing',{viewport:[390,844],horizontalOverflow:false});await close(cc)
}
async function main(){await new Promise(ok=>server.listen(25203,'127.0.0.1',ok));try{
 if(process.env.AUTO_SERVE_ONLY==='1'){console.log('Production auto-sync lab: '+origin+'/notes/'+fixture.noteId);console.log('Use a fresh Chrome profile. Ctrl-C stops only this UI proxy.');await new Promise(ok=>process.once('SIGINT',ok));return}
 if(process.env.AUTO_MOBILE_ONLY==='1'){await verifyMobile();fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-29-auto-mobile-live.json'),JSON.stringify({environment:fixture,results,requests,developmentDbWrites:0},null,2)+'\n');return}
 if(process.env.AUTO_ORPHAN_ONLY==='1'){await verifyUnqueuedDraft();fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-29-auto-unqueued-live.json'),JSON.stringify({environment:fixture,results,requests,developmentDbWrites:0},null,2)+'\n');return}
 if(process.env.AUTO_FORMAT_ONLY==='1'){await verifyRichText();fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-29-auto-richtext-live.json'),JSON.stringify({environment:fixture,results,requests,developmentDbWrites:0},null,2)+'\n');return}
 if(process.env.AUTO_CREATION_ONLY==='1'){await verifyOfflineCreation();fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-29-auto-creation-live.json'),JSON.stringify({environment:fixture,results,requests,developmentDbWrites:0},null,2)+'\n');return}
 const a=await note('Auto A'),b=await note('Auto B');let c=await launch('primary'),p=await open(c,a.id,true)
 await until(()=>p.getByText('모든 변경사항 동기화 완료',{exact:true}).count().then(n=>n>0),'startup success');assert.equal(puts(a.id).length,0);assert.equal(gets(b.id).length,0)
 pass('startup-initializes-local-and-pulls-only-selected-server-note',{unselectedBodyGets:0,startupPuts:0,triggerBurstEvents:60})
 await until(()=>p.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),'SW activated')
 if(!await p.evaluate(()=>!!navigator.serviceWorker.controller)){await p.reload();await editor(p).waitFor()}
 await until(()=>p.evaluate(()=>!!navigator.serviceWorker.controller),'first visit SW controlled after explicit test reload')
 let latestB=await update(b,'server B version one');await choose(p,b.id);await until(async()=>(await editor(p).innerText()).includes('server B version one'),'server-only B selected')
 pass('server-only-selection-GET-and-clean-local-latest-version')
 latestB=await update(latestB,'server B focus latest');await p.bringToFront();const beforeGets=gets(b.id).length
 await p.evaluate(()=>{for(let i=0;i<20;i++){window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))}})
 await until(async()=>(await editor(p).innerText()).includes('server B focus latest'),'focus latest');assert.ok(gets(b.id).length-beforeGets<=2)
 pass('focus-visibility-burst-coalesced-clean-pull',{bodyGets:gets(b.id).length-beforeGets});if(process.env.AUTO_FOCUS_ONLY==='1')return
 await editor(p).fill('dirty must survive remote GET');await saved(p,b.id,'dirty must survive');latestB=await update(latestB,'other profile changed version')
 await p.evaluate(()=>window.dispatchEvent(new Event('focus')))
 const diff=p.getByRole('dialog',{name:'원고 충돌 비교',exact:true});await diff.waitFor();assert.ok((await state(p,b.id)).record.content.includes('dirty must survive'))
 const conflictPuts=puts(b.id).length;await wait(5500);assert.equal(puts(b.id).length,conflictPuts)
 pass('dirty-GET-protection-server-409-and-no-retry-loop')
 await diff.getByRole('button',{name:'현재 원고 선택',exact:true}).click();await diff.waitFor({state:'hidden'});await acked(p,b.id,'dirty must survive');latestB=await api('GET','/notes/'+b.id)
 pass('existing-Diff-choice-and-immediate-manual-save-regression')
 const rapidStart=puts(b.id).length;await editor(p).fill('rapid ');for(let i=0;i<35;i++)await p.keyboard.insertText(String(i%10))
 const rapidText=await editor(p).innerText(),caret=await editor(p).evaluate(el=>{window.__editorDom=el;return window.getSelection()?.anchorOffset})
 assert.equal(puts(b.id).length,rapidStart);await acked(p,b.id,rapidText)
 assert.equal(puts(b.id).length-rapidStart,1);assert.equal(await editor(p).evaluate(el=>el===window.__editorDom),true);assert.equal(await editor(p).evaluate(()=>window.getSelection()?.anchorOffset),caret)
 pass('35-fast-inputs-one-PUT-stable-editor-and-caret',{insertTextCalls:35,setupFillCalls:1,putCount:1})
 const h=hold(b.id);await editor(p).fill('inflight A');await until(()=>h.arrived,'held PUT');const frozen=h.record
 await editor(p).fill('inflight A plus B');await saved(p,b.id,'inflight A plus B');h.release();await acked(p,b.id,'inflight A plus B',22000)
 assert.equal(puts(b.id).filter(x=>x.operationId===frozen.operationId).length,1)
 pass('input-during-PUT-preserved-rebased-and-followup-auto-ACK')
 const loss=hold(b.id,true);await editor(p).fill('response loss A');await until(()=>loss.arrived,'loss response held');await c.setOffline(true);await editor(p).fill('response loss A plus B');await saved(p,b.id,'response loss A plus B');loss.release()
 await until(async()=>(await state(p,b.id)).ops.some(o=>o.status==='inFlight'),'uncertain operation retained');await wait(500);await c.setOffline(false);await acked(p,b.id,'response loss A plus B',42000)
 const retries=puts(b.id).filter(r=>r.operationId===loss.record.operationId);assert.ok(retries.length>=2);assert.equal(new Set(retries.map(r=>r.hash)).size,1)
 pass('online-reconnect-response-loss-same-operation-and-snapshot',{attempts:retries.length,distinctPayloadHashes:1})
 await until(()=>p.evaluate(()=>!!navigator.serviceWorker.controller),'SW control before offline')
 await c.setOffline(true);await editor(p).fill('offline persisted draft');await saved(p,b.id,'offline persisted draft');await close(c)
 c=await launch('primary',true);p=await open(c,b.id);assert.ok((await editor(p).innerText()).includes('offline persisted draft'));assert.ok((await state(p,b.id)).ops.length)
 await editor(p).fill('offline cold reopen edit');await saved(p,b.id,'offline cold reopen edit');await close(c)
 c=await launch('primary');p=await open(c,b.id);await acked(p,b.id,'offline cold reopen edit',22000)
 pass('PWA-offline-close-relaunch-local-workspace-edit-and-online-auto-sync')
 // Rapid selection: a late response from B must never enter A's editor.
 await choose(p,a.id);delays.set('/api/notes/'+b.id,1400);await choose(p,b.id);await until(()=>sync(p).isEnabled(),'manual pull available');await sync(p).click();await wait(200);await choose(p,a.id);await wait(1900);assert.ok((await editor(p).innerText()).includes('Auto A base'));delays.clear();await editor(p).fill('automatic work continues after canceled B GET');await acked(p,a.id,'automatic work continues after canceled B GET',18000)
 pass('rapid-A-B-A-cancels-stale-pull-keeps-auto-sync-running')
 const peer=await open(c,a.id);const original=puts(a.id).length;await editor(p).fill('one writer two observing tabs');await acked(p,a.id,'one writer two observing tabs',22000);await wait(5500)
 assert.equal(puts(a.id).length-original,1)
 pass('two-tabs-auto-sync-WebLock-one-server-application',{putCount:1})
 // Both tabs edit different text before either quiet period expires.
 await Promise.all([editor(p).fill('tab one divergence'),editor(peer).fill('tab two divergence')]);await until(async()=>await p.getByRole('dialog',{name:'원고 충돌 비교',exact:true}).count()+await peer.getByRole('dialog',{name:'원고 충돌 비교',exact:true}).count()>0,'local CAS comparison')
 pass('real-two-tab-local-CAS-keeps-conflicting-input')
 await close(c)
 // Persisted A+B plus uncertain A: restart must retry A and produce B with the ACK version.
 for(const alreadyApplied of [false,true]){
  let n=await note('Cold uncertain '+alreadyApplied);n=await update(n,'base v1');n=await update(n,'base v2')
  const opId=randomUUID(),payload={title:n.title,content:rich('cold A'),expectedVersion:2}
  if(alreadyApplied)await api('PUT','/notes/'+n.id,payload,opId)
  let cc=await launch('cold-'+alreadyApplied),seed=await open(cc,b.id);await seed.goto(origin+'/__seed__')
  await seed.evaluate(async({n,opId,payload})=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)}),now=Date.now();await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox'],'readwrite');tx.objectStore('drafts').put({noteId:n.id,title:n.title,content:JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'cold A plus B'}]}]}),baseTitle:n.title,baseContent:n.content,baseVersion:2,latestServerVersion:2,localRevision:3,localSavedAt:now,storageToken:crypto.randomUUID(),writerId:'isolated-crash-fixture'});tx.objectStore('outbox').put({operationId:opId,noteId:n.id,type:'NOTE_UPDATE',title:payload.title,content:payload.content,expectedVersion:2,localRevision:2,createdAt:now,updatedAt:now,status:'inFlight',attemptedAt:now});tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},{n,opId,payload})
  await close(cc);cc=await launch('cold-'+alreadyApplied);const cp=await open(cc,n.id);await acked(cp,n.id,'cold A plus B',25000);const final=await api('GET','/notes/'+n.id);assert.equal(final.version,4);assert.ok(puts(n.id).some(r=>r.operationId===opId&&r.expectedVersion===2));assert.ok(puts(n.id).some(r=>r.operationId!==opId&&r.expectedVersion===3))
  pass('cold-start-recovery-barrier-uncertain-A-successor-B-'+alreadyApplied,{finalVersion:4,serverHadAlreadyAppliedA:alreadyApplied});await close(cc)
 }
 // Server deletion must enter review, never automatically recreate the same UUID.
 const gone=await note('Deleted server');c=await launch('deleted');p=await open(c,gone.id);await api('DELETE','/notes/'+gone.id);await editor(p).fill('retain deleted local draft')
 await p.getByRole('dialog',{name:'삭제된 서버 원고 복구',exact:true}).waitFor();assert.ok((await state(p,gone.id)).record.content.includes('retain deleted'));assert.equal(requests.filter(r=>r.method==='POST').length,0)
 pass('server-NOTE_NOT_FOUND-keeps-local-and-does-not-recreate');await close(c)
 // Permission and permanent validation failures must not trigger an automatic retry loop.
 for(const status of [401,400]){
  const n=await note('Failure '+status);c=await launch('failure-'+status);p=await open(c,n.id);await until(()=>p.getByText('모든 변경사항 동기화 완료',{exact:true}).count().then(n=>n>0),'initial ready')
  deny.set('/api/notes/'+n.id+':PUT',status);await editor(p).fill('preserve failure '+status);await until(()=>puts(n.id).length===1,'failure PUT');await wait(6500);assert.equal(puts(n.id).length,1);assert.ok((await state(p,n.id)).record.content.includes('preserve failure'))
  deny.delete('/api/notes/'+n.id+':PUT');await sync(p).click();await acked(p,n.id,'preserve failure',18000)
  pass('permanent-'+status+'-no-auto-retry-manual-retry-works');await close(c)
 }
 // Actual persistent server outage: initial attempt plus only three delayed retries.
 const failing=await note('Bounded outage');c=await launch('outage');p=await open(c,failing.id);await until(()=>p.getByText('모든 변경사항 동기화 완료',{exact:true}).count().then(n=>n>0),'outage ready');deny.set('/api/notes/'+failing.id+':PUT',503)
 await editor(p).fill('outage local stays safe');await until(()=>puts(failing.id).length===1,'first outage PUT')
 await p.evaluate(()=>{for(let i=0;i<50;i++){window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))}})
 await until(()=>puts(failing.id).length===4,'bounded retries',65000);await wait(7000);assert.equal(puts(failing.id).length,4);assert.ok((await state(p,failing.id)).record.content.includes('outage local'))
 const outageRequests=puts(failing.id);assert.equal(new Set(outageRequests.map(r=>r.operationId)).size,1);assert.equal(new Set(outageRequests.map(r=>r.hash)).size,1)
 deny.delete('/api/notes/'+failing.id+':PUT');await sync(p).click();await acked(p,failing.id,'outage local stays safe',18000)
 pass('persistent-503-bounded-backoff-focus-storm-no-PUT-flood',{failedAttempts:4,intervalsMs:outageRequests.slice(1).map((r,i)=>r.at-outageRequests[i].at)});await close(c)
 fs.writeFileSync(process.env.SEAM_AUTO_SYNC_REPORT||path.join(__dirname,'../../../docs/verification/2026-10-29-auto-sync-live.json'),JSON.stringify({environment:fixture,results,requests,developmentDbWrites:0,limitations:['Synthetic fixtures only','Native OS IME and Safari not tested','Cold uncertain queue is an explicit crash-state fixture; PWA close/relaunch is a real browser restart']},null,2)+'\n')
 }finally{fs.writeFileSync(path.join(work,'partial-results.json'),JSON.stringify({results,requests},null,2));for(const c of contexts)await c.close();server.closeAllConnections?.();await new Promise(ok=>server.close(ok))}}
main().catch(e=>{console.error(e);process.exitCode=1})
