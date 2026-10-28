// Synthetic mock manuscripts; measure actual product Worker + virtualized DOM, no server writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomUUID,createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25175',results=[],work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-diff-performance-'))
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<1200;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const config of [{lines:1000,mode:'single'},{lines:10000,mode:'single'},{lines:50000,mode:'single'},{lines:10000,mode:'all'},{lines:1,mode:'long'}]){
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),p=await ctx.newPage(),id=randomUUID(),folderId=randomUUID(),stamp='2026-10-27T00:00:00Z'
  const lines=Array.from({length:config.lines},(_,i)=>`synthetic line ${i} · 안전한 원고 비교 성능 측정`),other=[...lines]
  if(config.mode==='all')for(let i=0;i<other.length;i++)other[i]='changed '+other[i]
  else other[Math.floor(other.length/2)]+=' changed'
  if(config.mode==='long'){lines[0]='가나다라마바사 '.repeat(25000);other[0]=lines[0]+' changed'}
  const left=lines.join('\n'),right=other.join('\n'),remote={id,folderId,title:'remote synthetic',content:right,version:1,sortOrder:0,createdAt:stamp,updatedAt:stamp}
  await ctx.route('**/__perf_seed__',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}))
  await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{assert.equal(r.request().method(),'GET','performance tests never write');return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:folderId,name:'performance',parentId:null,sortOrder:0,version:0}],notes:[remote]}:remote})})
  await ctx.addInitScript(()=>{const Native=window.Worker;window.diffMetrics=[];window.Worker=class extends Native{postMessage(value,...args){const started=performance.now();this.addEventListener('message',e=>{window.diffMetrics.push({workerMs:e.data.duration,workerWallMs:performance.now()-started,rows:e.data.rows.length,coarse:e.data.coarse})},{once:true});return super.postMessage(value,...args)}}})
  await p.goto(origin+'/__perf_seed__');await p.evaluate(async({id,left})=>{
    const db=await new Promise((ok,no)=>{const request=indexedDB.open('seam-note-local',40);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('drafts',{keyPath:'noteId'});const out=db.createObjectStore('outbox',{keyPath:'operationId'});out.createIndex('noteId','noteId');out.createIndex('status','status');db.createObjectStore('workspace',{keyPath:'key'});const entities=db.createObjectStore('localEntities',{keyPath:'id'});entities.createIndex('kind','kind');const creates=db.createObjectStore('creationOutbox',{keyPath:'operationId'});creates.createIndex('entityId','entityId');creates.createIndex('status','status')};request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)})
    const d={noteId:id,title:'mine synthetic',content:left,baseTitle:'base',baseContent:'base',baseVersion:0,latestServerVersion:0,localRevision:7,localSavedAt:100,storageToken:crypto.randomUUID(),writerId:'perf'}
    const now=Date.now(),op={operationId:crypto.randomUUID(),noteId:id,type:'NOTE_UPDATE',title:d.title,content:d.content,expectedVersion:0,localRevision:7,status:'conflict',attemptedAt:now,createdAt:now,updatedAt:now,failureCode:'VERSION_CONFLICT'}
    await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox'],'readwrite');tx.objectStore('drafts').put(d);tx.objectStore('outbox').put(op);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()
  },{id,left})
  await p.goto(origin+'/notes/'+id);await until(async()=>await p.getByLabel('문서 내용',{exact:true}).inputValue()===left,'draft ready')
  const start=Date.now();const dialog=p.getByRole('dialog');await until(()=>dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).isEnabled(),'diff ready')
  const metrics=await p.evaluate(()=>window.diffMetrics.at(-1)),domRows=await dialog.locator('[data-diff-row]').count();assert.ok(domRows<=180)
  await dialog.locator('[aria-label$="본문 비교"]').first().evaluate(n=>{n.scrollTop=1200;n.dispatchEvent(new Event('scroll',{bubbles:true}))});await pause(50)
  const scrolls=await dialog.locator('[aria-label$="본문 비교"]').evaluateAll(nodes=>nodes.map(n=>({top:n.scrollTop,height:n.scrollHeight})));assert.equal(scrolls[0].top,scrolls[1].top)
  results.push({...config,characters:left.length,utf8Bytes:Buffer.byteLength(left),modalReadyMs:Date.now()-start,...metrics,domRows,contentHash:createHash('sha256').update(left).digest('hex')})
  if(config.mode==='all'){await p.screenshot({path:path.join(work,'diff-desktop.png')});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(work,'diff-mobile.png')})}
  await ctx.close();console.log('PASS: '+JSON.stringify(results.at(-1)))
 }
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-28-conflict-simple-performance.json'),JSON.stringify({sourceHashes:Object.fromEntries(['lineDiff.ts','diffWorker.ts','DiffView.tsx','ConflictDialog.tsx'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../../src/features/conflicts',name))).digest('hex')])),environment:{build:process.env.SEAM_NOTE_PRODUCTION?'production-preview':'vite-development',chrome:browser.version(),origin,viewport:'1440x1000; mobile390x844',cases:'1 sample per size; cold modal/Worker load; not a production latency SLA'},results,artifacts:work,method:'Worker duration uses performance.now inside worker; wall includes worker startup/serialization; modal includes IDB/API mock/lazy module/DOM and synchronized scroll; actual virtual DOM row count<=180'},null,2)+'\n')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
