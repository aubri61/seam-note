// Current contract: local-first creation; only confirmed server notes may be deleted.
const assert=require('node:assert/strict'),{chromium}=require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SEAM_NOTE_UI_URL||'http://127.0.0.1:25175',f='00000000-0000-4000-8000-000000000201',a='00000000-0000-4000-8000-000000000202',b='00000000-0000-4000-8000-000000000203',stamp='2026-10-26T00:00:00Z'
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await pause(20)}throw Error(label)}
async function main(){const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),folder={id:f,parentId:null,name:'서버 폴더',sortOrder:0,version:0,createdAt:stamp,updatedAt:stamp},notes=new Map([a,b].map((id,i)=>[id,{id,folderId:f,title:'서버 '+i,content:'본문',sortOrder:i,version:0,createdAt:stamp,updatedAt:stamp}]))
 let deletes=0,fail=true
 await page.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,id=path.split('/').at(-1)
  if(req.method()==='GET'){
   if(path==='/api/workspace/tree')return route.fulfill({json:{folders:[folder],notes:[...notes.values()].map(({content,...n})=>n)}})
   assert.ok([a,b].includes(id),'Local uncreated note must not GET server detail');return route.fulfill({status:notes.has(id)?200:404,json:notes.get(id)||{code:'NOTE_NOT_FOUND',message:'deleted',errors:[]}})
  }
  assert.equal(req.method(),'DELETE','Creation must not automatically POST')
  deletes++;if(fail)return route.fulfill({status:500,json:{code:'TEST_FAILURE',message:'삭제 실패',errors:[]}})
  notes.delete(id);return route.fulfill({status:204})
 })
 const title=page.getByLabel('문서 제목'),trash=page.getByRole('button',{name:'원고 삭제',exact:true})
 await page.goto(origin+'/notes/'+a);await until(async()=>await title.inputValue()==='서버 0','initial detail')
 await trash.click();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(deletes,0)
 await trash.click();await page.getByRole('button',{name:'영구 삭제',exact:true}).click();await page.getByText(/요청을 완료하지 못했습니다/).waitFor();assert.ok(page.url().endsWith(a));await page.getByRole('button',{name:'취소',exact:true}).click()
 fail=false;await trash.click();await page.getByRole('button',{name:'영구 삭제',exact:true}).click();await until(()=>page.url().endsWith(b),'deletion selects remaining note');assert.equal(deletes,2)
 await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByRole('button',{name:'새 최상위 폴더',exact:true}).click();await page.getByLabel('새 폴더 이름',{exact:true}).fill('로컬 새 폴더');await page.getByLabel('새 폴더 이름',{exact:true}).press('Enter')
 await page.getByText('로컬 새 폴더',{exact:true}).waitFor();await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click();await page.getByLabel('추가할 항목',{exact:true}).getByRole('button',{name:'새 문서',exact:true}).click();await until(()=>!page.url().endsWith(b),'new local note route')
 await until(async()=>await title.getAttribute('readonly')===null,'local Draft');await title.fill('새 로컬 제목');await page.getByLabel('문서 내용').fill('새 로컬 원고');assert.equal(await trash.isDisabled(),true)
 await page.getByRole('button',{name:'서버 목록 다시 확인',exact:true}).click();assert.equal(await title.inputValue(),'새 로컬 제목')
 await pause(600);const url=page.url();await page.reload();await until(async()=>await title.inputValue()==='새 로컬 제목','reload local created note');assert.equal(page.url(),url);assert.equal(deletes,2)
 console.log('PASS: original plus placement, local folder naming/root creation, blank Draft/URL/edit/reload, GET merge, no automatic POST; confirmed server delete cancel/failure/success/selection; local delete blocked')
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
