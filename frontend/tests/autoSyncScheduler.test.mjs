import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {AutoSyncScheduler,needsFreshPull}=await load('features/manual-sync/autoSyncScheduler')
const settle=()=>new Promise(r=>setImmediate(r))
class Clock {
 time=0;next=0;jobs=new Map()
 now=()=>this.time
 set=(fn,ms)=>{const id=++this.next;this.jobs.set(id,{at:this.time+ms,fn});return id}
 clear=id=>this.jobs.delete(id)
 async tick(ms){const end=this.time+ms;for(;;){const due=[...this.jobs].sort((a,b)=>a[1].at-b[1].at).find(([,j])=>j.at<=end);if(!due)break;this.time=due[1].at;this.jobs.delete(due[0]);due[1].fn();await settle()}this.time=end;await settle()}
}
function fixture(run=async()=> 'success'){const clock=new Clock(),calls=[],state={online:true};const scheduler=new AutoSyncScheduler({clock,online:()=>state.online,run:async reasons=>{calls.push({at:clock.now(),reasons:[...reasons]});return run(reasons)}});return {clock,calls,state,scheduler}}
test('startup/focus/online/selection burst coalesces into one run',async()=>{
 const f=fixture();for(const r of ['startup','focus','online','selection'])f.scheduler.request(r)
 await f.clock.tick(149);assert.equal(f.calls.length,0);await f.clock.tick(1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].reasons.length,4)
 await f.clock.tick(100000);assert.equal(f.calls.length,1)
})
test('local commit uses 1500ms of quiet independently of local debounce',async()=>{
 const f=fixture();f.scheduler.queueChanged(true);await f.clock.tick(1000);f.scheduler.input();await f.clock.tick(200);f.scheduler.queueChanged(true)
 await f.clock.tick(1499);assert.equal(f.calls.length,0);await f.clock.tick(1);assert.equal(f.calls.length,1)
})
test('ACK queue changes do not create a success loop',async()=>{
 const f=fixture();f.scheduler.request('startup');await f.clock.tick(150);f.scheduler.queueChanged(false);await f.clock.tick(100000);assert.equal(f.calls.length,1)
})
test('an empty queue cancels a pending commit, but preserves a manual pull',async()=>{
 const f=fixture();f.scheduler.queueChanged(true);f.scheduler.queueChanged(false);await f.clock.tick(5000);assert.equal(f.calls.length,0)
 f.scheduler.request('manual');f.scheduler.queueChanged(false);await f.clock.tick(0);assert.equal(f.calls.length,1)
})
test('focus is throttled to at most one run per three seconds',async()=>{
 const f=fixture();f.scheduler.request('focus');await f.clock.tick(150);for(let i=0;i<8;i++){f.scheduler.request('focus');await f.clock.tick(100)}assert.equal(f.calls.length,1)
 await f.clock.tick(2200);assert.equal(f.calls.length,2)
})
test('offline does not execute; reconnect wakes the pending work',async()=>{
 const f=fixture();f.state.online=false;f.scheduler.request('startup');f.scheduler.queueChanged(true);await f.clock.tick(10000);assert.equal(f.calls.length,0)
 f.state.online=true;f.scheduler.request('online');await f.clock.tick(150);assert.equal(f.calls.length,1)
})
test('going offline cancels an armed timer',async()=>{
 const f=fixture();f.scheduler.queueChanged(true);f.state.online=false;f.scheduler.offline();await f.clock.tick(10000);assert.equal(f.calls.length,0)
})
test('network retries are finite: initial plus 5/15/30-second retries',async()=>{
 const f=fixture(async()=> 'retry');f.scheduler.request('startup');await f.clock.tick(1000000);assert.equal(f.calls.length,4)
 assert.deepEqual(f.calls.map(c=>c.at),[150,5150,20150,50150]);assert.equal(f.clock.jobs.size,0)
})
test('new commits cannot bypass network backoff',async()=>{
 const f=fixture(async()=> 'retry');f.scheduler.request('startup');await f.clock.tick(150);f.scheduler.request('focus');await f.clock.tick(1000);f.scheduler.queueChanged(true)
 await f.clock.tick(3999);assert.equal(f.calls.length,1);await f.clock.tick(1);assert.equal(f.calls.length,2)
})
test('exhausted retry budget needs a real event and cooldown or manual retry',async()=>{
 const f=fixture(async()=> 'retry');f.scheduler.request('startup');await f.clock.tick(50200);f.scheduler.queueChanged(true);await f.clock.tick(1000);assert.equal(f.calls.length,4)
 f.scheduler.request('manual');await f.clock.tick(0);assert.equal(f.calls.length,5)
})
test('permanent halt ignores commits/focus until explicit retry or reconnect',async()=>{
 let result='halt';const f=fixture(async()=>result);f.scheduler.request('startup');await f.clock.tick(150);f.scheduler.queueChanged(true);f.scheduler.request('focus');await f.clock.tick(100000);assert.equal(f.calls.length,1)
 result='success';f.scheduler.request('online');await f.clock.tick(150);assert.equal(f.calls.length,2)
})
test('review never schedules an automatic retry timer',async()=>{
 const f=fixture(async()=> 'review');f.scheduler.request('startup');await f.clock.tick(100000);assert.equal(f.calls.length,1)
})
test('events received during a run yield one bounded follow-up',async()=>{
 let release;const f=fixture(()=>new Promise(ok=>{release=ok}));f.scheduler.request('startup');await f.clock.tick(150)
 f.scheduler.request('focus');f.scheduler.request('selection');f.scheduler.queueChanged(true);await f.clock.tick(10000);assert.equal(f.calls.length,1)
 release('success');await settle();await f.clock.tick(150);assert.equal(f.calls.length,2)
 release('success');await settle();f.scheduler.dispose()
})
test('manual request bypasses input quiet interval and duplicate clicks coalesce',async()=>{
 const f=fixture();f.scheduler.input();f.scheduler.queueChanged(true);f.scheduler.request('manual');f.scheduler.request('manual');await f.clock.tick(0);assert.equal(f.calls.length,1)
})
test('dispose prevents timers and late completion from rearming',async()=>{
 let release;const f=fixture(()=>new Promise(ok=>{release=ok}));f.scheduler.request('startup');await f.clock.tick(150);f.scheduler.queueChanged(true);f.scheduler.dispose();release('retry');await settle();await f.clock.tick(100000);assert.equal(f.calls.length,1)
})

