// Isolated Chrome/IndexedDB and mocked HTTP; never access development data.
const assert=require('node:assert/strict'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25173',f='00000000-0000-4000-8000-000000000b01',a='00000000-0000-4000-8000-000000000b02',stamp='2026-10-27T00:00:00Z'
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await pause(20)}throw Error(label)}
const naming=p=>p.getByLabel('폴더 이름',{exact:true}),newName=p=>p.getByLabel('새 폴더 이름',{exact:true}),title=p=>p.getByLabel('문서 제목')
async function records(p){return p.evaluate(async()=>{const {draftDatabase:db}=await import('/src/features/local-drafts/draftDatabase.ts');return {entities:await db.localEntities.toArray(),ops:await db.creationOutbox.toArray(),workspace:await db.workspace.get('current'),drafts:await db.drafts.toArray()}})}
async function menu(p,name,action){await p.getByRole('button',{name:name+' 폴더 메뉴',exact:true}).click();await p.getByRole('menuitem',{name:action,exact:true}).click()}
async function borders(locator){const style=await locator.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,outline:s.outlineStyle,shadow:s.boxShadow}});assert.deepEqual(style,{border:'0px',outline:'none',shadow:'none'})}
async function focusedTitle(p){await until(()=>title(p).evaluate(el=>!el.readOnly&&document.activeElement===el),'new title keyboard focus')}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:1360,height:900}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message))
 let folder={id:f,parentId:null,name:'server folder',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp},patches=0,fail=false
 const note={id:a,folderId:f,title:'server note',content:'server content',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp}
 await ctx.route(url=>url.pathname.startsWith('/api/'),async route=>{const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()==='GET'){assert.ok(path==='/api/workspace/tree'||path==='/api/notes/'+a,'local notes must not GET server');return route.fulfill({json:path==='/api/workspace/tree'?{folders:[folder],notes:[note]}:note})}
  assert.equal(req.method(),'PATCH','no automatic POST/PUT/DELETE');assert.equal(path,'/api/folders/'+f);patches++
  if(fail)return route.fulfill({status:500,json:{code:'TEST_RENAME_FAILED',message:'mock rename failure',errors:[]}})
  folder={...folder,name:req.postDataJSON().name,version:folder.version+1};return route.fulfill({json:folder})
 })
 await p.goto(origin+'/notes/'+a);await until(async()=>await title(p).inputValue()==='server note','ready')
 await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByRole('button',{name:'새 최상위 폴더',exact:true}).click();await newName(p).waitFor();await borders(newName(p));await newName(p).fill('local original');await newName(p).press('Enter')
 await until(async()=>(await records(p)).entities.some(e=>e.folder?.name==='local original'),'local creation');let r=await records(p),local=r.entities.find(e=>e.folder?.name==='local original'),old=r.ops.find(o=>o.entityId===local.id)
 await menu(p,'local original','이름 변경');assert.equal(await naming(p).inputValue(),'local original');assert.equal(await naming(p).evaluate(el=>document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===el.value.length),true);await borders(naming(p))
 await naming(p).press('Escape');assert.equal((await records(p)).ops.find(o=>o.entityId===local.id).operationId,old.operationId)
 await menu(p,'local original','이름 변경');await naming(p).fill('   ');await naming(p).press('Enter');await p.getByRole('tree').getByRole('alert').waitFor();assert.equal(await naming(p).getAttribute('maxLength'),'200')
 await naming(p).fill('local renamed');await naming(p).press('Enter');await until(async()=>(await records(p)).entities.find(e=>e.id===local.id)?.folder.name==='local renamed','pending rename');r=await records(p);const renamed=r.ops.find(o=>o.entityId===local.id);assert.equal(renamed.payload.name,'local renamed');assert.notEqual(renamed.operationId,old.operationId);assert.equal(r.ops.filter(o=>o.entityId===local.id).length,1);assert.equal(patches,0)
 // Failure after entity update and old-operation deletion must roll back both.
 await p.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='creationOutbox')throw Error('mock rename rollback');return original.apply(this,args)};window.restoreAdd=()=>IDBObjectStore.prototype.add=original})
 await menu(p,'local renamed','이름 변경');await naming(p).fill('local final');await naming(p).press('Enter');await p.getByRole('tree').getByRole('alert').waitFor();r=await records(p);assert.equal(r.entities.find(e=>e.id===local.id).folder.name,'local renamed');assert.equal(r.ops.find(o=>o.entityId===local.id).operationId,renamed.operationId)
 await p.evaluate(()=>window.restoreAdd());await naming(p).press('Enter');await until(async()=>(await records(p)).entities.find(e=>e.id===local.id)?.folder.name==='local final','rename retry')
 const frozen=await p.evaluate(async id=>{const {draftRepository}=await import('/src/features/local-drafts/draftDatabase.ts');return draftRepository.claimCreation(id)},local.id)
 await menu(p,'local final','이름 변경');await naming(p).fill('must not mutate frozen');await naming(p).press('Enter');await p.getByRole('tree').getByRole('alert').waitFor();assert.deepEqual((await records(p)).ops.find(o=>o.entityId===local.id),frozen);await naming(p).press('Escape')
 await menu(p,folder.name,'이름 변경');await naming(p).press('Enter');assert.equal(patches,0,'same name no request')
 await menu(p,folder.name,'이름 변경');await naming(p).fill('server renamed');await naming(p).press('Enter');await until(()=>folder.name==='server renamed','server PATCH');await p.getByRole('button',{name:'server renamed 폴더 메뉴',exact:true}).waitFor();assert.equal(patches,1);assert.equal((await records(p)).workspace.data.folders.find(x=>x.id===f).name,'server renamed')
 fail=true;await menu(p,folder.name,'이름 변경');await naming(p).fill('server retry');await naming(p).press('Enter');await p.getByRole('tree').getByRole('alert').waitFor();assert.equal(folder.name,'server renamed');assert.equal(await naming(p).inputValue(),'server retry');fail=false;await naming(p).press('Enter');await until(()=>folder.name==='server retry','PATCH retry');await p.getByRole('button',{name:'server retry 폴더 메뉴',exact:true}).waitFor();assert.equal(patches,3)
 const before=p.url();await menu(p,folder.name,'문서 추가');await until(()=>p.url()!==before,'new note URL');await focusedTitle(p);await borders(title(p));const created=new URL(p.url()).pathname.split('/').at(-1);await p.keyboard.type('keyboard title');assert.equal(await title(p).inputValue(),'keyboard title');await until(async()=>(await records(p)).drafts.some(d=>d.noteId===created&&d.title==='keyboard title'),'typed in new note');assert.equal((await records(p)).drafts.find(d=>d.noteId===a).title,'server note')
 await p.getByLabel('노트 검색').fill('keyboard');await borders(p.getByLabel('노트 검색'));await pause(600);assert.equal(await p.getByLabel('노트 검색').evaluate(el=>document.activeElement===el),true,'later renders must not steal focus');await p.getByLabel('노트 검색').fill('')
 // Both the plus menu and editor action reuse the same post-recovery focus path.
 await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByLabel('추가할 항목',{exact:true}).getByRole('button',{name:'새 문서',exact:true}).click();await focusedTitle(p)
 await p.getByRole('button',{name:'새 문서',exact:true}).click();await focusedTitle(p)
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()
 const mobileBefore=p.url();await menu(p,folder.name,'문서 추가');await until(()=>p.url()!==mobileBefore,'mobile new note');await p.getByRole('dialog',{name:'폴더 사이드바',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')==='문서 제목'),false,'mobile must not move focus behind modal')
 await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByRole('button',{name:'새 최상위 폴더',exact:true}).click();await newName(p).fill('mobile pending');await newName(p).press('Enter');await p.getByRole('button',{name:'mobile pending 폴더 메뉴',exact:true}).waitFor()
 await ctx.setOffline(true);await menu(p,'mobile pending','이름 변경');await naming(p).fill('mobile offline renamed');await naming(p).press('Enter');await p.getByRole('button',{name:'mobile offline renamed 폴더 메뉴',exact:true}).waitFor();assert.equal(patches,3)
 await menu(p,folder.name,'이름 변경');await naming(p).fill('server offline blocked');await naming(p).press('Enter');await p.getByRole('tree').getByRole('alert').waitFor();assert.equal(patches,3);await naming(p).press('Escape');await p.getByRole('dialog',{name:'폴더 사이드바',exact:true}).waitFor()
 await ctx.setOffline(false);await p.reload();await until(async()=>(await records(p)).entities.some(e=>e.folder?.name==='mobile offline renamed'),'reload renamed metadata');await p.getByRole('button',{name:'사이드바 펼치기',exact:true}).click();await p.getByRole('button',{name:'mobile offline renamed 폴더 메뉴',exact:true}).waitFor()
 assert.deepEqual(errors,[]);console.log('PASS: server rename success/failure/retry/no-op, pending rename/Escape/validation/rollback/frozen protection/offline reload, borderless inputs, desktop title keyboard focus via all creation paths, no focus stealing, mobile Drawer stays open/no background focus; mock API only')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
