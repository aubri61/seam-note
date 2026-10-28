import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/loadModules.mjs'
const {planWorkspaceSync,syncWorkspace}=await load('features/manual-sync/SyncCoordinator')
const {ApiError}=await load('lib/api/client')
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const root=uuid(1),child=uuid(2),note=uuid(3),other=uuid(4)
const folder=(id,parentId=null)=>({id,parentId,name:'mock',sortOrder:0,version:0,createdAt:'2026-10-27T00:00:00Z',updatedAt:'2026-10-27T00:00:00Z'})
const create=(id,parentId=null,type='FOLDER_CREATE')=>({operationId:uuid(Number(id.slice(-3))+100),entityId:id,type,status:'pending',attemptedAt:null,createdAt:1,
 ...(type==='NOTE_CREATE'?{localRevision:1,payload:{id,folderId:parentId,title:'mock',content:''}}:{payload:{id,parentId,name:'mock'}})})
const update=(id,key=200)=>({operationId:uuid(key),noteId:id,type:'NOTE_UPDATE',title:'mock',content:'latest',expectedVersion:0,localRevision:1,status:'pending',attemptedAt:null,createdAt:1,updatedAt:1})
function snapshot(creations=[],updates=[]){return {creations,updates,drafts:[],workspace:{folders:[folder(other)],notes:[]},entities:creations.map(op=>op.type==='FOLDER_CREATE'?{id:op.entityId,kind:'folder',confirmed:false,folder:folder(op.entityId,op.payload.parentId)}:{id:op.entityId,kind:'note',confirmed:false,note:{id:op.entityId,folderId:op.payload.folderId}})}}
function harness(initial){
 let state=structuredClone(initial);const calls=[],entries={},locked=[]
 const session={getSnapshot:()=>entries,readyForSync:async id=>{entries[id]??={phase:'saved',draft:{noteId:id,title:'mock',content:'latest'}}},flushLatest:async()=>{}}
 const locks={request:async(name,options,callback)=>{locked.push(name);return callback({name})}}
 const deps={locks,read:async()=>structuredClone(state),folder:async(id,options)=>{const op=state.creations.find(o=>o.entityId===id);calls.push(id);options.onAcknowledged(op);state.creations=state.creations.filter(o=>o!==op)},createNote:async(id,_session,_canSend,options)=>{const op=state.creations.find(o=>o.entityId===id);calls.push(id);options.onAcknowledged(op);state.creations=state.creations.filter(o=>o!==op);return {id,version:0}},update:async(id,_session,options)=>{const op=state.updates.find(o=>o.noteId===id&&options.allowedOperationIds.includes(o.operationId));if(!op)return {kind:'unchanged'};calls.push(id);options.onSending(op);options.onAcknowledged(op,{id,version:1});state.updates=state.updates.filter(o=>o!==op);return {kind:'synced',note:{id,version:1}}}}
 return {session,deps,calls,entries,locked,get state(){return state},set state(value){state=value}}
}
test('graph sorts reversed parent/child/note operations by actual dependency',()=>{
 const plan=planWorkspaceSync(snapshot([create(note,child,'NOTE_CREATE'),create(child,root),create(root)]))
 assert.deepEqual(plan.ordered.map(op=>op.entityId),[root,child,note]);assert.equal(plan.issues.length,0)
})
test('cycles, orphan/missing records, duplicate creation IDs are held without infinite traversal',()=>{
 for(const state of [snapshot([create(root,child),create(child,root)]),snapshot([create(root,uuid(999))]),{...snapshot([create(root)]),entities:[]},snapshot([create(root),{...create(root),operationId:uuid(998)}])]){
  assert.ok(planWorkspaceSync(state).issues.length>0)
 }
})
test('persisted missing-note quarantine differs from conflict and never becomes CREATE',()=>{
 const op={...update(note),status:'conflict',attemptedAt:1,failureCode:'NOTE_NOT_FOUND'}
 const plan=planWorkspaceSync(snapshot([], [op,update(note,201)]));assert.equal(plan.updates.size,0);assert.equal(plan.issues[0].kind,'review')
 assert.equal(plan.ordered.length,0)
})
test('one explicit pass covers folder-only and unselected persisted notes, ACK counts once',async()=>{
 const h=harness(snapshot([create(child,root),create(root)],[update(note),update(other,201)]))
 const result=await syncWorkspace(h.session,h.deps)
 assert.equal(result.acknowledged.length,4);assert.equal(new Set(result.acknowledged).size,4);assert.equal(result.remaining,0)
 assert.deepEqual(h.locked,['seam-note:creation-sync']);assert.deepEqual(h.calls,[root,child,note,other])
})
test('local flush failure excludes only that note; unrelated safe work continues',async()=>{
 const h=harness(snapshot([],[update(note),update(other,201)]));h.entries[note]={draft:{noteId:note},phase:'failed'}
 h.session.readyForSync=async id=>{if(id===note)throw Error('local failed')}
 const result=await syncWorkspace(h.session,h.deps);assert.deepEqual(h.calls,[other]);assert.equal(result.localFailures.length,1);assert.equal(result.remaining,1)
})
test('failed parent holds only its dependents, independent folders continue',async()=>{
 const h=harness(snapshot([create(child,root),create(root),create(note)])),base=h.deps.folder
 h.deps.folder=async(id,options)=>{if(id===root)throw new ApiError(503,{code:'TEMPORARY',message:'mock',errors:[]});return base(id,options)}
 const result=await syncWorkspace(h.session,h.deps);assert.deepEqual(h.calls,[note]);assert.equal(result.issues.find(i=>i.entityId===child).kind,'deferred');assert.equal(result.remaining,2)
})
test('two consecutive uncertain network failures stop request fan-out and retain all operations',async()=>{
 const h=harness(snapshot([],[update(root,200),update(child,201),update(note,202)]));let attempts=0
 h.deps.update=async(id,_s,options)=>{const op=h.state.updates.find(o=>o.noteId===id);options.onSending(op);attempts++;throw new ApiError(502,{code:'GATEWAY',message:'mock',errors:[]})}
 const result=await syncWorkspace(h.session,h.deps);assert.equal(attempts,2);assert.equal(result.remaining,3);assert.equal(result.issues.filter(i=>i.kind==='network').length,2);assert.equal(result.issues.filter(i=>i.kind==='deferred').length,1)
})
test('409 and known NOTE_NOT_FOUND isolate one note; generic 404 does not claim deletion',async()=>{
 for(const [status,code,kind] of [[409,'VERSION_CONFLICT','conflict'],[404,'NOTE_NOT_FOUND','review'],[404,'HTTP_ERROR','failed'],[403,'FORBIDDEN','failed']]){
  const h=harness(snapshot([],[update(note),update(other,201)])),base=h.deps.update
  h.deps.update=async(id,s,options)=>{if(id===note){options.onSending(h.state.updates[0]);throw new ApiError(status,{code,message:'mock',errors:[]})}return base(id,s,options)}
  const result=await syncWorkspace(h.session,h.deps);assert.equal(result.issues[0].kind,kind)
  assert.deepEqual(h.calls,status===403?[]:[other]);assert.equal(h.state.updates[0].operationId,uuid(200))
 }
})
test('initial/final read failures never become an empty queue or a completed result',async()=>{
 const h=harness(snapshot());h.deps.read=async()=>{throw Error('read failed')};await assert.rejects(syncWorkspace(h.session,h.deps),/read failed/)
 let reads=0;h.deps.read=async()=>{if(++reads>1)throw Error('final read failed');return snapshot()}
 const result=await syncWorkspace(h.session,h.deps);assert.equal(result.remaining,undefined);assert.ok(result.readError)
})
test('lost lock makes zero storage reads and zero sends',async()=>{
 const h=harness(snapshot([create(root)]));let reads=0;h.deps.read=async()=>{reads++;return snapshot()};h.deps.locks={request:async(_n,_o,cb)=>cb(null)}
 await assert.rejects(syncWorkspace(h.session,h.deps),/다른 탭/);assert.equal(reads,0);assert.equal(h.calls.length,0)
})
test('newly appended operations remain after finite cut and empty run is a no-op',async()=>{
 const h=harness(snapshot([],[update(note)])),base=h.deps.update
 h.deps.update=async(...args)=>{const result=await base(...args);h.state.updates.push(update(other,999));return result}
 const result=await syncWorkspace(h.session,h.deps);assert.equal(result.acknowledged.length,1);assert.equal(result.remaining,1);assert.equal(result.newOrRebased,1);assert.deepEqual(h.calls,[note])
 const empty=harness(snapshot());assert.equal((await syncWorkspace(empty.session,empty.deps)).acknowledged.length,0);assert.deepEqual(empty.calls,[])
})

