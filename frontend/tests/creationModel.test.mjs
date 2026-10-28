import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {creationOperation,validateCreation}=await load('features/outbox/creationModel')
const id='00000000-0000-4000-8000-000000000111',folderId='00000000-0000-4000-8000-000000000112'
test('creation snapshots use distinct keys and reject missing parent/type/invalid IDs',()=>{
 const f=creationOperation(id,{type:'FOLDER_CREATE',payload:{id,parentId:null,name:'folder'}})
 assert.equal(f.status,'pending');assert.equal(f.attemptedAt,null);assert.equal(validateCreation(f),f)
 assert.notEqual(f.operationId,creationOperation(id,{type:'FOLDER_CREATE',payload:f.payload}).operationId)
 for(const p of [{...f,entityId:folderId},{...f,status:'inFlight'},{...f,payload:{...f.payload,name:'  '}},{...f,payload:{...f.payload,parentId:'bad'}}])assert.throws(()=>validateCreation(p))
})
test('NOTE_CREATE is distinct from NOTE_UPDATE and carries no expected server version',()=>{
 const n=creationOperation(id,{type:'NOTE_CREATE',payload:{id,folderId,title:'',content:''},localRevision:1})
 assert.equal(n.type,'NOTE_CREATE');assert.equal('expectedVersion' in n,false)
 assert.throws(()=>validateCreation({...n,localRevision:0}));assert.throws(()=>validateCreation({...n,payload:{...n.payload,title:'x'.repeat(201)}}))
})
