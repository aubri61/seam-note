export type SyncTrigger = 'startup' | 'commit' | 'focus' | 'online' | 'selection' | 'manual' | 'retry'
export const needsFreshPull=(reasons:ReadonlySet<SyncTrigger>)=>reasons.has('manual')||reasons.has('focus')||reasons.has('online')
export type RunOutcome = 'success' | 'retry' | 'halt' | 'auth' | 'review'
export interface SyncClock { now():number; set(fn:()=>void,ms:number):ReturnType<typeof setTimeout>; clear(id:ReturnType<typeof setTimeout>):void }
const browserClock:SyncClock={now:()=>Date.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)}
export const AUTO_SYNC_QUIET_MS=1500
export const AUTO_SYNC_RETRIES=[5000,15000,30000] as const
/** One timer and one run per mounted workspace. The existing Web Lock arbitrates other tabs. */
export class AutoSyncScheduler {
  private timer?:ReturnType<typeof setTimeout>
  private reasons=new Set<SyncTrigger>()
  private running=false
  private disposed=false
  private quietUntil=0
  private lastRun=-Infinity
  private failures=0
  private retryUntil=0
  private halted:false|'auth'|'failure'=false
  private deps:{online:()=>boolean;run:(reasons:ReadonlySet<SyncTrigger>)=>Promise<RunOutcome>;clock?:SyncClock}
  constructor(deps:{online:()=>boolean;run:(reasons:ReadonlySet<SyncTrigger>)=>Promise<RunOutcome>;clock?:SyncClock}){this.deps=deps}
  private get clock(){return this.deps.clock??browserClock}
  input(){this.quietUntil=this.clock.now()+AUTO_SYNC_QUIET_MS;if(this.timer)this.arm()}
  queueChanged(hasWork:boolean){
    if(hasWork)this.request('commit')
    else{this.reasons.delete('commit');if(!this.reasons.size){this.cancelTimer()}}
  }
  request(reason:SyncTrigger){
    if(this.disposed)return
    const now=this.clock.now()
    if(reason==='manual'||reason==='online'){this.halted=false;this.failures=0;this.retryUntil=0}
    // A real return to the app can follow a completed Basic/OAuth login.
    // Only access failures wake this way; permanent/storage failures stay halted.
    if(reason==='focus'&&this.halted==='auth'){this.halted=false;this.failures=0;this.retryUntil=0}
    if(this.halted&&reason!=='manual'&&reason!=='online')return
    // Exhausted network retries can be woken by a real event only after a cooldown.
    if(this.failures>AUTO_SYNC_RETRIES.length&&reason!=='manual'&&reason!=='online'){
      if(now-this.lastRun<60000)return
      this.failures=0;this.retryUntil=0
    }
    if(reason==='commit')this.quietUntil=now+AUTO_SYNC_QUIET_MS
    this.reasons.add(reason)
    if(!this.running)this.arm()
  }
  offline(){this.cancelTimer()}
  private cancelTimer(){if(this.timer!==undefined)this.clock.clear(this.timer);this.timer=undefined}
  private arm(){
    this.cancelTimer()
    if(this.disposed||this.running||!this.reasons.size||!this.deps.online())return
    const now=this.clock.now(),manual=this.reasons.has('manual')
    const lifecycle=this.reasons.has('focus')||this.reasons.has('online')
    const due=manual?now:Math.max(now+150,this.lastRun+3000,this.retryUntil,lifecycle?0:this.quietUntil)
    this.timer=this.clock.set(()=>{this.timer=undefined;void this.execute()},Math.max(0,due-now))
  }
  private async execute(){
    if(this.disposed||this.running||!this.deps.online())return
    const reasons=this.reasons;this.reasons=new Set();this.running=true;this.lastRun=this.clock.now()
    let outcome:RunOutcome
    try{outcome=await this.deps.run(reasons)}catch{outcome='halt'}
    this.running=false
    if(this.disposed)return
    if(outcome==='retry'){
      const delay=AUTO_SYNC_RETRIES[this.failures++]
      this.reasons.delete('commit') // A write failure itself is not another trigger.
      if(delay!==undefined){this.retryUntil=this.clock.now()+delay;this.reasons.add('retry')}
      else{this.reasons.clear()}
    }else{
      this.failures=0;this.retryUntil=0
      if(outcome==='halt'||outcome==='auth'){
        // A login/focus event can arrive while the previous 401 is still in flight.
        const wake=outcome==='auth'?(['manual','online','focus'] as const).find(reason=>this.reasons.has(reason)):undefined
        this.halted=outcome==='auth'?'auth':'failure';this.reasons.clear()
        if(wake)this.request(wake)
      }
    }
    this.arm()
  }
  dispose(){this.disposed=true;this.cancelTimer();this.reasons.clear()}
}
