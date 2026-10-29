const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const pause=ms=>new Promise(r=>setTimeout(r,ms)),rich=t=>JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]})
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function state(p,id){return p.evaluate(async id=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});try{return await new Promise(ok=>{const tx=db.transaction(['drafts','outbox','deletedEntities'],'readonly'),result={};for(const store of ['drafts','outbox','deletedEntities']){const r=tx.objectStore(store).getAll();r.onsuccess=()=>result[store]=r.result}tx.oncomplete=()=>ok({draft:result.drafts.find(d=>d.noteId===id),ops:result.outbox.filter(o=>o.noteId===id),markers:result.deletedEntities})})}finally{db.close()}},id)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),results=[];try{
 for(const mode of ['discard','quota','changed','changed-local','compare','mobile']){
 const ctx=await b.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1440,height:1000},serviceWorkers:'block'}),p=await ctx.newPage(),id=randomUUID(),stamp='2026-10-29T00:00:00Z',note={id,folderId:null,title:'Synthetic',content:rich('original'),version:0,sortOrder:0,createdAt:stamp,updatedAt:stamp}
 let missing=false,versionConflict=false,writeCount=0
 await ctx.route(u=>u.pathname.startsWith('/api/'),async r=>{const req=r.request(),path=new URL(req.url()).pathname
  if(req.method()==='PUT'){writeCount++;return r.fulfill({status:missing?404:409,json:{code:missing?'NOTE_NOT_FOUND':'VERSION_CONFLICT',message:'synthetic conflict',errors:[]}})}
  assert.equal(req.method(),'GET')
  if(path==='/api/workspace/tree')return r.fulfill({json:{folders:[],notes:missing?[]:[note]}})
  return missing?r.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'synthetic missing',errors:[]}}):r.fulfill({json:versionConflict?{...note,version:1,title:'Other',content:rich('remote')}:note})
 })
 await p.goto('http://127.0.0.1:25213/notes/'+id);const editor=p.getByRole('textbox',{name:'문서 내용',exact:true});await editor.waitFor();await until(()=>editor.isEditable(),'editor recovered');await editor.fill('local edit');await until(async()=>(await state(p,id)).ops.length===1,'local commit')
 missing=mode!=='compare';versionConflict=mode==='compare'
 const sync=p.locator('[data-workspace-sync]');await until(()=>sync.isEnabled(),'sync enabled');await sync.click()
 const dialog=p.getByRole('dialog',{name:mode==='compare'?'원고 충돌 비교':'삭제된 서버 원고 복구',exact:true});await dialog.waitFor()
 const action=dialog.getByRole('button',{name:mode==='compare'?'현재 원고 선택':'로컬 원고 삭제',exact:true});await until(()=>action.isEnabled(),'choice ready')
 const box=await dialog.boundingBox();assert.ok(box.width<=(mode==='compare'?960:520)+1);assert.ok(box.height<850);if(mode==='mobile')assert.ok(box.width<=358)
 if(mode==='compare'){assert.ok(box.height<650);results.push({mode,width:box.width,height:box.height});await ctx.close();continue}
 if(mode==='changed'){missing=false;await action.click();await dialog.getByRole('alert').first().waitFor();assert.ok((await state(p,id)).draft);assert.equal((await state(p,id)).markers.length,0);results.push({mode,staleServerCheckPreserved:true});await ctx.close();continue}
 if(mode==='changed-local'){
  // Fault injection represents another committed revision: verify the final IDB CAS fence.
  await p.evaluate(async id=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});await new Promise((ok,no)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),r=store.get(id);r.onsuccess=()=>store.put({...r.result,storageToken:crypto.randomUUID(),localRevision:r.result.localRevision+1});tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},id)
  await action.click();await dialog.getByRole('alert').first().waitFor();assert.ok((await state(p,id)).draft);assert.equal((await state(p,id)).markers.length,0);results.push({mode,staleLocalCheckPreserved:true});await ctx.close();continue
 }
 if(mode==='quota'){
  await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='deletedEntities')throw new DOMException('synthetic quota','QuotaExceededError');return window.__originalPut.apply(this,args)}})
  await action.click();await dialog.getByRole('alert').first().waitFor();const before=await state(p,id);assert.ok(before.draft);assert.equal(before.ops.length,1);assert.equal(before.markers.length,0)
  await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut})
 }
 await action.click();await dialog.waitFor({state:'hidden'});await until(async()=>!(await state(p,id)).draft,'discard committed');const after=await state(p,id);assert.equal(after.ops.length,0);assert.ok(after.markers.some(m=>m.key==='note:'+id));assert.equal(writeCount,1)
 await p.reload();assert.equal((await state(p,id)).ops.length,0)
 results.push({mode,width:box.width,height:box.height,atomicDiscard:true,noRecreate:true});await ctx.close()
 }
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-29-deleted-note-discard.json',`file://${__filename}`),JSON.stringify({results,developmentDbWrites:0},null,2)+'\n');console.log(results)
 }finally{await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
