// Synthetic HTTP mocks and native IndexedDB: choice -> PUT -> ACK; never reaches developer API.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomUUID,createHash}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25175',results=[],work=fs.mkdtempSync(path.join(os.tmpdir(),'seam-diff-performance-'))
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<1200;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const config of [{lines:30,mode:'single',choice:'현재 원고 선택'},{lines:30,mode:'title-only',choice:'현재 원고 선택'},{lines:30,mode:'single',choice:'서버 원고 선택'},{lines:30,mode:'single',choice:'close',mobile:true},{lines:30,mode:'single',choice:'현재 원고 선택',failure:'network'},{lines:30,mode:'single',choice:'현재 원고 선택',failure:'version'}]){
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),p=await ctx.newPage(),id=randomUUID(),folderId=randomUUID(),stamp='2026-10-27T00:00:00Z'
  const lines=Array.from({length:config.lines},(_,i)=>`synthetic line ${i} · 안전한 원고 비교 성능 측정`),other=[...lines]
  if(config.mode==='all')for(let i=0;i<other.length;i++)other[i]='changed '+other[i]
  else if(config.mode!=='title-only')other[Math.floor(other.length/2)]+=' changed'
  if(config.mode==='long'){lines[0]='가나다라마바사 '.repeat(25000);other[0]=lines[0]+' changed'}
  const left=lines.join('\n'),right=other.join('\n'),remote={id,folderId,title:'remote synthetic',content:right,version:1,sortOrder:0,createdAt:stamp,updatedAt:stamp}
  await ctx.route('**/__perf_seed__',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}))
  const puts=[]
  await ctx.route(u=>u.pathname.startsWith('/api/'),async r=>{
    if(r.request().method()==='PUT'){
      const request=r.request().postDataJSON(),key=r.request().headers()['idempotency-key'];puts.push({request,key})
      assert.equal(new URL(r.request().url()).pathname,'/api/notes/'+id)
      if(config.failure==='network'&&puts.length===1)return r.abort('failed')
      if(config.failure==='version'&&puts.length===1){remote.title='newer server title';remote.version=2;return r.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'synthetic conflict',errors:[]}})}
      assert.equal(request.expectedVersion,remote.version);assert.ok(key)
      Object.assign(remote,{title:request.title,content:request.content,version:remote.version+1})
      return r.fulfill({json:remote,headers:{'Idempotency-Key':key}})
    }
    assert.equal(r.request().method(),'GET')
    return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:folderId,name:'performance',parentId:null,sortOrder:0,version:0}],notes:[remote]}:remote})
  })
  await ctx.addInitScript(()=>{const Native=window.Worker;window.diffMetrics=[];window.Worker=class extends Native{postMessage(value,...args){const started=performance.now();this.addEventListener('message',e=>{window.diffMetrics.push({workerMs:e.data.duration,workerWallMs:performance.now()-started,rows:e.data.rows.length,coarse:e.data.coarse})},{once:true});return super.postMessage(value,...args)}}})
  await p.goto(origin+'/__perf_seed__');await p.evaluate(async({id,left})=>{
    const db=await new Promise((ok,no)=>{const request=indexedDB.open('seam-note-local',40);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('drafts',{keyPath:'noteId'});const out=db.createObjectStore('outbox',{keyPath:'operationId'});out.createIndex('noteId','noteId');out.createIndex('status','status');db.createObjectStore('workspace',{keyPath:'key'});const entities=db.createObjectStore('localEntities',{keyPath:'id'});entities.createIndex('kind','kind');const creates=db.createObjectStore('creationOutbox',{keyPath:'operationId'});creates.createIndex('entityId','entityId');creates.createIndex('status','status')};request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)})
    const d={noteId:id,title:'mine synthetic',content:left,baseTitle:'base',baseContent:'base',baseVersion:0,latestServerVersion:0,localRevision:7,localSavedAt:100,storageToken:crypto.randomUUID(),writerId:'perf'}
    const now=Date.now(),op={operationId:crypto.randomUUID(),noteId:id,type:'NOTE_UPDATE',title:d.title,content:d.content,expectedVersion:0,localRevision:7,status:'conflict',attemptedAt:now,createdAt:now,updatedAt:now,failureCode:'VERSION_CONFLICT'}
    await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox'],'readwrite');tx.objectStore('drafts').put(d);tx.objectStore('outbox').put(op);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()
  },{id,left})
  await p.goto(origin+'/notes/'+id);await until(async()=>await p.getByLabel('문서 내용',{exact:true}).inputValue()===left,'draft ready')
  const start=Date.now();const dialog=p.getByRole('dialog');await until(()=>dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).isEnabled(),'automatic dialog ready')
  const metrics=await p.evaluate(()=>window.diffMetrics.at(-1)),domRows=await dialog.locator('[data-diff-row]').count();assert.ok(domRows<=180)
  assert.deepEqual(await dialog.getByRole('button').allTextContents(),['현재 원고 선택','서버 원고 선택'])
  for(const label of ['현재 원고 선택','서버 원고 선택']){
    const panel=dialog.getByRole('button',{name:label,exact:true}).locator('xpath=ancestor::section')
    assert.equal(await panel.count(),1)
  }
  const style=await p.locator('[data-workspace-sync]').evaluate(n=>{const s=getComputedStyle(n);return [s.borderRadius,s.backgroundColor,s.padding]})
  assert.deepEqual(await dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).evaluate(n=>{const s=getComputedStyle(n);return [s.borderRadius,s.backgroundColor,s.padding]}),style)
  assert.equal(await p.getByRole('button',{name:'원고 버전 비교',exact:true}).count(),0)
  assert.equal(await p.getByLabel('충돌 원고 목록').count(),0)
  assert.ok((await dialog.getByLabel('현재 원고 제목 비교').innerText()).includes('mine synthetic'))
  assert.ok((await dialog.getByLabel('서버 원고 제목 비교').innerText()).includes('remote synthetic'))
  assert.equal(await dialog.getByLabel('현재 원고 제목 비교').locator('mark').count(),1)
  if(config.mobile){await p.setViewportSize({width:390,height:844});const panels=dialog.locator('section');const a=await panels.nth(0).boundingBox(),b=await panels.nth(1).boundingBox();assert.ok(b.y>a.y+a.height-1)}
  if(config.choice==='close'){
    await p.keyboard.press('Escape');await until(async()=>await dialog.count()===0,'closed');await pause(250);assert.equal(await dialog.count(),0)
  }else{
    await dialog.getByRole('button',{name:config.choice,exact:true}).click()
    if(config.failure==='network'){
      await dialog.getByRole('alert').waitFor();assert.equal(await dialog.count(),1)
      await dialog.getByRole('button',{name:'현재 원고 서버 저장 재시도',exact:true}).click()
    }
    if(config.failure==='version'){
      await dialog.getByLabel('서버 원고 제목 비교').getByText('newer server title',{exact:true}).waitFor()
      await until(()=>dialog.getByRole('button',{name:config.choice,exact:true}).isEnabled(),'updated choice ready')
      await dialog.getByRole('button',{name:config.choice,exact:true}).click()
    }
    await until(async()=>await dialog.count()===0,'selected')}
  const stored=await p.evaluate(async id=>{const db=await new Promise(ok=>{const q=indexedDB.open('seam-note-local');q.onsuccess=()=>ok(q.result)});const tx=db.transaction(['drafts','outbox'],'readonly');const read=q=>new Promise(ok=>{q.onsuccess=()=>ok(q.result)});const draft=await read(tx.objectStore('drafts').get(id)),ops=await read(tx.objectStore('outbox').getAll());db.close();return {draft,ops}},id)
  if(config.choice==='close'){assert.equal(stored.draft.content,left);assert.equal(stored.ops[0].status,'conflict')}
  else{assert.equal(stored.draft.content,config.choice==='현재 원고 선택'?left:right);assert.equal(stored.draft.conflictHistory.length,config.failure==='version'?2:1);assert.equal(stored.ops.length,0);assert.equal(stored.draft.title,remote.title);assert.equal(stored.draft.baseVersion,remote.version);assert.equal(await p.getByLabel('문서 제목',{exact:true}).inputValue(),remote.title)}
  if(config.failure==='network'){assert.equal(puts.length,2);assert.equal(puts[0].key,puts[1].key);assert.deepEqual(puts[0].request,puts[1].request)}
  if(config.failure==='version'){assert.equal(puts.length,2);assert.notEqual(puts[0].key,puts[1].key);assert.equal(puts[1].request.expectedVersion,2)}
  if(config.choice==='서버 원고 선택')assert.equal(puts.length,0,'selected server snapshot already exists; no redundant PUT')
  results.push({mode:config.mode,puts:puts.length,failure:config.failure??null,choice:config.choice,mobile:!!config.mobile,passed:true,domRows})
  console.log('PASS: '+JSON.stringify(results.at(-1)))
  await ctx.close()
 }
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-28-conflict-choice-save-ui.json'),JSON.stringify({results,chrome:browser.version(),note:'Mock GET/PUT, isolated native IndexedDB; no developer backend writes.'},null,2)+'\n')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
