// Synthetic records only: mock HTTP, separate Chromium context and real IndexedDB.
const assert=require('node:assert/strict'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25173',stamp='2026-10-27T00:00:00Z'
const root='00000000-0000-4000-8000-000000000a01',empty='00000000-0000-4000-8000-000000000a02',noteId='00000000-0000-4000-8000-000000000a03',changed='00000000-0000-4000-8000-000000000a04'
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await pause(20)}throw Error(label)}
const row=(p,id)=>p.locator(`[data-node-key="folder:${id}"]`),input=p=>p.getByLabel('새 폴더 이름',{exact:true})
async function records(p){return p.evaluate(async()=>{const {draftDatabase:db}=await import('/src/features/local-drafts/draftDatabase.ts');return {entities:await db.localEntities.toArray(),ops:await db.creationOutbox.toArray()}})}
async function menu(p,name,action){await p.getByRole('button',{name:name+' 폴더 메뉴',exact:true}).click();await p.getByRole('menuitem',{name:action,exact:true}).click()}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:1360,height:900}}),page=await ctx.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const folders=new Map([[root,'root'],[empty,'empty'],[changed,'changed']].map(([id,name])=>[id,{id,name,parentId:null,sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp}]))
 const note={id:noteId,folderId:root,title:'server note',content:'server body',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp}
 let deletes=0,fail=true,release
 await ctx.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()==='GET')return route.fulfill({json:path==='/api/workspace/tree'?{folders:[...folders.values()],notes:[note]}:note})
  assert.equal(req.method(),'DELETE','Creation stays local; no automatic POST/PATCH')
  const id=path.split('/').at(-1);assert.ok([empty,changed].includes(id),'no nonempty/local-folder DELETE')
  deletes++
  if(id===changed)return route.fulfill({status:409,json:{code:'FOLDER_NOT_EMPTY',message:'다른 탭에서 원고가 추가됐습니다.',errors:[]}})
  if(fail){await pause(200);return route.fulfill({status:500,json:{code:'TEST_FAILURE',message:'mock delete failed',errors:[]}})}
  await new Promise(resolve=>{release=resolve});folders.delete(id);return route.fulfill({status:204})
 })
 await page.goto(origin+'/notes/'+noteId);await until(async()=>await page.getByLabel('문서 제목').inputValue()==='server note','initial note')
 // Menu click/keyboard never toggles the folder or changes the note URL.
 const initial=await row(page,root).getAttribute('aria-expanded'),url=page.url()
 await row(page,root).focus();await page.keyboard.press('Shift+F10');await page.getByRole('menuitem',{name:'폴더 추가',exact:true}).waitFor()
 await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('menuitem',{name:'문서 추가',exact:true}).evaluate(el=>el===document.activeElement),true)
 await page.keyboard.press('Escape');assert.equal(await row(page,root).getAttribute('aria-expanded'),initial);assert.equal(page.url(),url)
 await menu(page,'root','폴더 삭제');assert.equal(await page.getByRole('button',{name:'영구 삭제',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(deletes,0)
 await menu(page,'empty','폴더 삭제');await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(deletes,0)
 await menu(page,'empty','폴더 삭제');const confirm=page.getByRole('button',{name:'영구 삭제',exact:true});await confirm.click();await until(async()=>await confirm.isDisabled() || await page.getByRole('dialog').getByRole('alert').count()>0,'delete starts');assert.equal(await confirm.isDisabled(),true,await page.getByRole('dialog').innerText())
 await page.getByText(/mock delete failed/).waitFor();assert.equal(deletes,1);await row(page,empty).waitFor({state:'attached'});assert.equal(page.url(),url)
 await page.getByRole('button',{name:'취소',exact:true}).click()
 // Server 409 remains visible even if the initial workspace snapshot was empty.
 await menu(page,'changed','폴더 삭제');await confirm.click();await page.getByText(/다른 탭에서 원고가 추가/).waitFor();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(deletes,2)
 // A stale second tab cannot create a child after deletion: it waits for the same lock, then parent validation rejects.
 const other=await ctx.newPage();await other.goto(url);await until(async()=>await other.getByLabel('문서 제목').inputValue()==='server note','other ready')
 fail=false;await menu(page,'empty','폴더 삭제');await confirm.click();await until(()=>!!release,'DELETE started')
 const queued=other.evaluate(async id=>{const {creationStorage}=await import('/src/features/outbox/creationStorage.ts');try{await creationStorage.createFolder({id:crypto.randomUUID(),parentId:id,name:'must not orphan'});return 'created'}catch(e){return e.message}},empty)
 await pause(80);assert.equal(await confirm.isDisabled(),true);release();assert.match(await queued,/부모 폴더/)
 await row(page,empty).waitFor({state:'detached'});assert.equal(page.url(),url);assert.equal(deletes,3)
 assert.equal((await other.evaluate(async()=>{const {draftDatabase:db}=await import('/src/features/local-drafts/draftDatabase.ts');return db.workspace.get('current')})).data.folders.some(f=>f.id===empty),false)
 // Explicit menu target wins over current note/selection.
 await menu(page,'changed','폴더 추가');await input(page).fill('local child');await input(page).press('Enter');await until(async()=>(await records(page)).entities.some(e=>e.folder?.name==='local child'),'local child')
 let r=await records(page),local=r.entities.find(e=>e.folder?.name==='local child');assert.equal(local.folder.parentId,changed)
 await menu(page,'local child','폴더 삭제');await confirm.click();await until(async()=>!(await records(page)).entities.some(e=>e.id===local.id),'local cancel');assert.equal((await records(page)).ops.some(o=>o.entityId===local.id),false);assert.equal(deletes,3)
 await menu(page,'changed','폴더 추가');await input(page).fill('uncertain');await input(page).press('Enter');await until(async()=>(await records(page)).entities.some(e=>e.folder?.name==='uncertain'),'uncertain folder')
 const uncertain=(await records(page)).entities.find(e=>e.folder?.name==='uncertain')
 await page.evaluate(async id=>{const {draftRepository}=await import('/src/features/local-drafts/draftDatabase.ts');await draftRepository.claimCreation(id)},uncertain.id)
 await menu(page,'uncertain','폴더 삭제');await confirm.click();await page.getByText(/서버 생성 결과가 불확실/).waitFor();assert.ok((await records(page)).entities.some(e=>e.id===uncertain.id));assert.equal((await records(page)).ops.find(o=>o.entityId===uncertain.id).status,'inFlight');await page.getByRole('button',{name:'취소',exact:true}).click()
 // The folder-menu note action uses that folder rather than the editor's current parent.
 await menu(page,'changed','문서 추가');await until(()=>page.url()!==url,'new note URL');r=await records(page);const created=r.entities.find(e=>e.note);assert.equal(created.note.folderId,changed)
 await page.getByLabel('문서 제목').fill('local menu note');await pause(400)
 await menu(page,'changed','폴더 삭제');assert.equal(await confirm.isDisabled(),true);await page.getByRole('button',{name:'취소',exact:true}).click()
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()
 await ctx.setOffline(true);await menu(page,'root','폴더 추가');await input(page).fill('mobile local');await input(page).press('Enter');await until(async()=>(await records(page)).entities.some(e=>e.folder?.name==='mobile local'),'mobile local folder')
 const mobile=(await records(page)).entities.find(e=>e.folder?.name==='mobile local')
 // Inject failure after Outbox removal to prove both records roll back together.
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(...args){if(this.name==='localEntities')throw Error('mock deletion rollback');return original.apply(this,args)};window.restoreDelete=()=>{IDBObjectStore.prototype.delete=original}})
 await menu(page,'mobile local','폴더 삭제');await confirm.click();await page.getByText(/mock deletion rollback/).waitFor();r=await records(page);assert.ok(r.entities.some(e=>e.id===mobile.id));assert.ok(r.ops.some(o=>o.entityId===mobile.id))
 await page.evaluate(()=>window.restoreDelete());await confirm.click();await until(async()=>!(await records(page)).entities.some(e=>e.id===mobile.id),'mobile delete retry');assert.equal((await records(page)).ops.some(o=>o.entityId===mobile.id),false)
 await ctx.setOffline(false);await page.reload();await until(async()=>await page.getByLabel('문서 제목').inputValue()==='local menu note','body remains after reload');assert.equal((await records(page)).entities.some(e=>e.id===mobile.id),false);assert.equal(deletes,3)
 assert.deepEqual(errors,[])
 console.log('PASS: folder menu pointer/Shift-F10/arrows/Escape, explicit parent folder/note creation, confirm/cancel/nonempty, DELETE failure/409/success/duplicate block, two-tab stale-child lock, local cancellation/uncertain preservation, atomic rollback/retry, offline mobile/reload/Draft preservation; mock HTTP only')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
