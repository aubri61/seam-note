const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await wait(20)}throw Error(label)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),ctx=await b.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});try{
 const p=await ctx.newPage(),id=randomUUID(),oldDeleted=randomUUID(),pending=randomUUID(),queued=randomUUID(),newAck=randomUUID(),missingParent=randomUUID(),child=randomUUID(),stamp='2026-10-29T00:00:00Z',content='{"type":"doc","content":[{"type":"paragraph"}]}',note={id,folderId:null,title:'Server note',content,version:0,sortOrder:0,createdAt:stamp,updatedAt:stamp}
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{assert.equal(r.request().method(),'GET');return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[],notes:[note]}:note})})
 await p.goto('http://127.0.0.1:25213/notes/'+id);await p.locator('[aria-label="문서 내용"][contenteditable="true"]').waitFor()
 await p.evaluate(async({id,oldDeleted,pending,queued,newAck,missingParent,child,note,content})=>{
  const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)}),now=Date.now()
  await new Promise((ok,no)=>{const tx=db.transaction(['localEntities','creationOutbox','outbox'],'readwrite'),entities=tx.objectStore('localEntities')
   const summary={id:note.id,folderId:null,title:note.title,version:0,sortOrder:0,updatedAt:note.updatedAt}
   for(const key of [id,oldDeleted,queued])entities.put({id:key,kind:'note',confirmed:true,confirmedAt:now-10000,note:{...summary,id:key}})
   entities.put({id:newAck,kind:'note',confirmed:true,confirmedAt:now+60000,note:{...summary,id:newAck}})
   entities.put({id:missingParent,kind:'folder',confirmed:true,confirmedAt:now-10000,folder:{id:missingParent,parentId:null,name:'Missing parent',version:0,sortOrder:0}})
   entities.put({id:pending,kind:'note',confirmed:false,note:{...summary,id:pending}})
   entities.put({id:child,kind:'note',confirmed:false,note:{...summary,id:child,folderId:missingParent}})
   for(const key of [pending,child])tx.objectStore('creationOutbox').put({operationId:crypto.randomUUID(),entityId:key,type:'NOTE_CREATE',payload:{id:key,folderId:key===child?missingParent:null,title:'pending',content},localRevision:1,status:'conflict',createdAt:now,attemptedAt:now,failureCode:'UUID_CONFLICT'})
   tx.objectStore('outbox').put({operationId:crypto.randomUUID(),noteId:queued,type:'NOTE_UPDATE',title:'queued',content,localRevision:1,expectedVersion:0,status:'conflict',createdAt:now,updatedAt:now,attemptedAt:now,failureCode:'VERSION_CONFLICT'})
   tx.oncomplete=ok;tx.onabort=()=>no(tx.error)
  });db.close()
 },{id,oldDeleted,pending,queued,newAck,missingParent,child,note,content})
 await p.reload();await p.locator('[aria-label="문서 내용"][contenteditable="true"]').waitFor()
 const kept=await p.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});const all=await new Promise(ok=>{const r=db.transaction('localEntities','readonly').objectStore('localEntities').getAll();r.onsuccess=()=>ok(r.result)});db.close();return all.map(x=>x.id)})
 assert.equal(kept.includes(id),false);assert.equal(kept.includes(oldDeleted),false)
 for(const key of [pending,queued,newAck,missingParent,child])assert.ok(kept.includes(key),key)
 const result={passed:true,confirmedRedundantRemoved:2,protectedRetained:5,pendingAndConflictPreserved:true,newerAckProtected:true,missingParentDependencyProtected:true,noServerWrites:true};fs.writeFileSync('/private/tmp/seam-local-entities-lifecycle.json',JSON.stringify(result));console.log(result)
 }finally{await ctx.close();await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
