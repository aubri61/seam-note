import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { AxiosError } from 'axios'
import { load } from './helpers/loadModules.mjs'
const { createRefreshCoordinator } = await load('features/auth/refreshCoordinator')
const { apiClient, configureAuthRecovery, postJsonWithOperation, getJson } = await load('lib/api/client')
const { accessTokenStore } = await load('features/auth/accessTokenStore')
const adapter=apiClient.defaults.adapter
const token='header.payload.signature'
const failure=(config,status=401)=>new AxiosError('HTTP',undefined,config,undefined,{config,status,data:{code:'DENIED',message:'거부',errors:[]},headers:{}})
afterEach(()=>{configureAuthRecovery(undefined);apiClient.defaults.adapter=adapter;accessTokenStore.clear()})
test('parallel callers share one refresh and failures allow a subsequent attempt',async()=>{
 let calls=0,finish
 const run=createRefreshCoordinator(()=>{calls++;return new Promise(resolve=>{finish=resolve})},action=>action())
 const a=run(),b=run();assert.equal(a,b);assert.equal(calls,1);finish('done');assert.equal(await a,'done')
 let failures=0
 const broken=createRefreshCoordinator(async()=>{failures++;throw new Error('offline')},action=>action())
 await assert.rejects(broken());await assert.rejects(broken());assert.equal(failures,2)
})
test('retry preserves operation key and exact payload once after refresh',async()=>{
 const generation=accessTokenStore.begin();accessTokenStore.complete(generation,token,300)
 let calls=0,refreshes=0;const sent=[]
 configureAuthRecovery(async()=>{refreshes++;accessTokenStore.complete(generation,'newHeader.newPayload.newSignature',300)})
 apiClient.defaults.adapter=async config=>{sent.push([config.data,config.headers.get('Idempotency-Key')]);if(++calls===1)throw failure(config);return {config,status:201,data:{id:'created'},headers:{'idempotency-key':'fixed-key'}}}
 const result=await postJsonWithOperation('/notes',{content:'preserve'},'fixed-key')
 assert.equal(result.body.id,'created');assert.equal(refreshes,1);assert.deepEqual(sent[0],sent[1])
})
test('403 never refreshes and repeated 401 does not recurse',async()=>{
 let refreshes=0,calls=0;configureAuthRecovery(async()=>{refreshes++})
 apiClient.defaults.adapter=async config=>{calls++;throw failure(config,403)}
 await assert.rejects(getJson('/notes'));assert.equal(refreshes,0)
 apiClient.defaults.adapter=async config=>{calls++;throw failure(config)}
 await assert.rejects(getJson('/notes'));assert.equal(refreshes,1);assert.equal(calls,3)
})
test('logout while refreshing prevents request replay into another generation',async()=>{
 let calls=0;configureAuthRecovery(async()=>{accessTokenStore.clear()})
 apiClient.defaults.adapter=async config=>{calls++;throw failure(config)}
 await assert.rejects(getJson('/notes'));assert.equal(calls,1)
})
