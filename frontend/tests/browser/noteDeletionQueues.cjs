// Synthetic API + real Chromium IndexedDB, isolated profile. Never a development API.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const wait=ms=>new Promise(r=>setTimeout(r,ms)),rich=t=>JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]})
async function until(fn,label){for(let i=0;i<700;i++){if(await fn())return;await wait(20)}throw Error(label)}
async function records(p,id){return p.evaluate(async id=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});try{return await new Promise(ok=>{const tx=db.transaction(['drafts','outbox','creationOutbox','localEntities','deletedEntities'],'readonly'),out={};for(const key of ['drafts','outbox','creationOutbox','localEntities','deletedEntities']){const r=tx.objectStore(key).getAll();r.onsuccess=()=>out[key]=r.result}tx.oncomplete=()=>ok({draft:out.drafts.find(x=>x.noteId===id),updates:out.outbox.filter(x=>x.noteId===id),creations:out.creationOutbox.filter(x=>x.entityId===id),entities:out.localEntities.filter(x=>x.kind==='note'&&x.id===id),markers:out.deletedEntities.filter(x=>x.key==='note:'+id)})})}finally{db.close()}},id)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),ctx=await b.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});try{
 const p=await ctx.newPage(),id=randomUUID(),other=randomUUID(),stamp='2026-10-29T00:00:00Z',base={folderId:null,title:'Delete me',content:rich('server'),version:0,sortOrder:0,createdAt:stamp,updatedAt:stamp},note={...base,id},keep={...base,id:other,title:'Keep',sortOrder:1}
 let deleted=false,latePuts=0,deleteCalls=0,remoteChanged=false;const mode=process.env.DELETE_MODE||'normal'
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{const req=r.request(),path=new URL(req.url()).pathname
  if(req.method()==='DELETE'){deleteCalls++;if(mode==='failure'&&deleteCalls===1)return r.fulfill({status:503,json:{code:'TEST_FAILURE',message:'synthetic failed',errors:[]}});if(deleted)return r.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'already deleted',errors:[]}});deleted=true;return r.fulfill({status:204})}
  if(req.method()==='PUT'){if(mode==='open-modal'&&!deleted){remoteChanged=true;return r.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'synthetic conflict',errors:[]}})}if(deleted&&path.endsWith(id))latePuts++;return r.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'synthetic missing',errors:[]}})}
  assert.equal(req.method(),'GET');if(path==='/api/workspace/tree')return r.fulfill({json:{folders:[],notes:deleted?[keep]:[note,keep]}})
  return deleted&&path.endsWith(id)?r.fulfill({status:404,json:{code:'NOTE_NOT_FOUND',message:'synthetic missing',errors:[]}}):r.fulfill({json:path.endsWith(id)?(remoteChanged?{...note,version:1,title:'Remote changed',content:rich('remote')}:note):keep})
 })
 await p.goto('http://127.0.0.1:25213/notes/'+id);const ed=p.getByRole('textbox',{name:'문서 내용',exact:true});await until(()=>ed.isEditable(),'editor');await p.locator('[aria-label="문서 내용"][contenteditable="true"]').fill('unsynced local edit');await until(async()=>(await records(p,id)).updates.length===1,'local saved')
 let peer
 if(mode==='open-modal'){await p.locator('[data-workspace-sync]').click();await p.getByRole('dialog',{name:'원고 충돌 비교',exact:true}).waitFor()}
 if(['peer','open-modal'].includes(mode)){peer=await ctx.newPage();await peer.goto('http://127.0.0.1:25213/notes/'+id);if(mode==='open-modal'){await peer.getByRole('dialog').waitFor();await peer.keyboard.press('Escape');await peer.getByRole('dialog').waitFor({state:'hidden'})}else await until(()=>peer.getByRole('textbox',{name:'문서 내용',exact:true}).isEditable(),'peer ready')}
 if(mode==='residue')await p.evaluate(async({id,note})=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});await new Promise((ok,no)=>{const tx=db.transaction(['localEntities','creationOutbox'],'readwrite'),now=Date.now();tx.objectStore('localEntities').put({id,kind:'note',confirmed:true,note});tx.objectStore('creationOutbox').put({operationId:crypto.randomUUID(),entityId:id,type:'NOTE_CREATE',payload:{id,folderId:null,title:note.title,content:note.content},localRevision:1,status:'conflict',createdAt:now,attemptedAt:now,failureCode:'UUID_CONFLICT'});tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},{id,note})
 if(mode==='quota')await p.evaluate(()=>{window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='deletedEntities')throw new DOMException('synthetic quota','QuotaExceededError');return window.__put.apply(this,args)}})
 const driver=mode==='open-modal'?peer:p
 await driver.getByRole('button',{name:'현재 원고 메뉴',exact:true}).click();await driver.getByRole('menuitem',{name:'원고 삭제',exact:true}).click();await driver.getByRole('dialog',{name:'원고 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click();
 if(['quota','failure'].includes(mode)){
 const d=p.getByRole('dialog',{name:'원고 영구 삭제',exact:true});await d.getByRole('alert').first().waitFor();assert.ok((await records(p,id)).draft);assert.equal((await records(p,id)).updates.length,1);assert.equal((await records(p,id)).markers.length,0);assert.ok(p.url().endsWith(id));if(mode==='quota')await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__put});await d.getByRole('button',{name:'영구 삭제',exact:true}).click()
 }
 await until(()=>p.url().endsWith(other),'next selected');if(peer)await until(()=>peer.url().endsWith(other),'peer navigated')
 if(mode==='open-modal')await p.getByRole('dialog').waitFor({state:'hidden'})
 const afterDelete=await records(p,id)
 const sync=p.locator('[data-workspace-sync]');await until(()=>sync.isEnabled(),'sync');await sync.click();await until(()=>sync.isEnabled(),'sync completed')
 if(process.env.EXPECT_STALE==='1'){
  assert.ok(afterDelete.draft);assert.equal(afterDelete.updates.length,1);await p.getByRole('dialog',{name:'삭제된 서버 원고 복구',exact:true}).waitFor();assert.equal(latePuts,1)
  const result={reproduced:true,serverDeleted:true,localDraftRemained:true,outboxRemained:1,stalePutAfterDelete:latePuts,unexpectedRecoveryModal:true};fs.writeFileSync('/private/tmp/seam-note-delete-before.json',JSON.stringify(result));console.log(result)
 }else{
  assert.equal(afterDelete.draft,undefined);assert.equal(afterDelete.updates.length,0);assert.equal(afterDelete.creations.length,0);assert.equal(afterDelete.entities.length,0);assert.equal(afterDelete.markers.length,1);assert.equal(latePuts,0);assert.equal(await p.getByRole('dialog').count(),0)
  await p.reload();await until(()=>ed.isEditable(),'reloaded');await sync.click();await until(()=>sync.isEnabled(),'resync');assert.equal(latePuts,0);assert.equal(await p.getByRole('dialog').count(),0)
  if(peer){if(mode==='open-modal')await peer.getByRole('dialog').waitFor({state:'hidden'});await peer.locator('[data-workspace-sync]').click();await until(()=>peer.locator('[data-workspace-sync]').isEnabled(),'peer sync');assert.equal(latePuts,0)}
  const result={mode,passed:true,noStaleDraftOrQueues:true,noResend:true,noRecoveryModal:true,deleteCalls};fs.writeFileSync('/private/tmp/seam-note-delete-after-'+mode+'.json',JSON.stringify(result));console.log(result)
 }
 }finally{await ctx.close();await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
