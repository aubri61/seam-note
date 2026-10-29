// Real IndexedDB row deletion in isolated Chromium, GET-only synthetic server.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const wait=ms=>new Promise(r=>setTimeout(r,ms)),rich=t=>JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]})
async function until(fn,label){for(let i=0;i<600;i++){if(await fn())return;await wait(20)}throw Error(label)}
async function storage(p,id){return p.evaluate(async id=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});try{return await new Promise(ok=>{const tx=db.transaction(['drafts','outbox','deletedEntities','creationOutbox'],'readonly'),all={};for(const s of ['drafts','outbox','deletedEntities','creationOutbox']){const r=tx.objectStore(s).getAll();r.onsuccess=()=>all[s]=r.result}tx.oncomplete=()=>ok({draft:all.drafts.find(d=>d.noteId===id),ops:all.outbox.filter(o=>o.noteId===id),creates:all.creationOutbox.filter(o=>o.entityId===id),markers:all.deletedEntities.filter(d=>d.key==='note:'+id)})})}finally{db.close()}},id)}
function report(value){fs.writeFileSync('/private/tmp/seam-missing-after-'+value.mode+'.json',JSON.stringify(value));console.log(value)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),ctx=await b.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});try{
 const mode=process.env.MISSING_MODE||'pending',p=await ctx.newPage();let id=randomUUID();const note={id,folderId:null,title:'Synthetic',content:rich('server base'),version:0,sortOrder:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z'}
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{assert.equal(r.request().method(),'GET');return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[],notes:[note]}:note})})
 await p.goto('http://127.0.0.1:25213/notes/'+id);const ed=p.locator('[aria-label="문서 내용"][contenteditable="true"]');await ed.waitFor()
 if(mode==='local-create'){await ctx.setOffline(true);await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await p.getByRole('button',{name:'폴더 없이 새 문서',exact:true}).click();await until(()=>!p.url().endsWith(id),'local creation URL');id=p.url().split('/').at(-1);await ed.waitFor()}
 if(mode!=='clean'){await ed.fill('first draft');await until(async()=>!!(await storage(p,id)).draft?.content.includes('first draft'),'first saved')}else await until(async()=>!!(await storage(p,id)).draft,'server snapshot saved')
 const before=await storage(p,id)
 await p.evaluate(async({id,mode})=>{const db=await new Promise(ok=>{const r=indexedDB.open('seam-note-tiptap-v1');r.onsuccess=()=>ok(r.result)});await new Promise((ok,no)=>{const tx=db.transaction(['drafts','outbox','deletedEntities'],'readwrite');tx.objectStore('drafts').delete(id)
 if(mode==='frozen'){const r=tx.objectStore('outbox').getAll();r.onsuccess=()=>{for(const op of r.result.filter(o=>o.noteId===id))tx.objectStore('outbox').put({...op,status:'inFlight',attemptedAt:op.updatedAt})}}
 if(mode==='deleted')tx.objectStore('deletedEntities').put({key:'note:'+id,id,kind:'note',deletedAt:Date.now()})
 tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()},{id,mode})
 await ed.fill('second draft')
 if(process.env.EXPECT_MISSING==='1'){
  await p.getByRole('dialog').waitFor();const after=await storage(p,id);assert.equal(after.draft,undefined);assert.equal(after.ops.length,1)
  const result={reproduced:true,mode,draftRecreated:false,outboxRemained:1,memoryInputPreserved:(await ed.innerText()).includes('second draft')};fs.writeFileSync('/private/tmp/seam-missing-before.json',JSON.stringify(result));console.log(result)
 }else if(mode==='frozen'){
  await p.getByText('로컬 저장 실패',{exact:true}).waitFor();const after=await storage(p,id);assert.equal(after.draft,undefined);assert.equal(after.ops[0].operationId,before.ops[0].operationId);assert.equal(after.ops[0].content,before.ops[0].content);assert.equal(after.ops[0].status,'inFlight');assert.ok((await ed.innerText()).includes('second draft'));report({mode,blocked:true,frozenSnapshotPreserved:true})
 }else if(mode==='deleted'){
  await until(()=>p.getByRole('textbox',{name:'문서 내용',exact:true}).getAttribute('contenteditable').then(v=>v==='false'),'deleted memory stopped');assert.equal((await storage(p,id)).draft,undefined);report({mode,noResurrection:true})
 }else{
  await until(async()=>(await storage(p,id)).draft?.content.includes('second draft'),'draft recreated');const after=await storage(p,id);if(mode==='local-create'){assert.equal(after.ops.length,0);assert.equal(after.creates.length,1);assert.equal(after.creates[0].payload.content,after.draft.content)}else{assert.equal(after.ops.length,1);assert.equal(after.ops[0].content,after.draft.content);assert.equal(after.ops[0].expectedVersion,0);}assert.ok(after.draft.localRevision>before.draft.localRevision);assert.equal(after.markers.length,0)
  if(mode!=='local-create'){await p.reload();await ed.waitFor();assert.ok((await ed.innerText()).includes('second draft'))}report({mode,recreated:true,revisionIncreased:true,pendingMatches:true,reloadPreserved:mode!=='local-create'})
 }
 }finally{await ctx.close();await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
