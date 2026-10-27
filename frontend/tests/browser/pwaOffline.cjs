// Production SW + real HTTP fixture. Never connects to development DB or Spring API.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http')
const {execFileSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const root=path.resolve(__dirname,'../../..'),work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-note-pwa-'))
const ids=['00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000903']
const stamp='2026-10-26T00:00:00Z',folder={id:'00000000-0000-4000-8000-000000000900',parentId:null,name:'오프라인 실험',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp}
const notes=new Map(ids.map((id,i)=>[id,{id,folderId:folder.id,title:'서버 '+i,content:'합성 서버 본문 '+i,sortOrder:i,version:0,createdAt:stamp,updatedAt:stamp}]))
const sha=s=>createHash('sha256').update(s).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const title=p=>p.getByLabel('문서 제목'),body=p=>p.getByLabel('문서 내용'),button=p=>p.getByRole('button',{name:'모든 변경사항 동기화',exact:true})
async function until(fn,label){for(let i=0;i<600;i++){if(await fn())return;await pause(30)}throw Error('Timeout: '+label)}
function done(name,data={}){results.push({name,passed:true,...data});console.log('PASS: '+name)}
let buildDir,context,server,onlineGetsFail=false,puts=[],ledger=new Map(),origin
function build(label){
 const output=path.join(work,'build-'+label),config=path.join(work,'vite-'+label+'.mjs')
 const configText=`import config from ${JSON.stringify(path.join(root,'frontend/vite.config.ts'))};export default {...config,root:${JSON.stringify(path.join(root,'frontend'))},plugins:[...config.plugins,{name:'fixture-build',transformIndexHtml:html=>html.replace('</head>','<meta name="fixture-build" content="${label}"/></head>')}],build:{outDir:${JSON.stringify(output)},emptyOutDir:true}}`
 fs.writeFileSync(config,configText)
 fs.writeFileSync(path.join(work,'build-'+label+'.log'),execFileSync('pnpm',['exec','vite','build','--config',config],{cwd:path.join(root,'frontend'),encoding:'utf8',env:process.env}))
 return output
}
async function records(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-local');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})
 try{return await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox','workspace'],'readonly'),out={version:db.version};for(const name of ['drafts','outbox','workspace']){const r=tx.objectStore(name).getAll();r.onsuccess=()=>out[name]=r.result}tx.oncomplete=()=>ok(out);tx.onerror=()=>no(tx.error)})}finally{db.close()}
})}
async function localSaved(page,content){await until(async()=>{const r=await records(page);return r.drafts.some(d=>d.noteId===ids[0]&&d.content===content)},'local commit')}
async function launch(offline=false){
 context=await chromium.launchPersistentContext(path.join(work,'profile'),{channel:'chrome',headless:true,viewport:{width:1360,height:900}})
 await context.setOffline(offline);return context.pages()[0]||await context.newPage()
}
async function main(){
 try{
 const sourceNames=['frontend/vite.config.ts','frontend/src/main.tsx','frontend/src/app/AppLayout.tsx','frontend/src/features/folders/useFolders.ts','frontend/src/features/local-drafts/draftDatabase.ts','frontend/src/features/offline/workspaceCache.ts','frontend/src/features/pwa/PwaStatus.tsx']
 const sourceHashes=Object.fromEntries(sourceNames.map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]))
 buildDir=build('A');const buildB=build('B')
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),p=url.pathname;res.setHeader('Cache-Control','no-store')
  const json=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(value))}
  if(p.startsWith('/api/')){
   if(req.method==='GET'){
    if(onlineGetsFail)return json(503,{code:'UNAVAILABLE',message:'fixture failure',errors:[]})
    if(p==='/api/workspace/tree')return json(200,{folders:[folder],notes:[...notes.values()].map(({content,createdAt,...n})=>n)})
    const n=notes.get(p.split('/').at(-1));return json(n?200:404,n||{code:'NOTE_NOT_FOUND',message:'missing',errors:[]})
   }
   assert.equal(req.method,'PUT','Fixture accepts only explicit note PUT')
   let raw='';for await(const c of req)raw+=c
   const input=JSON.parse(raw),id=p.split('/').at(-1),key=req.headers['idempotency-key'];assert.ok([ids[0],ids[2]].includes(id),'only the two seeded pending notes may PUT');assert.ok(key)
   puts.push({operationId:key,expectedVersion:input.expectedVersion,contentHash:sha(input.content)})
   if(ledger.has(key))return json(200,ledger.get(key),{'Idempotency-Key':key})
   const n=notes.get(id);if(input.expectedVersion!==n.version)return json(409,{code:'VERSION_CONFLICT',message:'conflict',errors:[]})
   const result={...n,title:input.title,content:input.content,version:n.version+1};notes.set(id,result);ledger.set(key,result)
   return json(200,result,{'Idempotency-Key':key})
  }
  if(p==='/seed.html'){res.setHeader('Content-Type','text/html');return res.end('<html><body>Isolated IndexedDB migration fixture</body></html>')}
  const file=p==='/'||p.startsWith('/notes/')?path.join(buildDir,'index.html'):path.join(buildDir,p)
  if(!file.startsWith(buildDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('missing')}
  const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream')
  res.end(fs.readFileSync(file))
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 console.log('Isolated production origin: '+origin+'; artifacts: '+work)
 let page=await launch();await page.goto(origin+'/seed.html')
 const seed={noteId:ids[0],title:'v2 로컬 제목',content:'v2 로컬 합성 원고',baseTitle:'서버 0',baseContent:'합성 서버 본문 0',baseVersion:0,latestServerVersion:0,localRevision:7,localSavedAt:100,storageToken:randomUUID(),writerId:'legacy-fixture'}
 const op={operationId:randomUUID(),noteId:ids[0],type:'NOTE_UPDATE',title:seed.title,content:seed.content,expectedVersion:0,localRevision:7,status:'pending',attemptedAt:null,createdAt:100,updatedAt:100}
 await page.evaluate(async({seed,op,idC})=>{
  const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-local',20);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('drafts',{keyPath:'noteId'});const out=db.createObjectStore('outbox',{keyPath:'operationId'});out.createIndex('noteId','noteId');out.createIndex('status','status')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})
  await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox'],'readwrite');tx.objectStore('drafts').put(seed);tx.objectStore('drafts').put({...seed,noteId:'00000000-0000-4000-8000-000000000904',title:'목록 밖 로컬 원고',baseTitle:'목록 밖 로컬 원고',content:'로컬 목록 갱신 전 저장한 본문',baseContent:'로컬 목록 갱신 전 저장한 본문'});const c={...seed,noteId:idC,title:'C 복구 제목',content:'v2 로컬 C 본문',baseTitle:'서버 2',baseContent:'합성 서버 본문 2'};tx.objectStore('drafts').put(c);tx.objectStore('outbox').put(op);tx.objectStore('outbox').put({...op,operationId:crypto.randomUUID(),noteId:idC,title:c.title,content:c.content});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()
 },{seed,op,idC:ids[2]})
 await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await title(page).inputValue()===seed.title,'dirty v2 draft restored')
 await until(async()=>(await records(page)).workspace.length===1,'workspace committed')
 const migrated=await records(page);assert.equal(migrated.version,40);assert.deepEqual(migrated.drafts.find(d=>d.noteId===ids[0]),seed);assert.deepEqual(migrated.outbox.find(o=>o.operationId===op.operationId),op)
 assert.equal(await page.locator(`[data-node-key="note:${ids[2]}"]`).innerText(),'C 복구 제목')
 done('v2-through-v3-to-v4-preserves-drafts-outbox-and-sidebar-titles')
 await page.evaluate(()=>navigator.serviceWorker.ready);await until(()=>page.getByText(/오프라인 앱 파일 준비됨/).count(),'app precached')
 const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');const installability=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(installability.installabilityErrors,[])
 const manifest=await cdp.send('Page.getAppManifest');assert.ok(manifest.data.includes('standalone'))
 done('manifest-installability-and-production-precache',{installabilityErrors:installability.installabilityErrors})
 await context.close();context=null
 page=await launch(true);await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await body(page).inputValue()===seed.content,'offline cold launch')
 assert.equal(await page.locator(`[data-node-key="note:${ids[0]}"]`).innerText(),seed.title);assert.equal(await button(page).isDisabled(),true);assert.equal(puts.length,0)
 const directApi=await page.evaluate(()=>fetch('/api/workspace/tree').then(r=>r.headers.get('content-type')).catch(()=>'network-failed'));assert.equal(directApi,'network-failed')
 const apiPage=await context.newPage();await assert.rejects(()=>apiPage.goto(origin+'/api/workspace/tree'));await apiPage.close()
 done('offline-new-browser-process-direct-note-and-tree',{apiNavigationFallback:false})
 const outside=await context.newPage();await outside.goto(origin+'/notes/00000000-0000-4000-8000-000000000904');await until(async()=>await body(outside).inputValue()==='로컬 목록 갱신 전 저장한 본문','local draft outside old metadata');assert.equal(await body(outside).getAttribute('readonly'),null);await outside.close()
 done('stale-local-list-does-not-hide-an-existing-url-draft')
 const edited='인터넷 없이 작성한 합성 본문';await title(page).fill('오프라인 새 제목');await body(page).fill(edited);await localSaved(page,edited)
 const offlineRecord=await records(page);assert.equal(offlineRecord.outbox.find(o=>o.noteId===ids[0]).content,edited)
 await page.reload();await until(async()=>await body(page).inputValue()===edited,'offline reload')
 await page.locator(`[data-node-key="note:${ids[1]}"]`).click();await page.getByText(/이 원고의 본문은 이 브라우저에 저장되어 있지 않아/).waitFor();assert.equal(await body(page).getAttribute('readonly'),'')
 assert.equal((await records(page)).drafts.some(d=>d.noteId===ids[1]),false)
 await page.locator(`[data-node-key="note:${ids[0]}"]`).click();await until(async()=>await body(page).inputValue()===edited,'back to available offline draft')
 done('offline-edit-refresh-and-unvisited-note-unavailable',{contentHash:sha(edited)})
 await context.close();context=null;page=await launch(true);await page.goto(origin+'/');await until(async()=>await body(page).inputValue()===edited,'second offline cold start')
 done('second-offline-cold-launch-keeps-input')
 await context.setOffline(false);await until(()=>button(page).isEnabled(),'online queries recover and manual save enabled');await pause(300);assert.equal(puts.length,0)
 assert.ok((await records(page)).outbox.some(o=>o.noteId===ids[0]));await button(page).click()
 await until(async()=>{const r=await records(page);return !r.outbox.some(o=>[ids[0],ids[2]].includes(o.noteId))&&r.drafts.find(d=>d.noteId===ids[0]).baseVersion===1},'manual ack')
 assert.equal(puts.length,2);assert.equal(notes.get(ids[0]).content,edited);assert.equal(notes.get(ids[2]).content,'v2 로컬 C 본문');assert.equal(ledger.size,2)
 done('online-return-keeps-outbox-no-auto-put-then-manual-ack',{serverVersion:1,putCount:puts.length})
 onlineGetsFail=true;await page.reload();await until(async()=>await body(page).inputValue()===edited,'503 fallback');assert.equal((await records(page)).workspace[0].data.notes.length,3)
 assert.ok((await records(page)).drafts.find(d=>d.noteId===ids[0]).content===edited);onlineGetsFail=false
 done('server-503-preserves-workspace-and-manuscript')
 await title(page).fill('업데이트 중 메모리 제목');let last='업데이트 대기 중 작성한 합성 본문';await body(page).fill(last)
 buildDir=buildB;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()})
 await page.getByText(/새 앱 버전이 준비됐습니다/).waitFor()
 assert.equal(await page.locator('meta[name="fixture-build"]').getAttribute('content'),'A');assert.equal(await body(page).inputValue(),last)
 last += ' · 대기 중 최신 입력';await body(page).fill(last)
 assert.notEqual((await records(page)).drafts.find(d=>d.noteId===ids[0]).content,last,'input is still only in memory during waiting update')
 assert.equal(await body(page).inputValue(),last);assert.equal(await page.locator('meta[name="fixture-build"]').getAttribute('content'),'A')
 await localSaved(page,last);const beforeUpdate=await records(page),token=beforeUpdate.drafts.find(d=>d.noteId===ids[0]).storageToken
 assert.ok(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting))
 done('new-worker-waits-no-editor-reload',{contentHash:sha(last)})
 await context.close();context=null;page=await launch(true);await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await body(page).inputValue()===last,'updated offline launch')
 assert.equal(await page.locator('meta[name="fixture-build"]').getAttribute('content'),'B');assert.equal((await records(page)).drafts.find(d=>d.noteId===ids[0]).storageToken,token)
 assert.equal(puts.length,2)
 const cacheEntries=await page.evaluate(async()=>{const names=await caches.keys(),urls=[];for(const name of names)for(const req of await(await caches.open(name)).keys())urls.push(new URL(req.url).pathname);return urls})
 assert.ok(cacheEntries.length>0);assert.ok(cacheEntries.every(p=>!p.startsWith('/api/')))
 done('waiting-worker-activates-after-close-keeps-draft-outbox',{cacheEntries:cacheEntries.length,apiCacheEntries:0})
 const output={origin,sourceHashes,chrome:context.browser()?.version()||'persistent Chrome',results,puts,final:{contentHash:sha(last),workspaceNotes:(await records(page)).workspace[0].data.notes.length,outboxCount:(await records(page)).outbox.length},scope:'Synthetic HTTP API; no development DB or existing profile used. Installability verified, no OS install dialog automated.'}
 fs.mkdirSync(path.join(root,'docs/verification'),{recursive:true});fs.writeFileSync(process.env.SEAM_NOTE_PWA_REPORT||process.env.SEAM_NOTE_PWA_VERIFICATION_OUTPUT||path.join(root,'docs/verification/2026-10-26-pwa-results.json'),JSON.stringify(output,null,2)+'\n')
 await page.screenshot({path:process.env.SEAM_NOTE_PWA_SCREENSHOT||(process.env.SEAM_NOTE_PWA_SCREENSHOT_DIR?path.join(process.env.SEAM_NOTE_PWA_SCREENSHOT_DIR,'pwa-offline.png'):path.join(root,'docs/verification/2026-10-26-pwa-offline.png'))})
 console.log('PASS: '+results.length+' production PWA scenarios; profile/build artifacts retained at '+work)
 }finally{if(context)await context.close();if(server)await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1})
