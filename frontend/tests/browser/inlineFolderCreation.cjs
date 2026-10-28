// UI/real IndexedDB only. All HTTP requests are intercepted; never write to a development DB.
const assert=require('node:assert/strict')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25173'
const root='00000000-0000-4000-8000-000000000901',noteId='00000000-0000-4000-8000-000000000902',stamp='2026-10-27T00:00:00Z'
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<300;i++){if(await fn())return;await wait(20)}throw Error(label)}
const input=p=>p.getByLabel('새 폴더 이름',{exact:true})
async function records(page){return page.evaluate(async()=>{const {draftDatabase:db}=await import('/src/features/local-drafts/draftDatabase.ts');return {entities:await db.localEntities.toArray(),ops:await db.creationOutbox.toArray()}})}
async function start(page,top=false){await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByRole('button',{name:top?'새 최상위 폴더':'새 폴더',exact:true}).click();await input(page).waitFor();assert.equal(await page.getByRole('dialog',{name:'새 폴더',exact:true}).count(),0,'no creation modal');assert.equal(await input(page).evaluate(el=>document.activeElement===el),true)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1360,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await context.route(url=>url.pathname.startsWith('/api/'),route=>{assert.equal(route.request().method(),'GET','no automatic POST/rename');const f={id:root,parentId:null,name:'root',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp},n={id:noteId,folderId:root,title:'server',content:'body',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp};return route.fulfill({json:new URL(route.request().url()).pathname==='/api/workspace/tree'?{folders:[f],notes:[n]}:n})})
 await page.goto(origin+'/notes/'+noteId);await until(async()=>await page.getByLabel('문서 제목').inputValue()==='server','ready')
 await start(page);assert.equal((await records(page)).entities.length,0,'preview is not persisted')
 await input(page).press('Escape');assert.equal(await input(page).count(),0);assert.equal((await records(page)).ops.length,0)
 await start(page);await input(page).fill('   ');await input(page).press('Enter');await page.getByRole('tree').getByRole('alert').waitFor();assert.equal((await records(page)).entities.length,0)
 await input(page).fill('child folder');await input(page).press('Enter')
 await until(async()=>(await records(page)).entities.length===1,'Enter commit');let r=await records(page);assert.equal(r.entities[0].folder.name,'child folder');assert.equal(r.entities[0].folder.parentId,root);assert.equal(r.ops.length,1);assert.equal(r.ops[0].payload.name,'child folder');assert.equal(await input(page).count(),0)
 const child=r.entities[0].id;assert.equal(await page.locator(`[data-node-key="folder:${child}"]`).getAttribute('aria-selected'),'true')
 await start(page);await input(page).press('Enter');await until(async()=>(await records(page)).entities.length===2,'default name Enter');r=await records(page);assert.equal(r.entities.find(e=>e.id!==child).folder.name,'새 폴더');assert.equal(r.entities.find(e=>e.id!==child).folder.parentId,child)
 await start(page,true);await input(page).fill('top folder');await page.getByLabel('노트 검색').click();await until(async()=>(await records(page)).entities.length===3,'blur commit');assert.equal((await records(page)).entities.find(e=>e.folder.name==='top folder').folder.parentId,null)
 // Failed local write retains the input and same UUID; retry must produce one operation.
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='creationOutbox')throw Error('mock local creation failure');return original.apply(this,args)};window.restoreCreate=()=>{IDBObjectStore.prototype.add=original}})
 await start(page,true);await input(page).fill('retry folder');const preview=await input(page).evaluate(el=>el.closest('[data-node-key]').dataset.nodeKey)
 await input(page).press('Enter');await page.getByRole('tree').getByRole('alert').waitFor();assert.equal(await input(page).inputValue(),'retry folder');assert.equal((await records(page)).entities.length,3)
 await page.evaluate(()=>window.restoreCreate())
 await input(page).press('Enter');await until(async()=>(await records(page)).entities.length===4,'retry commit');assert.equal((await records(page)).entities.find(e=>e.folder.name==='retry folder').id,preview.slice(7))
 await page.reload();await until(async()=>await page.getByLabel('문서 제목').inputValue()==='server','reload');assert.equal((await records(page)).entities.length,4)
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()
 await context.setOffline(true);await start(page,true);await input(page).fill('mobile offline');await input(page).press('Enter');await until(async()=>(await records(page)).entities.length===5,'mobile offline local commit');assert.equal(await page.getByRole('dialog').count(),1,'only existing mobile Drawer dialog remains')
 assert.deepEqual(errors,[]);console.log('PASS: inline autofocus/no modal, preview-only Escape, blank validation, Enter/unchanged default, parent/root placement, blur, failure/same-ID retry, reload, offline mobile; no server writes')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
