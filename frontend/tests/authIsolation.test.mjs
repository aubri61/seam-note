import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { load } from './helpers/loadModules.mjs'
const runtime=await load('features/auth/authRuntime')
const { apiClient,getJson,postJsonWithOperation }=await load('lib/api/client')
const { accessTokenStore }=await load('features/auth/accessTokenStore')
const adapter=apiClient.defaults.adapter
const a={id:'00000000-0000-4000-8000-000000000001',issuer:'urn:local',audience:'local-api',nickname:'A'}
afterEach(()=>{apiClient.defaults.adapter=adapter;runtime.setBusinessAccess(true);accessTokenStore.clear();delete globalThis.localStorage})
test('account namespace separates user issuer audience and origin without collisions',()=>{
 const base=runtime.accountNamespace('db',a,'http://localhost:5173')
 for(const other of [{...a,id:'00000000-0000-4000-8000-000000000002'},{...a,issuer:'urn:production'},{...a,audience:'another-api'}])assert.notEqual(base,runtime.accountNamespace('db',other,'http://localhost:5173'))
 assert.notEqual(base,runtime.accountNamespace('db',a,'https://app.example'))
 assert.equal(runtime.sameAccount(a,{...a,nickname:'changed'}),true)
 assert.equal(runtime.sameAccount(a,{...a,issuer:'urn:new-server'}),false)
 assert.equal(runtime.parseAccount('{broken'),null);assert.equal(runtime.parseAccount(JSON.stringify({...a,id:'untrusted'})),null)
})
test('unknown/offline identity blocks business writes before Axios but keeps auth endpoint available',async()=>{
 runtime.setBusinessAccess(false);let calls=0
 apiClient.defaults.adapter=async config=>{calls++;return {config,status:200,data:{ok:true},headers:{}}}
 await assert.rejects(postJsonWithOperation('/notes',{content:'private'},'fixed'),e=>e.code==='AUTH_OFFLINE')
 assert.equal(calls,0);await getJson('/auth/csrf');assert.equal(calls,1)
})
test('late previous generation response cannot enter UI or ACK',async()=>{
 let finish;apiClient.defaults.adapter=config=>new Promise(resolve=>{finish=()=>resolve({config,status:200,data:{private:'A'},headers:{}})})
 const request=getJson('/notes/private');accessTokenStore.clear();finish()
 await assert.rejects(request,e=>e.code==='AUTH_ACCOUNT_CHANGED'&&!JSON.stringify(e).includes('private'))
})
test('failed account-transition flush preserves the mounted draft and stops transition',async()=>{
 const values=new Map();globalThis.localStorage={setItem:(key,value)=>values.set(key,value)}
 const memory={content:'uncommitted original manuscript'}
 const unregister=runtime.registerDraftFlush(async()=>{throw new Error('QuotaExceededError')})
 try {await assert.rejects(runtime.prepareAuthChange());assert.equal(memory.content,'uncommitted original manuscript');assert.equal(runtime.businessAccess(),true)}finally{unregister()}
 let flushed=0;const done=runtime.registerDraftFlush(async()=>{flushed++})
 try{await runtime.prepareAuthChange();assert.equal(flushed,1);assert.equal(runtime.businessAccess(),false)}finally{done()}
})
