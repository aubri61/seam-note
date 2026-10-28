// Current product contract: one explicit Workspace sync control; no per-note save UI.
const assert=require('node:assert/strict'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25175',ids=['00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802']
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
const button=p=>p.locator('[data-workspace-sync]'),title=p=>p.getByLabel('문서 제목')
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:1360,height:900}}),page=await ctx.newPage(),folder={id:'folder',name:'폴더',parentId:null,version:0,sortOrder:0},stamp='2026-10-27T00:00:00Z'
 const notes=new Map(ids.map((id,i)=>[id,{id,folderId:'folder',title:'원고 '+i,content:'본문',version:0,sortOrder:i,createdAt:stamp,updatedAt:stamp}])),puts=[],ledger=new Map();let mode='success'
 await ctx.route(url=>url.pathname.startsWith('/api/'),async route=>{const req=route.request(),path=new URL(req.url()).pathname,id=path.split('/').at(-1)
  if(req.method()==='GET')return route.fulfill({status:path==='/api/workspace/tree'||notes.has(id)?200:404,json:path==='/api/workspace/tree'?{folders:[folder],notes:[...notes.values()]}:notes.get(id)||{code:'NOTE_NOT_FOUND',message:'없음',errors:[]}})
  assert.equal(req.method(),'PUT');const input=req.postDataJSON(),key=req.headers()['idempotency-key'];puts.push({id,key})
  if(mode==='conflict')return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'버전 충돌',errors:[]}})
  if(mode==='missing'){notes.delete(id);return route.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'없음',errors:[]}})}
  const result=ledger.get(key)||{...notes.get(id),title:input.title,content:input.content,version:input.expectedVersion+1};ledger.set(key,result);notes.set(id,result)
  if(mode==='lost'){mode='success';return route.abort('failed')}
  return route.fulfill({json:result,headers:{'Idempotency-Key':key}})
 })
 async function sync(){await until(()=>button(page).isEnabled(),'sync available');await until(async()=>{if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape');return false}try{await button(page).click({timeout:400});return true}catch(error){if(await page.getByRole('dialog').count())return false;throw error}},'dismiss unresolved dialog and sync');await until(async()=>await button(page).getAttribute('aria-busy')==='false','sync finished')}

 await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await title(page).inputValue()==='원고 0','A loaded')
 assert.equal(await page.getByRole('button',{name:'서버에 저장',exact:true}).count(),0);assert.equal(await page.locator('#server-save-feedback').count(),0);assert.equal(puts.length,0)
 await sync();assert.equal(puts.length,0,'empty explicit pass sends nothing')
 await title(page).fill('A 변경');await sync();assert.equal(notes.get(ids[0]).title,'A 변경');await page.getByText(/미동기화 작업 0개/).waitFor();assert.equal(puts.length,1)
 await page.locator(`[data-node-key="note:${ids[1]}"]`).click();await until(async()=>await title(page).inputValue()==='원고 1','B loaded');await page.setViewportSize({width:390,height:844})
 await until(async()=>{const box=await button(page).boundingBox();return box&&box.x>=0&&box.x+box.width<=390},'mobile sync fits')
 await title(page).fill('B 변경');mode='lost';await sync();assert.equal(puts.length,2);await sync();assert.equal(puts.at(-1).key,puts.at(-2).key);assert.equal(notes.get(ids[1]).version,1)
 await title(page).fill('충돌할 입력');mode='conflict';await sync();await page.getByRole('dialog').waitFor();assert.equal(await title(page).inputValue(),'충돌할 입력');const count=puts.length;await sync();assert.equal(puts.length,count,'known conflict is not resent')
 await page.goto(origin+'/notes/'+ids[0]);await until(async()=>await title(page).inputValue()==='A 변경','A returns');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await title(page).fill('삭제 이후 보존할 입력');mode='missing';await sync();await page.getByRole('dialog').waitFor();assert.equal(await title(page).inputValue(),'삭제 이후 보존할 입력');const missingCount=puts.length;await sync();assert.equal(puts.length,missingCount,'known404 is not resent')
 await page.goto(origin+'/notes/invalid');await page.getByRole('alert').first().waitFor();assert.equal(await page.getByRole('button',{name:'서버에 저장',exact:true}).count(),0);assert.equal(puts.length,missingCount)
 await ctx.close();console.log('PASS: only Workspace sync control, empty no-send, immediate input flush/ACK, mobile, response loss same-key retry, server409/404 preservation and no repeat sends; mock APIs only')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