test('creation ACK sends at most one required successor and leaves further input queued',async()=>{
 const op=create(note,other,'NOTE_CREATE'),h=harness(snapshot([op])),baseCreate=h.deps.createNote,baseUpdate=h.deps.update
 h.deps.createNote=async(...args)=>{const result=await baseCreate(...args);h.state.updates.push(update(note,300));return result}
 h.deps.update=async(...args)=>{const result=await baseUpdate(...args);h.state.updates.push(update(note,301));return result}
 const result=await syncWorkspace(h.session,h.deps);assert.deepEqual(h.calls,[note,note]);assert.equal(result.acknowledged.length,2);assert.equal(result.remaining,1);assert.equal(h.state.updates[0].operationId,uuid(301))
})

test('clicked uncertain predecessor and rebased successor are finite and preserve order',async()=>{
 const first={...update(note,300),status:'inFlight',attemptedAt:1,content:'old'},second=update(note,301)
 const state=snapshot([],[first,second]);state.drafts=[{noteId:note,title:'mock',content:'latest'}]
 const h=harness(state);h.entries[note]={phase:'saved',draft:{noteId:note,title:'mock',content:'latest'}}
 const sent=[];h.deps.update=async(_id,_s,options)=>{
  const op=h.state.updates.find(o=>options.allowedOperationIds.includes(o.operationId));sent.push(op.operationId);options.onSending(op);options.onAcknowledged(op,{id:note,version:sent.length})
  h.state.updates=sent.length===1?[{...second,operationId:uuid(302),expectedVersion:1}]:[]
  return {kind:'synced',note:{id:note,version:sent.length}}
 }
 const result=await syncWorkspace(h.session,h.deps);assert.deepEqual(sent,[uuid(300),uuid(302)]);assert.equal(result.remaining,0);assert.equal(result.acknowledged.length,2)
})

test('a local transaction CAS rejection is a local failure, separate from server409/404, and independent work continues',async()=>{
 const { LocalDraftConflict } = await load('features/local-drafts/localDraftTypes')
 const h=harness(snapshot([],[update(note),update(other,201)])),base=h.deps.update
 h.deps.update=async(id,s,options)=>{if(id===note)throw new Error('ACK not confirmed',{cause:new LocalDraftConflict()});return base(id,s,options)}
 const result=await syncWorkspace(h.session,h.deps)
 assert.deepEqual(h.calls,[other]);assert.equal(result.localFailures.length,1);assert.match(result.localFailures[0].message,/다른 탭/)
 assert.equal(result.issues.length,0);assert.equal(result.remaining,1)
})
