// Real keyboard events, isolated profile and synthetic API only; no development DB writes.
const assert=require('node:assert/strict'),fs=require('node:fs')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25183'
const id='e0000000-0000-4000-8000-000000000001',folder='e0000000-0000-4000-8000-000000000002'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<350;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),p=await ctx.newPage(),puts=[]
 let server={id,folderId:folder,title:'Synthetic shortcut',content:'Initial synthetic',version:0,sortOrder:0,createdAt:'2026-10-28T00:00:00Z',updatedAt:'2026-10-28T00:00:00Z'},release
 const gate=new Promise(ok=>release=ok)
 await ctx.route(u=>u.pathname.startsWith('/api/'),async r=>{
  const req=r.request(),path=new URL(req.url()).pathname
  if(req.method()==='PUT'){
   const payload=req.postDataJSON(),key=req.headers()['idempotency-key'];puts.push({payload,key})
   if(puts.length===1)await gate
   assert.equal(payload.expectedVersion,server.version)
   server={...server,title:payload.title,content:payload.content,version:server.version+1}
   return r.fulfill({json:server,headers:{'Idempotency-Key':key}})
  }
  assert.equal(req.method(),'GET')
  return r.fulfill({json:path==='/api/workspace/tree'?{folders:[{id:folder,parentId:null,name:'Synthetic folder',sortOrder:0,version:0}],notes:[server]}:server})
 })
 await p.goto(origin+'/notes/'+id)
 const body=p.getByLabel('문서 내용',{exact:true}),title=p.getByLabel('문서 제목',{exact:true}),sync=p.getByRole('button',{name:'모든 변경사항 동기화',exact:true})
 await until(async()=>await body.inputValue()==='Initial synthetic'&&await sync.isEnabled(),'ready')
 await p.evaluate(()=>{window.__shortcutEvents=[];window.addEventListener('keydown',e=>{if(e.code==='KeyS')queueMicrotask(()=>window.__shortcutEvents.push({prevented:e.defaultPrevented,ctrl:e.ctrlKey,meta:e.metaKey}))})})
 assert.equal(await sync.getAttribute('aria-keyshortcuts'),'Meta+S Control+S')
 await title.fill('Edited synthetic title');await body.fill('Immediate before debounce A');await p.keyboard.press('Meta+s')
 await until(()=>puts.length===1,'Command S sends');assert.equal(puts[0].payload.content,'Immediate before debounce A');assert.equal(puts[0].payload.title,'Edited synthetic title')
 await p.keyboard.press('Control+s');await p.keyboard.press('Meta+s');await pause(150);assert.equal(puts.length,1)
 release();await until(()=>sync.isEnabled(),'first ACK completed')
 await body.fill('Immediate before debounce B');await p.keyboard.press('Control+s')
 await until(()=>puts.length===2,'Control S sends');await until(()=>sync.isEnabled(),'second ACK completed')
 assert.equal(server.content,'Immediate before debounce B');assert.equal(server.version,2);assert.equal(puts[1].payload.expectedVersion,1);assert.notEqual(puts[0].key,puts[1].key)
 await ctx.setOffline(true);await p.getByText('현재 오프라인 작업 중',{exact:true}).waitFor();await body.fill('Offline retained C');await p.keyboard.press('Control+s');await pause(150);assert.equal(puts.length,2);assert.equal(await body.inputValue(),'Offline retained C')
 await ctx.setOffline(false);await sync.waitFor();await until(()=>sync.isEnabled(),'online again')
 await p.evaluate(()=>{const el=document.createElement('div');el.id='synthetic-modal';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.append(el)})
 await p.keyboard.press('Meta+s');await pause(150);assert.equal(puts.length,2)
 await p.evaluate(()=>document.getElementById('synthetic-modal').remove())
 const flags=await p.evaluate(()=>{const send=options=>{const e=new KeyboardEvent('keydown',{key:'s',code:'KeyS',bubbles:true,cancelable:true,...options});window.dispatchEvent(e);return e.defaultPrevented};return {repeat:send({ctrlKey:true,repeat:true}),shift:send({ctrlKey:true,shiftKey:true}),alt:send({ctrlKey:true,altKey:true}),composing:send({ctrlKey:true,isComposing:true}),plain:send({})}})
 assert.deepEqual(flags,{repeat:true,shift:false,alt:false,composing:false,plain:false});assert.equal(puts.length,2)
 const events=await p.evaluate(()=>window.__shortcutEvents);assert.ok(events.filter(e=>e.ctrl||e.meta).slice(0,6).every(e=>e.prevented))
 const result={commandS:true,controlS:true,nativeSavePrevented:true,duplicateWhileBusyBlocked:true,latestInputFlushed:true,offlinePreservesInputAndNoSend:true,modalBlocksSend:true,repeatAndModifierGuards:flags,syntheticPuts:puts.length,finalServerVersion:server.version,developmentDbWrites:0}
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-28-save-shortcut.json',`file://${__filename}`),JSON.stringify(result,null,2)+'\n');console.log(result)
 await ctx.close()
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
