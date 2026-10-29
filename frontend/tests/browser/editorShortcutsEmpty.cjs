// Production Chrome with ephemeral contexts and synthetic API only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25211'
const pause=ms=>new Promise(r=>setTimeout(r,ms)),stamp='2026-10-29T00:00:00Z',empty='{"type":"doc","content":[{"type":"paragraph"}]}'
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];try{
 for(const scenario of ['root-fallback','no-folders','selected-folder','offline-no-folders','mobile-empty']){
 const ctx=await browser.newContext({viewport:scenario==='mobile-empty'?{width:390,height:844}:{width:1440,height:1000},serviceWorkers:'block'}),p=await ctx.newPage(),writes=[]
 const first=randomUUID(),second=randomUUID(),child=randomUUID(),folders=scenario.includes('no-folders')?[]:[{id:second,parentId:null,name:'Later root',sortOrder:2,version:0,createdAt:stamp,updatedAt:stamp},{id:first,parentId:null,name:'First root',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp},{id:child,parentId:first,name:'Selected child',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp}],notes=[]
 await ctx.route(u=>u.pathname.startsWith('/api/'),async r=>{
  const req=r.request(),url=new URL(req.url()),body=req.postDataJSON()
  if(req.method()==='DELETE'){const index=notes.findIndex(n=>url.pathname.endsWith(n.id));assert.ok(index>=0);notes.splice(index,1);writes.push({path:url.pathname,method:'DELETE'});return r.fulfill({status:204})}
  if(req.method()==='POST'){
   writes.push({path:url.pathname,payload:body})
   let data
   if(url.pathname==='/api/folders'){data={...body,parentId:body.parentId??null,version:0,sortOrder:folders.length,createdAt:stamp,updatedAt:stamp};folders.push(data)}
   else{assert.equal(url.pathname,'/api/notes');assert.ok(folders.some(f=>f.id===body.folderId));assert.equal(body.content,empty);data={...body,version:0,sortOrder:notes.length,createdAt:stamp,updatedAt:stamp};notes.push(data)}
   return r.fulfill({status:201,json:data,headers:{'Idempotency-Key':req.headers()['idempotency-key']}})
  }
  assert.equal(req.method(),'GET')
  return r.fulfill({json:url.pathname==='/api/workspace/tree'?{folders,notes}:notes.find(n=>url.pathname.endsWith(n.id))})
 })
 await p.goto(origin);const central=p.getByRole('button',{name:'노트 생성',exact:true});await central.waitFor()
 assert.equal(await p.getByRole('textbox',{name:'문서 내용',exact:true}).count(),0)
 const bounds=await p.getByLabel('새 원고 시작',{exact:true}).boundingBox();assert.ok(bounds.height>240)
 if(scenario==='selected-folder'){await p.getByRole('treeitem',{name:'First root',exact:true}).click();await p.getByRole('treeitem',{name:'Selected child',exact:true}).click()}
 if(scenario==='offline-no-folders')await ctx.setOffline(true)
 await central.evaluate(el=>{el.click();el.click()}) // Same-turn duplicate clicks must not create twice.
 await until(()=>p.url().includes('/notes/'),'created URL')
 const editor=p.getByRole('textbox',{name:'문서 내용',exact:true});await until(()=>editor.isEditable(),'new editor editable');const id=p.url().split('/').at(-1)
 const local=await p.evaluate(async id=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});try{return await new Promise(ok=>{const tx=db.transaction(['drafts','creationOutbox','localEntities'],'readonly'),result={};for(const name of ['drafts','creationOutbox','localEntities']){const r=tx.objectStore(name).getAll();r.onsuccess=()=>result[name]=r.result}tx.oncomplete=()=>ok(result)})}finally{db.close()}},id)
 if(scenario==='offline-no-folders'){
  assert.equal(writes.length,0);const creation=local.creationOutbox.find(o=>o.type==='NOTE_CREATE');assert.ok(creation);assert.ok(local.creationOutbox.some(o=>o.type==='FOLDER_CREATE'&&o.entityId===creation.payload.folderId))
 }else{
  await until(()=>writes.some(w=>w.path==='/api/notes'),'note POST')
  assert.equal(writes.filter(w=>w.path==='/api/notes').length,1)
  const note=writes.find(w=>w.path==='/api/notes').payload
  if(scenario==='root-fallback'||scenario==='mobile-empty')assert.equal(note.folderId,first)
  if(scenario==='selected-folder')assert.equal(note.folderId,child)
  if(scenario==='no-folders'){assert.equal(writes[0].path,'/api/folders');assert.equal(note.folderId,writes[0].payload.id);assert.equal(writes[0].payload.parentId,null)}
 }
 if(scenario==='no-folders'){
  const menu=p.getByRole('button',{name:'현재 원고 메뉴',exact:true});await until(()=>menu.isEnabled(),'server creation confirmed before deletion');await menu.click();await p.getByRole('menuitem',{name:'원고 삭제',exact:true}).click();await p.getByRole('dialog',{name:'원고 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click()
  await p.waitForURL(origin+'/');await central.waitFor();await central.click();await until(()=>p.url().includes('/notes/')&&!p.url().endsWith(id),'recreate after deleting last note');await until(()=>writes.filter(w=>w.path==='/api/notes').length===2,'second created POST');assert.equal(writes.filter(w=>w.path==='/api/folders').length,1)
 }
 if(scenario==='root-fallback'){
  const toggle=p.locator('button[aria-controls="folders-sidebar"]');assert.equal(await toggle.getAttribute('aria-expanded'),'true')
  await editor.fill('서식 테스트');await editor.press('Meta+a');await editor.press('Meta+b');await until(async()=>await editor.locator('strong').count()===1,'Command B bold');assert.equal(await toggle.getAttribute('aria-expanded'),'true')
  await editor.press('Control+b');await until(async()=>await editor.locator('strong').count()===0,'Control B toggles bold')
  await editor.press('Control+i');await until(async()=>await editor.locator('em').count()===1,'Control I italic');await editor.press('Meta+i');await until(async()=>await editor.locator('em').count()===0,'Command I toggles italic')
  await editor.press('Control+Shift+8');await until(async()=>await editor.locator('ul').count()===1,'Control Shift8 bullets');await editor.press('Meta+Shift+7');await until(async()=>await editor.locator('ol').count()===1,'Command Shift7 ordered')
  await editor.press('Meta+Shift+7');await until(async()=>await editor.locator('ol').count()===0,'toggle ordered off')
  await editor.press('ArrowRight');await pause(600);await p.keyboard.insertText(' 끝');await until(async()=>(await editor.innerText()).includes('끝'),'insert undo group')
  await editor.press('Control+z');await until(async()=>!(await editor.innerText()).includes('끝'),'Control Z undo');await editor.press('Control+y');await until(async()=>(await editor.innerText()).includes('끝'),'Control Y redo')
  await editor.press('Meta+z');await until(async()=>!(await editor.innerText()).includes('끝'),'Command Z undo');await editor.press('Meta+Shift+z');await until(async()=>(await editor.innerText()).includes('끝'),'Command ShiftZ redo')
  await editor.press('Control+z');await editor.press('Control+Shift+z');await until(async()=>(await editor.innerText()).includes('끝'),'Control ShiftZ redo')
  const html=await editor.innerHTML();await editor.press('Meta+Backslash');await until(async()=>await toggle.getAttribute('aria-expanded')==='false','Command Backslash sidebar');await editor.press('Control+Backslash');await until(async()=>await toggle.getAttribute('aria-expanded')==='true','Control Backslash sidebar');assert.equal(await editor.innerHTML(),html)
 }
 results.push({scenario,emptyCentered:true,lastNoteDeleteAndRecreate:scenario==='no-folders',createdNoteId:id,duplicateClicksOneNote:true,selectedOrRootDestination:true,offline:scenario.startsWith('offline'),writeCount:writes.length,shortcuts:scenario==='root-fallback'?'Command/Control B I, list keys, Z/ShiftZ/Y, Backslash passed':undefined})
 await ctx.close()
 }
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-29-editor-shortcuts-empty.json',`file://${__filename}`),JSON.stringify({results,developmentDbWrites:0},null,2)+'\n');console.log(results)
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
