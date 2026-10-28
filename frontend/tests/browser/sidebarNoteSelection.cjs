const assert=require('node:assert/strict'),fs=require('node:fs')
const {chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25179'
const idA='a0000000-0000-4000-8000-000000000001',idB='a0000000-0000-4000-8000-000000000002',folder='a0000000-0000-4000-8000-000000000003'
const notes=[idA,idB].map((id,i)=>({id,folderId:folder,title:'Synthetic '+i,content:'body '+i,version:0,sortOrder:i,createdAt:'2026-10-28T00:00:00Z',updatedAt:'2026-10-28T00:00:00Z'}))
async function main(){const b=await chromium.launch({channel:'chrome',headless:true}),results=[];try{
 for(const mobile of [false,true]){
 const ctx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},serviceWorkers:'block'});let writes=0,loads=0
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{if(r.request().method()!=='GET'){writes++;return r.abort()}return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:folder,parentId:null,name:'Test',sortOrder:0,version:0}],notes}:notes.find(n=>r.request().url().endsWith(n.id))})})
 const p=await ctx.newPage();p.on('load',()=>loads++);await p.goto(`${origin}/notes/${idA}`)
 const title=p.getByLabel('문서 제목',{exact:true}),body=p.getByLabel('문서 내용',{exact:true})
 await p.waitForFunction(()=>document.querySelector('input[aria-label="문서 제목"]')?.value==='Synthetic 0');await body.fill('Unsaved A')
 const open=async()=>{if(mobile)await p.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()}
 await open();await p.getByRole('link',{name:'Synthetic 1',exact:true}).click();await p.waitForURL(`**/notes/${idB}`)
 await p.waitForFunction(()=>document.querySelector('input[aria-label="문서 제목"]')?.value==='Synthetic 1')
 await p.goBack();await p.waitForURL(`**/notes/${idA}`);await p.waitForFunction(()=>document.querySelector('textarea')?.value==='Unsaved A');assert.equal(await body.inputValue(),'Unsaved A')
 await p.goForward();await p.waitForURL(`**/notes/${idB}`)
 await open();const row=p.getByRole('treeitem',{name:'Synthetic 0',exact:true});await row.focus();await row.press('Enter');await p.waitForURL(`**/notes/${idA}`);await p.waitForFunction(()=>document.querySelector('textarea')?.value==='Unsaved A');assert.equal(await body.inputValue(),'Unsaved A')
 assert.equal(loads,1);assert.equal(writes,0);results.push({mobile,clickChangesURL:true,keyboardSelects:true,backForwardDraftPreserved:true,documentLoads:loads,writes})
 await ctx.close()
 }
 fs.writeFileSync(new URL('../../../docs/verification/2026-10-28-sidebar-selection.json',`file://${__filename}`),JSON.stringify({before:'Reproduced unchanged URL/title after Link click: preventDefault + select() without navigate.',results},null,2)+'\n');console.log(results)
 }finally{await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
