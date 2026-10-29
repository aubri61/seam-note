const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<600;i++){if(await fn())return;await wait(20)}throw Error(label)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),ctx=await b.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});try{
 const p=await ctx.newPage(),id=randomUUID(),orphan=randomUUID(),note={id,folderId:null,title:'Other note',content:'{"type":"doc","content":[{"type":"paragraph"}]}',version:0,sortOrder:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z'},requests=[]
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{requests.push({method:r.request().method(),path:new URL(r.request().url()).pathname});assert.equal(r.request().method(),'GET');return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[],notes:[note]}:note})})
 await p.goto('http://127.0.0.1:25213/notes/'+id);await until(()=>p.getByRole('textbox',{name:'문서 내용',exact:true}).isEditable(),'ready')
 const opId=randomUUID()
 await p.evaluate(async({orphan,opId})=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});await new Promise((ok,no)=>{const tx=db.transaction(['outbox','drafts'],'readwrite');tx.objectStore('drafts').delete(orphan);const now=Date.now();tx.objectStore('outbox').put({operationId:opId,noteId:orphan,type:'NOTE_UPDATE',title:'orphan snapshot',content:'{"type":"doc","content":[{"type":"paragraph"}]}',expectedVersion:0,localRevision:1,createdAt:now,updatedAt:now,status:'conflict',attemptedAt:now,failureCode:'NOTE_NOT_FOUND'});tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},{orphan,opId})
 await p.reload();await p.getByRole('alert').filter({hasText:'로컬 원고 없이 남은 충돌 작업'}).waitFor();assert.equal(await p.getByRole('dialog').count(),0)
 await p.locator('[data-workspace-sync]').click();await until(()=>p.locator('[data-workspace-sync]').isEnabled(),'synced');assert.equal(await p.getByRole('dialog').count(),0)
 const kept=await p.evaluate(async opId=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});const value=await new Promise(ok=>{const r=db.transaction('outbox','readonly').objectStore('outbox').get(opId);r.onsuccess=()=>ok(r.result)});db.close();return !!value},opId)
 assert.equal(kept,true);assert.equal(requests.some(r=>r.path.endsWith(orphan)),false)
 const result={passed:true,orphanOutboxPreserved:true,noFakeDraft:true,noAutoRecoveryModal:true,noOrphanGetOrPut:true};fs.writeFileSync('/private/tmp/seam-orphan-conflict-after.json',JSON.stringify(result));console.log(result)
 }finally{await ctx.close();await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
