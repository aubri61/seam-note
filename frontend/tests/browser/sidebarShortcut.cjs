// Native Chrome key events, ephemeral profiles, GET-only synthetic API.
const assert=require('node:assert/strict'),fs=require('node:fs')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25183'
const id='f0000000-0000-4000-8000-000000000001',folder='f0000000-0000-4000-8000-000000000002'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),results=[];try{
 for(const mobile of [false,true]){
 const ctx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},serviceWorkers:'block'}),p=await ctx.newPage();let writes=0
 const note={id,folderId:folder,title:'Synthetic sidebar shortcut',content:'Synthetic body',version:0,sortOrder:0,createdAt:'2026-10-28T00:00:00Z',updatedAt:'2026-10-28T00:00:00Z'}
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{if(r.request().method()!=='GET'){writes++;return r.abort()}return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:folder,parentId:null,name:'Test folder',version:0,sortOrder:0}],notes:[note]}:note})})
 await p.goto(origin+'/notes/'+id);const toggle=p.locator('button[aria-controls="folders-sidebar"]'),body=p.getByLabel('문서 내용',{exact:true})
 await until(async()=>await body.inputValue()===note.content,'ready')
 await p.evaluate(()=>{window.__sidebarKeys=[];window.addEventListener('keydown',e=>{if(e.code==='KeyB')queueMicrotask(()=>window.__sidebarKeys.push(e.defaultPrevented))})})
 const open=async()=>await toggle.getAttribute('aria-expanded')==='true'
 assert.equal(await open(),!mobile);assert.equal(await toggle.getAttribute('aria-keyshortcuts'),'Meta+B Control+B')
 await body.fill('Preserved draft');await p.keyboard.press('Meta+b');await until(async()=>await open()===mobile,'Meta B toggles')
 if(mobile){await p.getByRole('dialog',{name:'폴더 사이드바',exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.querySelector('[role="dialog"]')?.contains(document.activeElement)))}
 await p.keyboard.press('Control+b');await until(async()=>await open()===!mobile,'Control B toggles back')
 if(mobile)await until(()=>toggle.evaluate(el=>el===document.activeElement),'drawer restores opener')
 assert.equal(await body.inputValue(),'Preserved draft')
 // Focus a sidebar tree row, then close it; focus must not remain hidden/inert.
 if(mobile){await p.keyboard.press('Meta+b');await until(open,'drawer opened again')}
 const row=p.getByRole('treeitem',{name:'Synthetic sidebar shortcut',exact:true});await row.focus();await p.keyboard.press('Control+b');await until(async()=>!await open(),'close while focused in tree')
 await until(()=>toggle.evaluate(el=>el===document.activeElement),'focus returned to toggle')
 const before=await open()
 await p.evaluate(()=>{const modal=document.createElement('div');modal.id='synthetic-other-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');document.body.append(modal)})
 await p.keyboard.press('Meta+b');assert.equal(await open(),before);await p.evaluate(()=>document.getElementById('synthetic-other-modal').remove())
 const flags=await p.evaluate(()=>{const send=options=>{const event=new KeyboardEvent('keydown',{key:'b',code:'KeyB',bubbles:true,cancelable:true,...options});window.dispatchEvent(event);return event.defaultPrevented};return {repeat:send({ctrlKey:true,repeat:true}),shift:send({ctrlKey:true,shiftKey:true}),alt:send({ctrlKey:true,altKey:true}),plain:send({}),composing:send({ctrlKey:true,isComposing:true})}})
 assert.deepEqual(flags,{repeat:true,shift:false,alt:false,plain:false,composing:false});assert.equal(await open(),before)
 await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'ㅠ',code:'KeyB',ctrlKey:true,bubbles:true,cancelable:true})))
 await until(async()=>await open()!==before,'physical KeyB in Korean layout')
 const keys=await p.evaluate(()=>window.__sidebarKeys);assert.ok(keys.slice(0,mobile?5:4).every(Boolean))
 assert.equal(writes,0);results.push({mobile,commandB:true,controlB:true,editorDraftPreserved:true,focusRestored:true,otherModalBlocked:true,koreanPhysicalKey:true,repeatModifierGuards:true,apiWrites:writes});await ctx.close()
 }
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-28-sidebar-shortcut.json',`file://${__filename}`),JSON.stringify({results},null,2)+'\n');console.log(results)
 }finally{await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
