// Product UI against synthetic mock APIs only. Works with both Vite dev and production preview.
const assert=require('node:assert/strict')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25175'
const ids=['00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802']
const missing='00000000-0000-4000-8000-000000000803'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
const button=p=>p.getByRole('button',{name:'서버에 저장',exact:true})
const title=p=>p.getByLabel('문서 제목')
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1360,height:900}}),page=await context.newPage()
  const folder={id:'folder',name:'폴더',parentId:null,version:0,sortOrder:0}
  const stamp='2026-10-26T00:00:00Z'
  const notes=new Map(ids.map((id,i)=>[id,{id,folderId:'folder',title:'원고 '+i,content:'본문',version:0,sortOrder:i,createdAt:stamp,updatedAt:stamp}]))
  const puts=[],ledger=new Map();let mode='success'
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const req=route.request(),path=new URL(req.url()).pathname
   if(req.method()==='GET'){
    if(path==='/api/workspace/tree')return route.fulfill({json:{folders:[folder],notes:[...notes.values()].map(({content,...s})=>s)}})
    const note=notes.get(path.split('/').at(-1));return route.fulfill({status:note?200:404,json:note||{code:'NOTE_NOT_FOUND',message:'없음',errors:[]}})
   }
   assert.equal(req.method(),'PUT');const id=path.split('/').at(-1);assert.ok(ids.includes(id))
   const body=req.postDataJSON(),key=req.headers()['idempotency-key'];puts.push({id,key,expectedVersion:body.expectedVersion})
   if(mode==='conflict')return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'버전 충돌',errors:[]}})
   if(mode==='missing'){notes.delete(id);return route.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'없음',errors:[]}})}
   const result=ledger.get(key)||{...notes.get(id),...body,version:body.expectedVersion+1};delete result.expectedVersion
   ledger.set(key,result);notes.set(id,result)
   if(mode==='lost'){mode='success';return route.abort('failed')}
   return route.fulfill({json:result,headers:{'Idempotency-Key':key}})
  })
  await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await title(page).inputValue()==='원고 0','A loaded')
  await until(()=>button(page).isDisabled(),'clean disabled')
  assert.equal(await page.locator('header').getByRole('button',{name:'서버에 저장'}).count(),1)
  assert.equal(await page.getByText('명시적으로 지정한 테스트 원고만',{exact:false}).count(),0)
  assert.equal(puts.length,0)
  // Click immediately after input: flushLatest must commit before sending.
  await title(page).fill('A 변경');await button(page).click()
  await page.getByText(/전송한 원고의 서버 저장과 로컬 확인이 완료/).waitFor()
  await until(()=>page.getByText(/남은 Outbox 작업 0개/).isVisible(),'A ack shown')
  await until(()=>button(page).isDisabled(),'A clean disabled');assert.equal(puts.length,1);assert.equal(notes.get(ids[0]).title,'A 변경')
  if(process.env.SEAM_NOTE_SCREENSHOT_DIR)await page.screenshot({path:process.env.SEAM_NOTE_SCREENSHOT_DIR+'/manual-save-desktop.png'})
  // Another UUID works without an environment gate, including on mobile.
  await page.locator(`[data-node-key="note:${ids[1]}"]`).click()
  await until(async()=>await title(page).inputValue()==='원고 1','B loaded')
  await page.setViewportSize({width:390,height:844})
  await until(async()=>{const box=await button(page).boundingBox();return box&&box.x>=0&&box.x+box.width<=390},'mobile save button fits viewport after responsive layout settles')
  if(process.env.SEAM_NOTE_SCREENSHOT_DIR)await page.screenshot({path:process.env.SEAM_NOTE_SCREENSHOT_DIR+'/manual-save-mobile.png'})
  await title(page).fill('B 변경');mode='lost';await button(page).click()
  await page.getByText(/서버 결과를 확정하지 못했습니다/).waitFor()
  await button(page).click();await page.getByText(/전송한 원고의 서버 저장과 로컬 확인이 완료/).waitFor();await until(()=>button(page).isDisabled(),'replayed and clean')
  assert.equal(puts.at(-1).key,puts.at(-2).key);assert.equal(notes.get(ids[1]).version,1)
  // No stale completed message when a new draft appears.
  await title(page).fill('충돌할 입력');mode='conflict';await button(page).click()
  await page.getByText(/VERSION_CONFLICT: 로컬 원고를 보존/).waitFor()
  await until(()=>button(page).isDisabled(),'conflict blocked');assert.equal(await title(page).inputValue(),'충돌할 입력')
  const count=puts.length;await pause(200);assert.equal(puts.length,count)
  await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await title(page).inputValue()==='A 변경','A returns')
  await title(page).fill('삭제 이후 보존할 입력');mode='missing';await button(page).click()
  await page.getByText(/서버에서 원고를 찾을 수 없습니다. 로컬 원고와 작업을 보존/).waitFor()
  assert.equal(await button(page).isDisabled(),true);assert.equal(await title(page).inputValue(),'삭제 이후 보존할 입력')
  await page.goto(origin+'/notes/'+missing);await until(()=>page.getByRole('alert').count(),'missing error');assert.equal(await button(page).isDisabled(),true)
  await page.goto(origin+'/notes/invalid');assert.equal(await button(page).isDisabled(),true)
  // A valid UUID whose recovery fails cannot PUT, even with server data available.
  const broken=await browser.newContext();await broken.route(url=>url.pathname.startsWith('/api/'),route=>{
   assert.equal(route.request().method(),'GET')
   const path=new URL(route.request().url()).pathname
   return route.fulfill({json:path==='/api/workspace/tree'?{folders:[folder],notes:[...notes.values()]}:notes.get(ids[1])})
  })
  await broken.addInitScript(()=>{IDBFactory.prototype.open=function(){throw new DOMException('blocked','SecurityError')}})
  const failed=await broken.newPage();await failed.goto(origin+'/notes/'+ids[1]);await failed.getByText(/로컬 저장소를 읽거나 저장하지 못했습니다/).first().waitFor()
  assert.equal(await button(failed).isDisabled(),true)
  await broken.close();await context.close()
  console.log('PASS: product header placement, arbitrary A/B UUID, clean disable, immediate input flush, mobile, lost response same-key retry, conflict/404/invalid/recovery block; mock APIs only')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
