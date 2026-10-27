import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {loadWorkspace,validateWorkspace}=await load('features/offline/workspaceCache')
const {ApiError}=await load('lib/api/client')
const data={folders:[{id:'f',name:'folder',parentId:null,sortOrder:0,version:0,createdAt:'t',updatedAt:'t'}],notes:[{id:'n',folderId:'f',title:'title',sortOrder:0,version:2,updatedAt:'t'}]}
function fixture(){const calls={get:0,save:0,read:0};let record
 const deps={online:()=>true,get:async()=>{calls.get++;return structuredClone(data)},storage:{save:async(value,requestedAt)=>{calls.save++;record={key:'current',data:value,cachedAt:100,requestedAt}},read:async()=>{calls.read++;return record}}}
 return {calls,deps,setRecord:r=>{record=r}}
}
test('successful GET records metadata only and returns the server snapshot',async()=>{
 const f=fixture();f.deps.get=async()=>({...data,notes:[{...data.notes[0],content:'must not be stored'}]})
 assert.deepEqual(await loadWorkspace({},f.deps),data);assert.equal(f.calls.save,1)
 const r=await f.deps.storage.read();assert.equal('content' in r.data.notes[0],false)
})
test('offline opens an existing snapshot without an HTTP request',async()=>{
 const f=fixture();await loadWorkspace({},f.deps);f.deps.online=()=>false
 const result=await loadWorkspace({},f.deps);assert.equal(f.calls.get,1);assert.deepEqual(result.notes,data.notes);assert.equal(result.localSnapshot.cachedAt,100)
})
test('network or 500 failure preserves the prior snapshot instead of saving an empty workspace',async()=>{
 for(const status of [0,500]){
  const f=fixture();await loadWorkspace({},f.deps)
  f.deps.get=async()=>{throw new ApiError(status,{code:'TEST',message:'failure',errors:[]})}
  assert.deepEqual((await loadWorkspace({},f.deps)).folders,data.folders);assert.equal(f.calls.save,1)
 }
})
test('401/403 do not silently reveal a cached workspace',async()=>{
 for(const status of [401,403]){const f=fixture();await loadWorkspace({},f.deps);f.deps.get=async()=>{throw new ApiError(status,{code:'TEST',message:'denied',errors:[]})};await assert.rejects(()=>loadWorkspace({},f.deps));assert.equal(f.calls.read,0)}
})
test('no offline snapshot is an explicit unavailable state',async()=>{
 const f=fixture();f.deps.online=()=>false;await assert.rejects(()=>loadWorkspace({},f.deps),/목록이 없습니다/);assert.equal(f.calls.save,0)
})
test('successful empty GET intentionally records an empty workspace',async()=>{
 const f=fixture();f.deps.get=async()=>({folders:[],notes:[]});assert.deepEqual(await loadWorkspace({},f.deps),{folders:[],notes:[]});assert.equal(f.calls.save,1)
})
test('cache write failure keeps live server metadata and reports limited offline availability',async()=>{
 const f=fixture();f.deps.storage.save=async()=>{throw Error('quota')};const r=await loadWorkspace({},f.deps)
 assert.deepEqual(r.notes,data.notes);assert.match(r.localSnapshot.warning,/저장에 실패/);assert.equal(r.localSnapshot.cachedAt,0)
})
test('invalid metadata cannot replace a valid snapshot; cancellation never falls back or saves',async()=>{
 const f=fixture();await loadWorkspace({},f.deps);f.deps.get=async()=>({folders:null,notes:[]})
 assert.deepEqual((await loadWorkspace({},f.deps)).notes,data.notes);assert.equal(f.calls.save,1)
 const c=new AbortController();c.abort();await assert.rejects(()=>loadWorkspace({signal:c.signal},f.deps));assert.equal(f.calls.save,1)
 assert.throws(()=>validateWorkspace({folders:[],notes:[{id:'n'}]}))
})

test('local creation read failure cannot hide a successful server Workspace',async()=>{
 const f=fixture();f.deps.storage.local=async()=>{throw Error('unknown schema')}
 const r=await loadWorkspace({},f.deps);assert.deepEqual(r.notes,data.notes);assert.match(r.localSnapshot.warning,/생성 목록을 읽지 못했습니다/)
})
