// Real production Chrome UI, isolated native IndexedDB and synthetic HTTP mocks only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright'),origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25177',results=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const mobile of [false,true]){
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),p=await ctx.newPage(),a=randomUUID(),b=randomUUID(),folder=randomUUID(),stamp='2026-10-28T00:00:00Z',deletes=[]
  let failDelete=false;const notes=new Map([[a,{id:a,folderId:folder,title:'A title',content:'A body',version:0,sortOrder:0,createdAt:stamp,updatedAt:stamp}],[b,{id:b,folderId:folder,title:'B title',content:'B body',version:0,sortOrder:1,createdAt:stamp,updatedAt:stamp}]])
  await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{const req=r.request(),url=new URL(req.url()),id=url.pathname.split('/').at(-1)
   if(req.method()==='DELETE'){deletes.push(id);if(failDelete)return r.fulfill({status:503,json:{code:'LAB_FAILURE',message:'synthetic failure',errors:[]}});notes.delete(id);return r.fulfill({status:204})}
   assert.equal(req.method(),'GET','menu tests never POST/PUT to any server')
   return r.fulfill({status:url.pathname==='/api/workspace/tree'||notes.has(id)?200:404,json:url.pathname==='/api/workspace/tree'?{folders:[{id:folder,name:'Folder',parentId:null,sortOrder:0,version:0}],notes:[...notes.values()]}:notes.get(id)||{code:'NOTE_NOT_FOUND',message:'synthetic missing',errors:[]}})
  })
  await p.goto(origin+'/notes/'+a);await until(async()=>await p.getByLabel('문서 제목',{exact:true}).inputValue()==='A title','editor')
  if(mobile)await p.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()
  await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click();assert.equal(await p.getByRole('button',{name:'새 최상위 폴더',exact:true}).count(),0)
  await p.getByLabel('폴더 또는 문서 추가',{exact:true}).click()
  const row=p.locator(`[data-node-key="note:${b}"]`);await row.waitFor()
  assert.equal(await row.locator('a button').count(),0,'menu button is not nested in a note link')
  if(!mobile){await row.focus();await p.keyboard.press('Shift+F10')}else await row.getByRole('button',{name:'B title 원고 메뉴',exact:true}).click()
  await p.getByRole('menuitem',{name:'원고 삭제',exact:true}).click();const confirm=p.getByRole('dialog',{name:'원고 영구 삭제'})
  await confirm.waitFor();assert.ok((await confirm.innerText()).includes('B title'));assert.equal(new URL(p.url()).pathname,'/notes/'+a,'opening B menu does not select B')
  await confirm.getByRole('button',{name:'취소',exact:true}).click();assert.equal(deletes.length,0)
  if(mobile){results.push({name:'mobile-note-menu-confirm-cancel-no-navigation',passed:true});await ctx.close();continue}
  await row.getByRole('button',{name:'B title 원고 메뉴',exact:true}).click();await p.getByRole('menuitem',{name:'원고 삭제',exact:true}).click();await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click()
  await until(async()=>await row.count()===0,'B removed');assert.deepEqual(deletes,[b]);assert.equal(new URL(p.url()).pathname,'/notes/'+a)
  assert.equal(await p.getByLabel('Formatting preview (not connected)').getByRole('button',{name:'원고 삭제',exact:true}).count(),0)
  const sync=p.getByRole('button',{name:'모든 변경사항 동기화',exact:true})
  assert.equal(await sync.locator('svg').count(),1);assert.equal(await p.locator('header [data-workspace-sync]').count(),1)
  const before=await sync.evaluate(n=>getComputedStyle(n).filter);await sync.hover();await pause(200);assert.notEqual(await sync.evaluate(n=>getComputedStyle(n).filter),before)
  await p.mouse.down();await pause(150);assert.ok(Number(await sync.evaluate(n=>getComputedStyle(n).scale))<1);await p.mouse.up()
  await p.getByRole('button',{name:'현재 원고 메뉴',exact:true}).click();await p.getByRole('menuitem',{name:'원고 삭제',exact:true}).click();failDelete=true
  await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click();await confirm.getByRole('alert').waitFor();assert.equal(new URL(p.url()).pathname,'/notes/'+a);assert.equal(await p.getByLabel('문서 내용',{exact:true}).inputValue(),'A body')
  failDelete=false;await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click();await until(async()=>await p.getByLabel('문서 내용',{exact:true}).inputValue()==='','empty after A deletion')
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await sync.evaluate(n=>getComputedStyle(n).transitionDuration),'0s')
  results.push({name:'desktop-menus-delete-selected-and-unselected-failure-preservation-sync-icon-effects-reduced-motion',passed:true});await ctx.close()
 }
 fs.writeFileSync(path.join(__dirname,'../../../docs/verification/2026-10-28-note-menus.json'),JSON.stringify({results,chrome:browser.version(),transport:'Synthetic GET/DELETE mocks only. No developer DB access.'},null,2)+'\n');console.log('PASS: note menu groups '+results.length)
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
