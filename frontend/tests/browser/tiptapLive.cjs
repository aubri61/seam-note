// Production PWA + actual Spring/PostgreSQL. Only fresh isolated fixtures and profiles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {randomUUID,createHash}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'))
assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439);assert.notEqual(new URL(fixture.apiOrigin).port,'18765')
const origin='http://127.0.0.1:25203',work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-tiptap-live-')),results=[],requests=[],contexts=new Set()
const sha=s=>createHash('sha256').update(s).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms))
const rich=(text,mark)=>JSON.stringify({type:'doc',content:[{type:'paragraph',...(text?{content:[{type:'text',...(mark?{marks:[{type:mark}]}:{}),text}]}:{})}]})
async function until(fn,label){for(let i=0;i<800;i++){if(await fn())return;await pause(25)}throw Error(label)}
async function api(method,route,payload,key=randomUUID()) {const r=await fetch(fixture.apiOrigin+'/api'+route,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:payload?JSON.stringify(payload):undefined});assert.ok(r.ok,method+' '+route+' '+r.status);return r.status===204?null:r.json()}
let holding=null,failGets=false
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){
  if(failGets&&req.method==='GET'){res.writeHead(503);return res.end('{}')}
  const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',async()=>{
   try{const raw=Buffer.concat(chunks).toString(),r=await fetch(fixture.apiOrigin+req.url,{method:req.method,headers:{'Content-Type':'application/json','Idempotency-Key':req.headers['idempotency-key']||randomUUID()},body:raw||undefined}),body=await r.text()
    if(req.method!=='GET')requests.push({method:req.method,path:req.url,key:req.headers['idempotency-key'],payloadHash:sha(raw),expectedVersion:raw?JSON.parse(raw).expectedVersion:undefined,status:r.status})
    const held=holding&&req.method==='PUT'&&req.url==='/api/notes/'+holding.id?holding:null
    if(held){holding=null;held.request=requests.at(-1);held.arrived=true;if(held.drop){req.socket.destroy();return}await held.promise}
    res.writeHead(r.status,{'Content-Type':'application/json',...(r.headers.get('idempotency-key')?{'Idempotency-Key':r.headers.get('idempotency-key')}:{})});res.end(body)
   }catch{res.writeHead(502);res.end('{}')}
  });return
 }
 const url=new URL(req.url,origin),file=path.join(__dirname,'../../dist',url.pathname==='/'||url.pathname.startsWith('/notes/')?'index.html':url.pathname)
 if(!file.startsWith(path.resolve(__dirname,'../../dist'))||!fs.existsSync(file)){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html');res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(file))
})
function hold(id,drop=false){let release;const value={id,drop,promise:new Promise(ok=>release=ok),release:()=>release()};holding=value;return value}
const editor=p=>p.locator('[aria-label="문서 내용"][contenteditable="true"]'),title=p=>p.getByLabel('문서 제목',{exact:true}),button=p=>p.locator('[data-workspace-sync]')
async function state(p,id){return p.evaluate(async id=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});try{return await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox','creationOutbox','localEntities','workspace'],'readonly'),out={};for(const name of ['drafts','outbox','creationOutbox','localEntities','workspace']){const r=tx.objectStore(name).getAll();r.onsuccess=()=>out[name]=r.result}tx.oncomplete=()=>ok({record:out.drafts.find(d=>d.noteId===id),ops:out.outbox.filter(o=>o.noteId===id),...out});tx.onerror=()=>no(tx.error)})}finally{db.close()}},id)}
async function saved(p,id,check){await until(async()=>{const s=await state(p,id);return s.record&&check(s.record)},'local commit '+id)}
async function open(ctx,id){const p=await ctx.newPage();await p.goto(origin+'/notes/'+id);await editor(p).waitFor();await until(()=>editor(p).isEditable(),'editor editable');return p}
async function sync(p){await until(()=>button(p).isEnabled(),'sync enabled');await button(p).click();await until(()=>button(p).isEnabled(),'sync done')}
async function launch(profile,offline=false){const ctx=await chromium.launchPersistentContext(path.join(work,profile),{channel:'chrome',headless:true,viewport:{width:1440,height:1000},offline});await ctx.setOffline(!offline);await ctx.setOffline(offline);contexts.add(ctx);return ctx}
async function close(ctx){await ctx.close();contexts.delete(ctx)}
function pass(name,data={}){results.push({name,passed:true,...data});console.log('PASS:',name)}
async function main(){await new Promise(ok=>server.listen(25203,'127.0.0.1',ok));try{
 const folder=await api('POST','/folders',{id:randomUUID(),name:'Tiptap synthetic'}),a=await api('POST','/notes',{id:randomUUID(),folderId:folder.id,title:'Rich A',content:rich('서버 초기')}),b=await api('POST','/notes',{id:randomUUID(),folderId:folder.id,title:'Rich B',content:rich('다른 원고')})
 let ctx=await launch('primary'),p=await open(ctx,a.id);let pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message))
 await editor(p).fill('한글 문장');await editor(p).press('Meta+a');await p.getByRole('button',{name:'굵게',exact:true}).click();await p.getByRole('button',{name:'기울임',exact:true}).click();await p.getByRole('button',{name:'글머리 기호 목록',exact:true}).click()
 await saved(p,a.id,r=>r.content.includes('bulletList')&&r.content.includes('bold')&&r.content.includes('italic'))
 let richA=(await state(p,a.id)).record.content;assert.equal(await editor(p).locator('strong em, em strong').count(),1)
 await p.getByRole('button',{name:'실행 취소',exact:true}).click();await p.getByRole('button',{name:'다시 실행',exact:true}).click();await saved(p,a.id,r=>r.content===richA)
 await p.getByRole('button',{name:'번호 목록',exact:true}).click();await saved(p,a.id,r=>r.content.includes('orderedList'));richA=(await state(p,a.id)).record.content
 await p.reload();await editor(p).waitFor();await until(async()=>await editor(p).locator('ol').count()===1,'list restored after reload');assert.equal((await state(p,a.id)).record.content,richA)
 await p.getByRole('link',{name:'Rich B',exact:true}).click();await until(async()=>await editor(p).innerText()==='다른 원고','B loaded');await p.goBack();await until(async()=>await editor(p).locator('ol').count()===1,'A restored on Back')
 const boldBefore=await editor(p).locator('strong').count();await editor(p).focus();await p.keyboard.press('Meta+Backslash');await until(()=>p.locator('button[aria-controls="folders-sidebar"]').getAttribute('aria-expanded').then(v=>v==='false'),'sidebar shortcut over editor');assert.equal(await editor(p).locator('strong').count(),boldBefore);await p.keyboard.press('Control+Backslash');await until(()=>p.locator('button[aria-controls="folders-sidebar"]').getAttribute('aria-expanded').then(v=>v==='true'),'sidebar shortcut restore')
 pass('rich-formatting-undo-redo-local-reload-note-switch',{contentHash:sha(richA),sidebarShortcutDoesNotToggleBold:true})
 await editor(p).press('Meta+a');await editor(p).press('Backspace');await editor(p).press('Enter');await editor(p).press('Shift+Enter');await editor(p).type('한글');await saved(p,a.id,r=>r.content.includes('hardBreak')&&r.content.includes('한글'))
 const beforeComposition=await editor(p).elementHandle();await editor(p).dispatchEvent('compositionstart',{data:''});await editor(p).dispatchEvent('compositionupdate',{data:'한'});await p.keyboard.insertText(' 조합 입력');await editor(p).dispatchEvent('compositionend',{data:' 조합 입력'});await saved(p,a.id,r=>r.content.includes('조합 입력'))
 assert.equal(await beforeComposition.evaluate(el=>el.isConnected),true)
 const pasted='<p><strong>붙여넣기</strong><em>기울임</em></p><ul><li>목록</li></ul><script>window.__unsafe=1</script>'
 await editor(p).evaluate((el,html)=>{const data=new DataTransfer();data.setData('text/html',html);data.setData('text/plain','붙여넣기');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))},pasted)
 await saved(p,a.id,r=>r.content.includes('붙여넣기'));assert.equal(await p.evaluate(()=>window.__unsafe),undefined)
 pass('empty-paragraph-hardbreak-korean-composition-events-paste',{nativeOsIme:'not automated; composition DOM events plus Korean insertText tested'})
 await p.keyboard.press('Meta+s');await until(async()=>!(await state(p,a.id)).ops.length,'first update ACK');let n=await api('GET','/notes/'+a.id);assert.equal(n.content,(await state(p,a.id)).record.content)
 pass('existing-rich-update-server-ack',{version:n.version})
 // Actual server commit, held response, input B persists before ACK.
 await editor(p).fill('전송 A');await saved(p,a.id,r=>r.content.includes('전송 A'));const held=hold(a.id);await button(p).click();await until(()=>held.arrived,'server committed held A')
 await editor(p).fill('전송 A 이후 B');await saved(p,a.id,r=>r.content.includes('이후 B'));held.release();await until(()=>button(p).isEnabled(),'A ACK completed');await sync(p);await until(async()=>!(await state(p,a.id)).ops.length,'B ACK');n=await api('GET','/notes/'+a.id);assert.ok(n.content.includes('이후 B'))
 pass('inflight-additional-rich-input-preserved-and-rebased',{serverVersion:n.version})
 // Lost success response must replay the original key and payload after reload.
 await editor(p).fill('응답 유실 원고');await saved(p,a.id,r=>r.content.includes('응답 유실'));const lost=hold(a.id);await button(p).click();await until(()=>lost.arrived,'lost response committed');const uncertain=(await state(p,a.id)).ops.find(o=>o.status==='inFlight');assert.ok(uncertain)
 await p.evaluate(async()=>{await navigator.serviceWorker.ready});await until(()=>p.evaluate(()=>!!navigator.serviceWorker.controller),'SW before response loss')
 await ctx.setOffline(true);await p.reload();lost.release();await editor(p).waitFor();await ctx.setOffline(false);await sync(p);await until(async()=>!(await state(p,a.id)).ops.length,'replay ACK');const repeated=requests.filter(r=>r.key===uncertain.operationId);assert.equal(repeated.length,2);assert.equal(repeated[0].payloadHash,repeated[1].payloadHash)
 pass('lost-response-reload-same-key-snapshot-replay',{operationId:uncertain.operationId,serverVersion:(await api('GET','/notes/'+a.id)).version})
 // Server VERSION_CONFLICT with format-only difference; choosing preserves complete JSON.
 const base=await api('GET','/notes/'+a.id)
 await editor(p).fill('같은 문장');await editor(p).press('Meta+a');await p.getByRole('button',{name:'굵게',exact:true}).click();await saved(p,a.id,r=>r.content.includes('같은 문장')&&r.content.includes('bold'))
 await title(p).fill('현재 제목');await saved(p,a.id,r=>r.title==='현재 제목');const mine=(await state(p,a.id)).record.content
 await api('PUT','/notes/'+a.id,{title:'서버 제목',content:rich('같은 문장','italic'),expectedVersion:base.version})
 await sync(p);let dialog=p.getByRole('dialog',{name:'원고 충돌 비교',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).waitFor();await until(()=>dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).isEnabled(),'diff ready')
 const diffText=await dialog.innerText();assert.ok(diffText.includes('현재 제목')&&diffText.includes('서버 제목'));assert.ok(!diffText.includes('"type"'))
 await dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).click();await dialog.waitFor({state:'hidden'});n=await api('GET','/notes/'+a.id);assert.equal(n.content,mine);assert.equal(n.title,'현재 제목');assert.ok((await state(p,a.id)).record.conflictHistory.length)
 pass('server-version-conflict-diff-choose-mine-keeps-format',{version:n.version})
 await editor(p).fill('또 다른 로컬');await saved(p,a.id,r=>r.content.includes('또 다른'));const other=await api('PUT','/notes/'+a.id,{title:'상대 제목',content:rich('상대 문장','italic'),expectedVersion:n.version})
 await sync(p);dialog=p.getByRole('dialog',{name:'원고 충돌 비교',exact:true});await until(()=>dialog.getByRole('button',{name:'서버 원고 선택',exact:true}).isEnabled(),'other diff ready');await dialog.getByRole('button',{name:'서버 원고 선택',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal((await api('GET','/notes/'+a.id)).content,other.content);await until(async()=>await editor(p).locator('em').count()===1,'adopted formatting visible')
 pass('server-version-conflict-choose-other-keeps-format-and-recovery-copy')
 // Simultaneous tab edits: keep both local drafts, surface CAS diff rather than overwrite.
 const peer=await open(ctx,a.id);await Promise.all([editor(p).fill('탭 하나 서로 다른 원고'),editor(peer).fill('탭 둘 다른 원고')])
 let conflicted;await until(async()=>{for(const page of [p,peer])if(await page.getByRole('dialog',{name:'원고 충돌 비교',exact:true}).isVisible()){conflicted=page;return true}return false},'local CAS diff')
 dialog=conflicted.getByRole('dialog',{name:'원고 충돌 비교',exact:true});await until(()=>dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).isEnabled(),'local diff ready');assert.ok((await dialog.innerText()).includes('다른 탭 원고'));await dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).click();await dialog.waitFor({state:'hidden'});pass('two-tabs-real-local-cas-diff-and-safe-choice')
 // Close both pages (memory is per-tab); new page recovers committed choice.
 await p.close();await peer.close();p=await open(ctx,a.id)
 // Genuine offline creation: folder -> note -> editing, all persisted before server exists.
 await ctx.setOffline(true);await p.locator('[data-node-key="folder:'+folder.id+'"]').click();await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByRole('button',{name:'새 폴더',exact:true}).click();await p.getByLabel('새 폴더 이름',{exact:true}).fill('오프라인 새 폴더');await p.getByLabel('새 폴더 이름',{exact:true}).press('Enter');await p.getByRole('treeitem',{name:'오프라인 새 폴더',exact:true}).waitFor();await p.getByRole('button',{name:'새 문서',exact:true}).click();await until(()=>!p.url().endsWith(a.id),'local new route');const createdId=p.url().split('/').at(-1);await editor(p).waitFor();await until(()=>editor(p).isEditable(),'new rich editor');await title(p).fill('오프라인 새 원고');await editor(p).fill('오프라인 한글 작성');await editor(p).press('Meta+a');await p.getByRole('button',{name:'굵게',exact:true}).click();await saved(p,createdId,r=>r.content.includes('bold'))
 const offline=(await state(p,createdId)).record.content;assert.ok((await state(p,createdId)).creationOutbox.some(o=>o.entityId===createdId))
 await p.evaluate(async()=>{await navigator.serviceWorker.ready});await until(()=>p.evaluate(()=>!!navigator.serviceWorker.controller),'SW controls page');await close(ctx)
 ctx=await launch('primary',true);p=await open(ctx,createdId);await until(async()=>await editor(p).locator('strong').count()===1,'offline reopen restores rich');assert.equal((await state(p,createdId)).record.content,offline);await editor(p).press('End');await p.keyboard.insertText(' 재실행 추가');await saved(p,createdId,r=>r.content.includes('재실행 추가'));const recovered=(await state(p,createdId)).record.content
 const cachedApi=await p.evaluate(async()=>{const keys=await caches.keys(),urls=[];for(const key of keys)for(const req of await(await caches.open(key)).keys())urls.push(req.url);return urls.filter(u=>new URL(u).pathname.startsWith('/api/'))});assert.deepEqual(cachedApi,[])
 pass('pwa-offline-folder-note-create-close-reopen-rich-edit',{noteId:createdId,apiCacheEntries:0})
 await ctx.setOffline(false);await until(()=>button(p).isEnabled(),'online');await sync(p);await until(async()=>{const s=await state(p,createdId);return !s.ops.length&&!s.creationOutbox.length},'created note and successor ACK');const created=await api('GET','/notes/'+createdId);assert.equal(created.content,recovered)
 pass('offline-creation-parent-order-online-create-followup-full-workspace-ack',{version:created.version})
 failGets=true;await p.reload();await editor(p).waitFor();await until(async()=>await editor(p).innerText().then(s=>s.includes('재실행 추가')),'503 retains local rich');assert.equal((await state(p,createdId)).record.content,recovered);failGets=false;pass('server-get-failure-does-not-delete-rich-local-draft')
 const long='한국어 소설 원고 문장입니다. '.repeat(2500);const t0=Date.now();await editor(p).fill(long);await saved(p,createdId,r=>r.content.includes(long));const elapsed=Date.now()-t0
 const element=await editor(p).elementHandle();await editor(p).press('End');const typing=Date.now();await p.keyboard.insertText('끝');await saved(p,createdId,r=>r.content.includes(long+'끝'));assert.equal(await element.evaluate(el=>el.isConnected),true)
 pass('long-korean-manuscript-edit-stable-editor-instance',{characters:long.length,bulkInputToCommitMs:elapsed,lastInputToCommitMs:Date.now()-typing,measurement:'Includes real UI event, serialization, debounce and IndexedDB; one run, not a percentile or improvement claim'})
 const switchStart=Date.now();await p.locator('[data-node-key="note:'+b.id+'"] a').click();await until(async()=>await editor(p).innerText()==='다른 원고','long note switch away');await p.goBack();await until(async()=>await editor(p).innerText().then(s=>s.endsWith('끝')),'long note return');pass('long-note-switch-back-preserves-rich-draft',{roundTripMs:Date.now()-switchStart})
 await p.screenshot({path:path.join(work,'tiptap-final.png'),fullPage:false});assert.deepEqual(pageErrors,[])
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-29-tiptap-live.json'),JSON.stringify({environment:{...fixture,productionOrigin:origin,artifacts:work},results,requests,limits:['Native OS Korean IME candidate window not automated; Korean text + composition DOM events checked.','One long-document measurement; no statistical performance claim.']},null,2)+'\n')
 }finally{for(const c of contexts)await c.close();await new Promise(ok=>server.close(ok))}}
main().catch(e=>{console.error(e);process.exitCode=1})
