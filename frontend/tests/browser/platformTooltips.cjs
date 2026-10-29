// Isolated browser contexts, synthetic GET-only API; no user DB/profile access.
const assert=require('node:assert/strict'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
async function main(){const b=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [platform,mod] of [['macOS','⌘'],['Windows','Ctrl+']]){
 const ctx=await b.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await ctx.addInitScript(platform=>{Object.defineProperty(navigator,'userAgentData',{value:{platform},configurable:true})},platform)
 const p=await ctx.newPage(),id='ac000000-0000-4000-8000-000000000001',folder='ac000000-0000-4000-8000-000000000002',note={id,folderId:folder,title:'Test',content:'{"type":"doc","content":[{"type":"paragraph"}]}',version:0,sortOrder:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z'}
 await ctx.route(u=>u.pathname.startsWith('/api/'),r=>{assert.equal(r.request().method(),'GET');return r.fulfill({json:new URL(r.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:folder,parentId:null,name:'Folder',sortOrder:0,version:0}],notes:[note]}:note})})
 await p.goto('http://127.0.0.1:25213/notes/'+id)
 const editor=p.getByRole('textbox',{name:'문서 내용',exact:true});await editor.waitFor()
 await p.getByLabel('문서 제목',{exact:true}).focus();await p.keyboard.press('Tab');assert.equal(await editor.evaluate(el=>el===document.activeElement),true)
 await editor.fill('Synthetic text')
 for(const [name,key] of [['굵게','B'],['기울임','I'],['실행 취소','Z'],['사이드바 접기','\\'],['사이드바 닫기','\\']]){
  await p.getByRole('button',{name,exact:true}).hover();const tip=p.getByRole('tooltip');await tip.waitFor();const text=await tip.innerText()
  assert.ok(text.includes(mod+key),text);assert.ok(!text.includes(platform==='macOS'?'Ctrl+':'⌘'),text)
  await p.mouse.move(1400,980);await tip.waitFor({state:'hidden'})
 }
 await p.getByRole('button',{name:'사이드바 닫기',exact:true}).click()
 await p.getByRole('button',{name:'사이드바 펼치기',exact:true}).hover();await p.getByRole('tooltip').waitFor();assert.ok((await p.getByRole('tooltip').innerText()).includes(mod+'\\'))
 assert.equal(await p.getByText(/미동기화 작업 \d+개/).count(),0)
 assert.equal(await p.getByText('A little room for everything on your mind.').count(),0)
 assert.equal(await p.getByText('로컬 저장과 서버 동기화는 별개입니다.').count(),0)
 console.log('PASS:',platform,'title Tab, both sidebar controls, platform shortcuts, removed summary/footer');await ctx.close()
 }
 }finally{await b.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
