// Synthetic GET-only production browser test. No development DB access.
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25177'
const id='d0000000-0000-4000-8000-000000000001',folderId='d0000000-0000-4000-8000-000000000002'
const note={id,folderId,title:'Synthetic viewport manuscript',content:'Synthetic first line',sortOrder:0,version:0,createdAt:'2026-10-28T00:00:00Z',updatedAt:'2026-10-28T00:00:00Z'}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],writes=[]
 try{
 for(const viewport of [{width:1182,height:1340},{width:1280,height:720},{width:390,height:844}]){
 const ctx=await browser.newContext({viewport,serviceWorkers:'block'})
 await ctx.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname
 if(req.method()!=='GET'){writes.push({method:req.method(),path});return route.abort()}
 const data=path==='/api/workspace/tree'?{folders:[{id:folderId,parentId:null,name:'Synthetic folder',sortOrder:0,version:0}],notes:[note]}:path===`/api/notes/${id}`?note:null
 await route.fulfill({status:data?200:404,contentType:'application/json',body:JSON.stringify(data||{code:'NOTE_NOT_FOUND',message:'Not found'})})
 })
 const page=await ctx.newPage();await page.goto(`${origin}/notes/${id}`)
 const input=page.getByLabel('문서 내용',{exact:true})
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='Synthetic first line')
 const measure=()=>input.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,documentHeight:document.documentElement.scrollHeight,resize:getComputedStyle(el).resize}})
 const before=await measure()
 assert.ok(before.bottom>=viewport.height-60,JSON.stringify(before));assert.ok(before.bottom<=viewport.height,JSON.stringify(before));assert.equal(before.resize,'none')
 await input.fill(Array.from({length:150},(_,i)=>`Synthetic line ${i}`).join('\n'))
 await input.evaluate(el=>{el.scrollTop=el.scrollHeight})
 assert.ok(await input.evaluate(el=>el.scrollTop>0&&el.scrollTop+el.clientHeight>=el.scrollHeight-2))
 await ctx.setOffline(true)
 const offline=page.getByRole('status').filter({hasText:'현재 오프라인 작업 중'})
 await offline.waitFor();assert.equal(await offline.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)')
 assert.equal(await page.getByRole('button',{name:'모든 변경사항 동기화',exact:true}).count(),0)
 await ctx.setOffline(false);await page.getByRole('button',{name:'모든 변경사항 동기화',exact:true}).waitFor()
 assert.equal(await offline.count(),0)
 results.push({viewport,textarea:before,longContentScrollable:true,offlineReplacement:true,reconnectRestored:true})
 await ctx.close()
 }
 assert.equal(writes.length,0)
 const report={environment:'Headless Chromium production build, isolated ephemeral contexts, service workers blocked; native installed-window chrome not exercised',results,serverWrites:writes.length}
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-28-editor-viewport.json',`file://${__filename}`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