test('startup coalesced with focus/reconnect still forces a fresh server pull',()=>{
 assert.equal(needsFreshPull(new Set(['startup'])),false)
 for(const reason of ['manual','focus','online'])assert.equal(needsFreshPull(new Set(['startup',reason])),true)
 assert.equal(needsFreshPull(new Set(['selection'])),false)
})

test('focus after access is restored wakes an auth halt without an automatic retry loop',async()=>{
 let result='auth';const f=fixture(async()=>result)
 f.scheduler.request('startup');await f.clock.tick(150)
 await f.clock.tick(100000);assert.equal(f.calls.length,1)
 f.scheduler.queueChanged(true);await f.clock.tick(5000);assert.equal(f.calls.length,1)
 result='success';f.scheduler.request('focus');await f.clock.tick(150)
 assert.equal(f.calls.length,2);assert.ok(f.calls[1].reasons.includes('focus'))
 await f.clock.tick(100000);assert.equal(f.calls.length,2)
})
test('returning focus flushes committed input without waiting for the typing quiet interval',async()=>{
 const f=fixture();f.scheduler.input();f.scheduler.queueChanged(true);await f.clock.tick(100)
 f.scheduler.request('focus');await f.clock.tick(149);assert.equal(f.calls.length,0)
 await f.clock.tick(1);assert.equal(f.calls.length,1)
})

test('focus arriving during a failing auth request is retained as one bounded follow-up',async()=>{
 let release;const f=fixture(()=>new Promise(ok=>{release=ok}))
 f.scheduler.request('startup');await f.clock.tick(150)
 f.scheduler.request('focus');release('auth');await settle()
 await f.clock.tick(2999);assert.equal(f.calls.length,1)
 await f.clock.tick(1);assert.equal(f.calls.length,2)
 release('auth');await settle();await f.clock.tick(100000);assert.equal(f.calls.length,2)
})
