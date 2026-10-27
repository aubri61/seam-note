// Real production SW -> dedicated HTTP proxy -> isolated Spring/PostgreSQL fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http')
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const fixture=JSON.parse(fs.readFileSync(process.env.SEAM_NOTE_LAB_FIXTURE,'utf8'));assert.equal(fixture.dbName,'seam_note_manual_lab');assert.notEqual(fixture.dbPort,15439)
const root=path.resolve(__dirname,'../../..'),work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-note-create-')),profile=path.join(work,'profile')
const title=p=>p.getByLabel('문서 제목'),body=p=>p.getByLabel('문서 내용'),save=p=>p.getByRole('button',{name:'서버에 저장',exact:true})
const sha=s=>createHash('sha256').update(s).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms)),events=[],cases=[]
async function until(fn,label){for(let i=0;i<600;i++){if(await fn())return;await pause(30)}throw Error('Timeout: '+label)}
const done=(name,data={})=>{cases.push({name,passed:true,...data});console.log('PASS: '+name)}
function sql(query){return execFileSync('psql',['-h','127.0.0.1','-p',String(fixture.dbPort),'-U','postgres','-d',fixture.dbName,'-Atc',query],{encoding:'utf8'}).trim()}
async function records(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-local');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})
 try{return await new Promise((ok,no)=>{const tx=db.transaction([...db.objectStoreNames],'readonly'),out={version:db.version};for(const n of db.objectStoreNames){const r=tx.objectStore(n).getAll();r.onsuccess=()=>out[n]=r.result}tx.oncomplete=()=>ok(out);tx.onerror=()=>no(tx.error)})}finally{db.close()}
})}
async function createdFolder(page,name,top=false){
 await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByRole('button',{name:top?'새 최상위 폴더':'새 폴더',exact:true}).click()
 await page.getByLabel('새 폴더 이름',{exact:true}).fill(name)
 await page.getByLabel('새 폴더 이름',{exact:true}).press('Enter')
 await until(async()=>(await records(page)).localEntities.some(e=>e.folder?.name===name),'folder commit')
 const e=(await records(page)).localEntities.find(e=>e.folder?.name===name)
 await page.locator(`[data-node-key="folder:${e.id}"]`).waitFor();return e.id
}
async function createNote(page){
 const before=page.url()
 await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByLabel('추가할 항목',{exact:true}).getByRole('button',{name:'새 문서',exact:true}).click()
 await until(()=>page.url()!==before&&new URL(page.url()).pathname.startsWith('/notes/'),'created note route')
 return new URL(page.url()).pathname.split('/').at(-1)
}
let context,server,origin,failId,dropId,holdId,release,held=false
async function launch(offline){context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1360,height:900}});await context.setOffline(offline);return context.pages()[0]||context.newPage()}
async function main(){try{
 const build=path.join(work,'build'),config=path.join(work,'vite.config.mjs')
 fs.writeFileSync(config,`import c from ${JSON.stringify(path.join(root,'frontend/vite.config.ts'))};export default {...c,root:${JSON.stringify(path.join(root,'frontend'))},build:{outDir:${JSON.stringify(build)},emptyOutDir:true}}`)
 fs.writeFileSync(path.join(work,'build.log'),execFileSync('pnpm',['exec','vite','build','--config',config],{cwd:path.join(root,'frontend'),encoding:'utf8'}))
 server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://fixture').pathname;res.setHeader('Cache-Control','no-store')
  if(pathname.startsWith('/api/')){
   let data='';for await(const chunk of req)data+=chunk
   const request=data?JSON.parse(data):null,id=request?.id||pathname.split('/').at(-1),key=req.headers['idempotency-key']
   if(req.method!=='GET')events.push({method:req.method,path:pathname,entityId:id,key,expectedVersion:request?.expectedVersion,contentHash:request?.content===undefined?undefined:sha(request.content)})
   if(req.method==='POST'&&id===failId){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:'TEST_PARENT_FAILURE',message:'fixture failure',errors:[]}))}
   const response=await fetch(fixture.apiOrigin+req.url,{method:req.method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:data||undefined}),raw=await response.text()
   if(req.method==='POST'&&id===dropId&&response.ok){dropId=null;res.writeHead(502,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:'UPSTREAM_RESPONSE_LOST',message:'success response lost at fixture gateway',errors:[]}))}
   if(req.method==='POST'&&id===holdId&&response.ok){held=true;await new Promise(resolve=>{release=resolve});holdId=null}
   res.writeHead(response.status,{'Content-Type':'application/json',...(response.headers.get('idempotency-key')?{'Idempotency-Key':response.headers.get('idempotency-key')}:{})});return res.end(raw)
  }
  if(pathname==='/seed.html'){res.setHeader('Content-Type','text/html');return res.end('<html><body>fixture</body></html>')}
  const file=pathname==='/'||pathname.startsWith('/notes/')?path.join(build,'index.html'):path.join(build,pathname)
  if(!file.startsWith(build)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('missing')}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.css':'text/css','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;console.log('Production origin '+origin+'; artifacts '+work)
 let page=await launch(false);await page.goto(origin+'/seed.html')
 const snapshot=await(await fetch(fixture.apiOrigin+'/api/workspace/tree')).json(),original=await(await fetch(fixture.apiOrigin+'/api/notes/'+fixture.noteId)).json()
 const legacy={noteId:original.id,title:'v3 보존 제목',content:'v3 보존 합성 원고',baseTitle:original.title,baseContent:original.content,baseVersion:original.version,latestServerVersion:original.version,localRevision:9,localSavedAt:100,storageToken:randomUUID(),writerId:'v3-fixture'}
 const oldOp={operationId:randomUUID(),noteId:original.id,type:'NOTE_UPDATE',title:legacy.title,content:legacy.content,expectedVersion:0,localRevision:9,status:'pending',attemptedAt:null,createdAt:100,updatedAt:100}
 await page.evaluate(async({legacy,oldOp,snapshot})=>{
  const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-local',30);r.onupgradeneeded=()=>{r.result.createObjectStore('drafts',{keyPath:'noteId'});const out=r.result.createObjectStore('outbox',{keyPath:'operationId'});out.createIndex('noteId','noteId');out.createIndex('status','status');r.result.createObjectStore('workspace',{keyPath:'key'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})
  await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox','workspace'],'readwrite');tx.objectStore('drafts').put(legacy);tx.objectStore('outbox').put(oldOp);tx.objectStore('workspace').put({key:'current',data:snapshot,cachedAt:100,requestedAt:100});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()
 },{legacy,oldOp,snapshot})
 await page.goto(origin+'/notes/'+fixture.noteId);await until(async()=>await title(page).inputValue()===legacy.title,'v3 restored')
 const migrated=await records(page);assert.equal(migrated.version,40);assert.deepEqual(migrated.drafts.find(d=>d.noteId===legacy.noteId),legacy);assert.deepEqual(migrated.outbox.find(o=>o.operationId===oldOp.operationId),oldOp)
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.getByText(/오프라인 앱 파일 준비됨/).waitFor();done('v3-to-v4-preserves-existing-draft-outbox')
 await context.setOffline(true)
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='creationOutbox')throw Error('Injected creation rollback');return original.apply(this,args)};window.restoreAdd=()=>{IDBObjectStore.prototype.add=original}})
 await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByRole('button',{name:'새 폴더',exact:true}).click();await page.getByLabel('새 폴더 이름',{exact:true}).fill('실패할 폴더')
 await page.getByLabel('새 폴더 이름',{exact:true}).press('Enter');await page.getByRole('tree').getByRole('alert').waitFor()
 let failed=await records(page);assert.equal(failed.localEntities.length,0);assert.equal(failed.creationOutbox.length,0)
 await page.evaluate(()=>window.restoreAdd());await page.getByLabel('새 폴더 이름',{exact:true}).press('Escape');done('local-entity-and-create-intent-roll-back-together')
 const a=await createdFolder(page,'오프라인 A',true);await page.reload();await until(async()=>(await records(page)).localEntities.some(e=>e.id===a),'folder after reload')
 await page.locator(`[data-node-key="folder:${a}"]`).click();const b=await createdFolder(page,'오프라인 B');const c=await createNote(page)
 await until(async()=>await title(page).getAttribute('readonly')===null,'new note editable')
 await title(page).fill('오프라인 C');await body(page).fill('오프라인에서 쓴 첫 합성 원고')
 await until(async()=>(await records(page)).drafts.find(d=>d.noteId===c)?.content==='오프라인에서 쓴 첫 합성 원고','new draft commit')
 let r=await records(page);assert.equal(r.creationOutbox.length,3);assert.equal(r.outbox.filter(o=>o.noteId===c).length,0);assert.equal(events.length,0)
 assert.equal(r.localEntities.find(e=>e.id===b).folder.parentId,a);assert.equal(r.localEntities.find(e=>e.id===c).note.folderId,b)
 done('offline-folder-child-note-atomic-create-edit-without-update',{folderA:a,folderB:b,noteC:c})
 await context.close();context=null;page=await launch(true);await page.goto(origin+'/notes/'+c);await until(async()=>await body(page).inputValue()==='오프라인에서 쓴 첫 합성 원고','PWA new process local created note');assert.equal(await save(page).isDisabled(),true)
 done('pwa-offline-new-process-keeps-generated-tree-route-body')
 failId=a;await context.setOffline(false);await until(()=>save(page).isEnabled(),'online local create save enabled');await pause(200);assert.equal(events.length,0)
 await save(page).click();await page.getByText(/생성 결과 또는 ACK를 확인하지 못했습니다/).waitFor()
 r=await records(page);assert.equal(r.creationOutbox.length,3);assert.equal(sql("select count(*) from folders where id='"+a+"'"),'0');assert.equal(events.length,1)
 const keyA=events[0].key;done('parent-failure-blocks-all-children-keeps-local')
 failId=null;dropId=b;await save(page).click();await page.getByText(/생성 결과 또는 ACK를 확인하지 못했습니다/).waitFor()
 r=await records(page);assert.equal(r.localEntities.find(e=>e.id===a).confirmed,true);assert.equal(r.localEntities.find(e=>e.id===b).confirmed,false);assert.equal(events.filter(e=>e.entityId===a).at(-1).key,keyA)
 assert.equal(sql("select count(*) from notes where id='"+c+"'"),'0');const keyB=events.find(e=>e.entityId===b).key
 done('partial-parent-success-lost-response-keeps-same-key')
 holdId=c;held=false;await save(page).click();await until(()=>held,'create C response held after commit')
 assert.equal(events.filter(e=>e.entityId===b).at(-1).key,keyB)
 const other=await context.newPage();await other.goto(origin+'/notes/'+c);await until(()=>save(other).isEnabled(),'other tab local note enabled')
 await save(other).click();await other.getByText(/다른 탭에서 생성 작업을 반영/).waitFor();assert.equal(events.filter(e=>e.entityId===c&&e.method==='POST').length,1)
 const latest='생성 응답 대기 중 추가한 최신 합성 원고';await body(page).fill(latest)
 await until(async()=>(await records(page)).drafts.find(d=>d.noteId===c)?.content===latest,'during creation local commit')
 assert.equal((await records(page)).outbox.filter(o=>o.noteId===c).length,0)
 release();await until(async()=>{const s=await records(page);return s.localEntities.find(e=>e.id===c)?.confirmed&&!s.outbox.some(o=>o.noteId===c)&&s.drafts.find(d=>d.noteId===c)?.baseVersion===1},'create ACK followed by expected0 update ACK')
 assert.equal((await(await fetch(fixture.apiOrigin+'/api/notes/'+c)).json()).content,latest);assert.equal(events.find(e=>e.method==='PUT'&&e.entityId===c).expectedVersion,0)
 assert.equal(sql("select count(*) from creation_operations where entity_id in ('"+a+"','"+b+"','"+c+"')"),'3')
 await other.close();done('same-key-parent-replay-two-tabs-and-edit-during-create-ack',{serverVersion:1,contentHash:sha(latest)})
 await page.locator(`[data-node-key="folder:${b}"]`).click();const d=await createNote(page);assert.notEqual(d,c)
 await body(page).fill('ACK rollback 합성 원고');await until(async()=>(await records(page)).creationOutbox.find(o=>o.entityId===d)?.payload.content==='ACK rollback 합성 원고','D snapshot ready')
 held=false;holdId=d;await save(page).click();await until(()=>held,'D create committed')
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(...args){if(this.name==='creationOutbox')throw Error('Injected ACK failure');return original.apply(this,args)};window.restoreDelete=()=>{IDBObjectStore.prototype.delete=original}})
 release();await page.getByText(/로컬 저장소를 읽거나 저장하지 못했습니다/).first().waitFor()
 r=await records(page);assert.equal(r.localEntities.find(e=>e.id===d).confirmed,false);assert.equal(r.creationOutbox.find(o=>o.entityId===d).status,'inFlight')
 const keyD=events.find(e=>e.entityId===d).key;await page.evaluate(()=>window.restoreDelete());await page.getByRole('button',{name:'로컬 저장 다시 시도',exact:true}).click();await save(page).click()
 await until(async()=>(await records(page)).localEntities.find(e=>e.id===d)?.confirmed,'D replay ACK');assert.equal(events.filter(e=>e.entityId===d).at(-1).key,keyD);assert.equal(sql("select count(*) from creation_operations where entity_id='"+d+"'"),'1')
 done('creation-ack-rollback-and-exact-replay')
 const beforeFolderOnly=events.length,e=await createdFolder(page,'폴더 단독 저장',true);assert.equal(events.length,beforeFolderOnly)
 await page.getByRole('button',{name:'폴더 서버에 저장',exact:true}).click();await until(async()=>(await records(page)).localEntities.find(x=>x.id===e)?.confirmed,'folder-only ACK')
 assert.equal((await(await fetch(fixture.apiOrigin+'/api/folders/'+e)).json()).name,'폴더 단독 저장');done('explicit-folder-only-save-without-a-new-note')
 r=await records(page);assert.deepEqual(r.outbox.find(o=>o.operationId===oldOp.operationId),oldOp);assert.deepEqual(r.drafts.find(x=>x.noteId===legacy.noteId),legacy)
 const finalTree=await(await fetch(fixture.apiOrigin+'/api/workspace/tree')).json();assert.ok(finalTree.folders.some(f=>f.id===a));assert.ok(finalTree.folders.some(f=>f.id===b));assert.ok(finalTree.notes.some(n=>n.id===c));assert.ok(finalTree.notes.some(n=>n.id===d))
 done('server-get-confirms-new-tree-existing-draft-not-sent')
 const output={chrome:context.browser()?.version(),origin,work,cases,events,sql:{creationLedgerCount:Number(sql('select count(*) from creation_operations')),noteCVersion:Number(sql("select version from notes where id='"+c+"'"))},existingDraftPreserved:true}
 fs.writeFileSync(path.join(fixture.workDirectory,'browser-results.json'),JSON.stringify(output,null,2));fs.writeFileSync(path.join(root,'docs/verification/2026-10-26-offline-creation-results.json'),JSON.stringify(output,null,2)+'\n')
 await page.screenshot({path:path.join(root,'docs/verification/2026-10-26-offline-creation.png')});console.log('PASS: '+cases.length+' offline creation scenarios with actual Spring/PostgreSQL')
 }catch(error){
 fs.writeFileSync(path.join(work,'failure-events.json'),JSON.stringify(events,null,2))
 if(context){const pages=context.pages();for(let i=0;i<pages.length;i++){try{const alerts=await pages[i].getByRole('alert').allTextContents();const r=await records(pages[i]);fs.writeFileSync(path.join(work,'failure-state-'+i+'.json'),JSON.stringify({alerts,entities:r.localEntities?.map(e=>({id:e.id,confirmed:e.confirmed})),ops:r.creationOutbox?.map(o=>({operationId:o.operationId,entityId:o.entityId,type:o.type,status:o.status})),updates:r.outbox?.map(o=>({noteId:o.noteId,status:o.status}))},null,2))}catch{}}}
 throw error
 }finally{if(context)await context.close();if(server)await new Promise(resolve=>server.close(resolve))}}
main().catch(e=>{console.error(e);process.exitCode=1})
