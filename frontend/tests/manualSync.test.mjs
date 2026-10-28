import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const {verifySyncResponse,isManualSyncNote,manualSaveState}=await load('features/manual-sync/syncContract')
const {sendNoteSnapshot,syncOneNote}=await load('features/manual-sync/manualSync')
const {apiClient,ApiError}=await load('lib/api/client')
const {EMPTY_DOCUMENT}=await load('features/notes/richTextDocument')
const id='00000000-0000-4000-8000-000000000701',key='00000000-0000-4000-8000-000000000702'
const operation={operationId:key,noteId:id,type:'NOTE_UPDATE',title:'',content:EMPTY_DOCUMENT,expectedVersion:0,localRevision:7,createdAt:1,updatedAt:1,status:'inFlight',attemptedAt:1}
const note={id,folderId:'folder',title:'',content:EMPTY_DOCUMENT,version:1,sortOrder:0,createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:01Z'}
const locks={request:async(name,options,callback)=>{assert.equal(options.ifAvailable,true);return callback({name})}}
function fake() {
  const calls={send:0,ack:0,conflict:0,flush:0}
  const draft={noteId:id,title:'',content:EMPTY_DOCUMENT,baseTitle:'',baseContent:'before',baseVersion:0,latestServerVersion:0}
  const session={protectServerForManual:()=>{},releaseServerProtection:()=>{},getSnapshot:()=>({[id]:{phase:'saved',draft}}),flushLatest:async()=>{calls.flush++},savedHead:()=>({token:'token',revision:7}),acceptServerAck:async(_id,response,commit)=>{await commit('token',7,'writer');draft.baseContent=response.content;draft.baseVersion=response.version}}
  const storage={prepareManual:async()=>structuredClone(operation),acknowledge:async()=>{calls.ack++},markConflict:async()=>{calls.conflict++}}
  return {session,storage,calls}
}
test('manual save accepts any valid note UUID without a DEV or configured-ID gate',()=>{
  assert.equal(isManualSyncNote(id),true);assert.equal(isManualSyncNote(key),true)
  assert.equal(isManualSyncNote(null),false);assert.equal(isManualSyncNote('not-uuid'),false)
})
test('response correlation verifies operationId, note identity, snapshot and version',()=>{
  assert.equal(verifySyncResponse(operation,note,key),note)
  for(const [body,echo] of [[note,undefined],[note,id],[{...note,id:key},key],[{...note,content:'different'},key],[{...note,version:2},key]])
    assert.throws(()=>verifySyncResponse(operation,body,echo),/확인/)
})
test('Axios PUT sends immutable snapshot and Idempotency-Key, then validates the response header',async()=>{
  const previous=apiClient.defaults.adapter
  apiClient.defaults.adapter=async config=>{
    assert.equal(config.method,'put');assert.equal(config.url,'/notes/'+id)
    assert.equal(config.headers.get('Idempotency-Key'),key)
    assert.deepEqual(JSON.parse(config.data),{title:'',content:EMPTY_DOCUMENT,expectedVersion:0})
    assert.equal(config.timeout,15000)
    return {data:note,status:200,statusText:'OK',headers:{'idempotency-key':key},config}
  }
  try {assert.deepEqual(await sendNoteSnapshot(operation),note)}finally{apiClient.defaults.adapter=previous}
})
test('manual action refuses invalid IDs before local or network work',async()=>{
  const f=fake();await assert.rejects(()=>syncOneNote('invalid',f.session,{storage:f.storage,send:async()=>{f.calls.send++;return note},locks}),/원고 ID/)
  assert.equal(f.calls.flush,0);assert.equal(f.calls.send,0)
})
test('missing or occupied Web Lock stops without sending',async()=>{
  for(const manager of [undefined,{request:async(_name,_options,callback)=>callback(null)}]){
    const f=fake();await assert.rejects(()=>syncOneNote(id,f.session,{storage:f.storage,send:async()=>{f.calls.send++;return note},locks:manager}))
    assert.equal(f.calls.send,0);assert.equal(f.calls.ack,0)
  }
})
test('uncertain transport keeps the key and snapshot for the next explicit retry',async()=>{
  const f=fake(),sent=[]
  const send=async op=>{sent.push(op);if(sent.length===1)throw new ApiError(0,{code:'NETWORK_ERROR',message:'lost',errors:[]});return note}
  const deps={storage:f.storage,send,locks}
  await assert.rejects(()=>syncOneNote(id,f.session,deps),/같은 키/)
  assert.equal(f.calls.ack,0);assert.equal(f.calls.conflict,0)
  const result=await syncOneNote(id,f.session,deps)
  assert.equal(result.kind,'synced');assert.deepEqual(sent[0],sent[1]);assert.equal(f.calls.ack,1)
})
test('VERSION_CONFLICT records conflict and never acknowledges the local snapshot',async()=>{
  const f=fake()
  await assert.rejects(()=>syncOneNote(id,f.session,{storage:f.storage,locks,send:async()=>{throw new ApiError(409,{code:'VERSION_CONFLICT',message:'conflict',errors:[]})}}),/VERSION_CONFLICT/)
  assert.equal(f.calls.conflict,1);assert.equal(f.calls.ack,0)
  assert.equal(f.session.getSnapshot()[id].draft.content,EMPTY_DOCUMENT)
})
test('empty Outbox ends a manual click without an HTTP request',async()=>{
  const f=fake();f.storage.prepareManual=async()=>null
  const result=await syncOneNote(id,f.session,{storage:f.storage,locks,send:async()=>{f.calls.send++;return note}})
  assert.equal(result.kind,'unchanged');assert.equal(f.calls.send,0)
})

test('missing, failed recovery and local conflict stop before claim and sending',async()=>{
  for(const entry of [undefined,{phase:'recovering'},{phase:'failed',draft:{noteId:id}},{phase:'conflict',draft:{noteId:id}}]){
    const f=fake();f.session.getSnapshot=()=>({[id]:entry})
    await assert.rejects(()=>syncOneNote(id,f.session,{storage:f.storage,locks,send:async()=>{f.calls.send++;return note}}))
    assert.equal(f.calls.flush,0);assert.equal(f.calls.send,0)
  }
})
test('availability changing while flush awaits stops before claim',async()=>{
  const f=fake();let available=true;f.session.flushLatest=async()=>{available=false}
  await assert.rejects(()=>syncOneNote(id,f.session,{storage:f.storage,locks,canSend:()=>available,send:async()=>{f.calls.send++;return note}}))
  assert.equal(f.calls.send,0)
})
test('manual UX distinguishes clean, unsaved latest input, uncertainty and blocked states',()=>{
  const draft={noteId:id,title:'',content:'same',baseTitle:'',baseContent:'same'}
  const entry={draft,phase:'saved',revision:2,savedRevision:2}
  const view=(patch={},ops=[],available=true,error=false,busy=false)=>manualSaveState(id,{...entry,...patch},available,ops,error,busy)
  assert.equal(view().disabled,true)
  assert.equal(view({revision:3}).disabled,true)
  assert.equal(view({revision:3,draft:{...draft,content:'new'}}).disabled,false)
  assert.equal(view({draft:{...draft,content:'new'}}).disabled,false)
  assert.equal(view({},[operation]).disabled,false)
  assert.equal(view({},[{...operation,status:'conflict'}]).disabled,true)
  for(const phase of ['recovering','failed','conflict'])assert.equal(view({phase}).disabled,true)
  assert.equal(view({},[],false).disabled,true);assert.equal(view({},[],true,true).disabled,true)
  assert.equal(view({},[],true,false,true).disabled,true)
  assert.equal(manualSaveState(id,entry,true,undefined,false,false).disabled,true)
  assert.equal(view({},[operation]).remaining,1)
})

test('only a known NOTE_NOT_FOUND quarantines a 404; generic HTTP404 stays uncertain',async()=>{
  for(const code of ['NOTE_NOT_FOUND','HTTP_ERROR']){
    const f=fake();let storedCode
    f.storage.markConflict=async(_key,failureCode)=>{f.calls.conflict++;storedCode=failureCode}
    await assert.rejects(syncOneNote(id,f.session,{storage:f.storage,locks,send:async()=>{throw new ApiError(404,{code,message:'mock 404',errors:[]})}}))
    assert.equal(f.calls.conflict,code==='NOTE_NOT_FOUND'?1:0)
    assert.equal(storedCode,code==='NOTE_NOT_FOUND'?code:undefined)
    assert.equal(f.calls.ack,0)
  }
})
