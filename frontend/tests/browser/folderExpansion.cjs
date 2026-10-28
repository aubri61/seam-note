// Isolated Chrome profile and mocked API only; never access the development DB/profile.
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const key = 'seam-note:expanded-folders:v1'
const noteId = '00000000-0000-4000-8000-000000000801'
const stamp = '2026-10-27T00:00:00Z'
const ids = {root:'00000000-0000-4000-8000-000000000802',child:'00000000-0000-4000-8000-000000000803'}
const folder = (id, parentId) => ({ id:ids[id], parentId:parentId ? ids[parentId] : null, name: id, sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp })
const note = { id: noteId, folderId: ids.child, title: 'mock note', content: 'mock content', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const row = (page, id) => page.locator(`[data-node-key="folder:${ids[id] || id}"]`)
async function mock(context) {
 await context.route(url => url.pathname.startsWith('/api/'), route => {
  assert.equal(route.request().method(), 'GET', 'No server mutation')
  return route.fulfill({json: new URL(route.request().url()).pathname === '/api/workspace/tree'
   ? {folders:[folder('root',null),folder('child','root')],notes:[note]} : note})
 })
}
async function ready(page) { await page.getByLabel('문서 제목').waitFor(); await page.waitForFunction(() => document.querySelector('[aria-label="문서 제목"]')?.value === 'mock note') }
async function expanded(page,id,value) { assert.equal(await row(page,id).getAttribute('aria-expanded'), String(value)) }
async function stored(page,ids) { await page.waitForFunction(({key,ids}) => localStorage.getItem(key) === JSON.stringify(ids),{key,ids}) }
async function main() {
 const profile = mkdtempSync(join(tmpdir(),'seam-folder-pref-'))
 let context
 const errors=[]
 try {
  context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1360,height:900}})
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)))
  await mock(context)
  let page=await context.newPage()
  await page.goto(origin+'/notes/'+noteId);await ready(page)
  await expanded(page,'root',true);await expanded(page,'child',true)
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null,'automatic defaults are not user preferences')
  await row(page,'child').click();await stored(page,[ids.root])
  await row(page,'root').click();await stored(page,[])
  await page.reload();await ready(page);await expanded(page,'root',false)
  await context.close();context=null
  // A new Chromium process with the same isolated profile restores valid [] on direct URL.
  context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1360,height:900}})
  await mock(context);page=await context.newPage()
  await page.goto(origin+'/notes/'+noteId);await ready(page);await expanded(page,'root',false)
  await row(page,'root').focus();await page.keyboard.press('ArrowRight');await expanded(page,'root',true);await stored(page,[ids.root])
  await expanded(page,'child',false)
  await row(page,'root').focus();await page.keyboard.press('ArrowLeft');await stored(page,[])
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()
  await expanded(page,'root',false);await row(page,'root').click();await stored(page,[ids.root])
  await page.setViewportSize({width:1360,height:900});await page.reload();await ready(page)
  await expanded(page,'root',true);await expanded(page,'child',false)
  // New local folder explicitly reveals its creation path and persists it.
  await page.getByLabel('폴더 또는 문서 추가',{exact:true}).click()
  await page.getByRole('button',{name:'새 폴더',exact:true}).click()
  await page.getByLabel('새 폴더 이름',{exact:true}).fill('new local folder')
  await page.getByLabel('새 폴더 이름',{exact:true}).press('Enter')
  const created=page.getByRole('treeitem',{name:/new local folder/})
  await created.waitFor();const createdKey=await created.getAttribute('data-node-key')
  await page.reload();await ready(page)
  await page.locator(`[data-node-key="${createdKey}"]`).waitFor()
  // Deleted/unknown IDs are harmless and do not force current ancestors open.
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify(['deleted-id'])),key)
  await page.reload();await ready(page);await expanded(page,'root',false)
  await page.evaluate(key=>localStorage.setItem(key,'{broken'),key)
  await page.reload();await ready(page);await expanded(page,'root',true);await expanded(page,'child',true)
  await context.close();context=null
  // Storage unavailable: initial auto reveal and all keyboard/click operations remain usable.
  context=await chromium.launchPersistentContext(join(profile,'blocked'),{channel:'chrome',headless:true})
  await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked test storage')}})})
  await mock(context);page=await context.newPage();await page.goto(origin+'/notes/'+noteId);await ready(page)
  await expanded(page,'root',true);await row(page,'root').click();await expanded(page,'root',false)
  assert.deepEqual(errors,[])
  console.log('PASS: missing/default, collapse [], reload, actual Chrome restart/direct URL, keyboard, mobile, local creation/reload, unknown deleted ID, corrupt JSON, blocked storage; mock GET only')
 } finally {if(context)await context.close();rmSync(profile,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
