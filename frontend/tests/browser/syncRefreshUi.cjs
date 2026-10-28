// Isolated production UI: no developer API access. Prove refresh on an empty Outbox.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25177'
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await pause(25)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({serviceWorkers:'block'}),p=await ctx.newPage(),id=randomUUID(),folderId=randomUUID(),stamp='2026-10-28T00:00:00Z'
 let remote={id,folderId,title:'initial synthetic title',content:'initial synthetic body',version:0,sortOrder:0,createdAt:stamp,updatedAt:stamp},detailGets=0,puts=0
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{if(r.request().method()==='PUT'){puts++;assert.equal(r.request().postDataJSON().expectedVersion,1);return r.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'synthetic dirty conflict',errors:[]}})}assert.equal(r.request().method(),'GET');const tree=new URL(r.request().url()).pathname==='/api/workspace/tree';if(!tree)detailGets++;return r.fulfill({json:tree?{folders:[{id:folderId,name:'synthetic folder',parentId:null,sortOrder:0,version:0}],notes:[remote]}:remote})})
 await p.goto(origin+'/notes/'+id);const title=p.getByLabel('문서 제목',{exact:true}),body=p.getByLabel('문서 내용',{exact:true})
 await until(async()=>await body.inputValue()===remote.content,'initial draft')
 await until(async()=>await p.evaluate(async()=>{const q=indexedDB.open('seam-note-local');const db=await new Promise(ok=>q.onsuccess=()=>ok(q.result));const tx=db.transaction(['drafts','outbox'],'readonly');const d=await new Promise(ok=>{const q=tx.objectStore('drafts').getAll();q.onsuccess=()=>ok(q.result)});db.close();return d.length>0}),'initial disk commit')
 const before=detailGets;remote={...remote,title:'new server title',content:'new server body',version:1}
 await until(()=>p.locator('[data-workspace-sync]').isEnabled(),'sync enabled');await p.locator('[data-workspace-sync]').click()
 await until(async()=>await p.locator('[data-workspace-sync]').innerText()==='모든 변경사항 동기화','sync done');await pause(700)
 const observed={detailGetsBefore:before,detailGetsAfter:detailGets,title:await title.inputValue(),content:await body.inputValue()}
 if(process.env.SEAM_NOTE_REFRESH_BEFORE){assert.equal(observed.title,'initial synthetic title');assert.equal(observed.content,'initial synthetic body');assert.equal(detailGets,before)}
 else{
  await until(async()=>await title.inputValue()==='new server title'&&await body.inputValue()==='new server body','refreshed draft')
  assert.ok(detailGets>before)
  assert.equal(await p.getByText('new server title',{exact:true}).count(),1,'sidebar updated')
  assert.equal(puts,0,'clean pull never writes the server')
  for(const text of ['마지막 실행:','확인이 필요한 항목','선택한 원고의 서버 저장을 확인했습니다.','원고는 이 브라우저에 로컬 저장되며'])assert.equal(await p.getByText(text,{exact:false}).count(),0)
 }
 if(!process.env.SEAM_NOTE_REFRESH_BEFORE){
  await title.fill('my dirty title');await body.fill('my dirty body');remote={...remote,title:'latest remote title',content:'latest remote body',version:2}
  await p.locator('[data-workspace-sync]').click();const dialog=p.getByRole('dialog');await dialog.waitFor();await until(()=>dialog.getByRole('button',{name:'현재 원고 선택',exact:true}).isEnabled(),'dirty comparison')
  assert.equal(await title.inputValue(),'my dirty title');assert.equal(await body.inputValue(),'my dirty body');assert.equal(puts,1)
  assert.ok((await dialog.getByLabel('현재 원고 제목 비교').innerText()).includes('my dirty title'));assert.ok((await dialog.getByLabel('서버 원고 제목 비교').innerText()).includes('latest remote title'))
 }
 const file=process.env.SEAM_NOTE_REFRESH_BEFORE?'2026-10-28-sync-refresh-before.json':'2026-10-28-sync-refresh-after.json'
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification',file),JSON.stringify({passed:true,mode:process.env.SEAM_NOTE_REFRESH_BEFORE?'before':'after',detailGetsBefore:before,detailGetsAfter:detailGets,editorUpdated:observed.content==='new server body',titleUpdated:observed.title==='new server title',dirtyPreserved:!process.env.SEAM_NOTE_REFRESH_BEFORE&&await body.inputValue()==='my dirty body',requests:'GET only for clean pull; mock 409 PUT for dirty regression',chrome:browser.version()},null,2)+'\n')
 console.log('PASS: '+file)
 await ctx.close()
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
