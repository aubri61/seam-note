// Research harness only. Product modules are imported without modifying their source.
// All HTTP API calls are intercepted. Every context has a fresh ephemeral browser store.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID, createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.env.SEAM_NOTE_PLAYWRIGHT_MODULE || '/Users/jueon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const root = path.resolve(__dirname, '../../..')
const origin = process.env.SEAM_NOTE_UI_URL || 'http://127.0.0.1:25173'
const historicalOrigin = process.env.SEAM_NOTE_HISTORY_URL || 'http://127.0.0.1:25174'
const phase = process.argv[2] || 'recovery'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const sha = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
function percentile(values, p) { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? sorted[Math.ceil(sorted.length*p)-1] : null }
function stats(values) { return { n: values.length, min: Math.min(...values), p50: percentile(values,.5), p95: percentile(values,.95), p99: percentile(values,.99), max: Math.max(...values) } }
async function until(check, label, timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await pause(10) }
  throw Error('Timeout: ' + label)
}
function fixture(id, dirty = true) {
  return { noteId: id, title: 'fixture-title', content: dirty ? 'L'.repeat(20000) : 'S'.repeat(20000), baseTitle: 'fixture-title', baseContent: 'S'.repeat(20000), baseVersion: 2, latestServerVersion: 2, localRevision: 7, localSavedAt: 1, storageToken: 'seed-token', writerId: 'fixture-writer' }
}
async function setupPage(context, cfg = {}) {
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const id = cfg.id || randomUUID()
  const note = { id, folderId: 'folder', title: 'fixture-title', content: 'S'.repeat(20000), version: cfg.serverVersion || 1, sortOrder: 0, createdAt: '', updatedAt: '' }
  const gets = []
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    assert.equal(route.request().method(), 'GET', 'Research must never issue server writes')
    const apiPath = new URL(route.request().url()).pathname
    gets.push(apiPath)
    if (apiPath === '/api/workspace/tree') return route.fulfill({ json: {
      folders: [{ id: 'folder', parentId: null, name: 'fixture-folder', sortOrder: 0, version: 0, createdAt: '', updatedAt: '' }],
      notes: [{ id, folderId: 'folder', title: note.title, version: note.version, sortOrder: 0, updatedAt: '' }],
    } })
    assert.equal(apiPath, '/api/notes/' + id)
    if (cfg.sdelay) await pause(cfg.sdelay)
    return route.fulfill({ json: note })
  })
  await page.route(url => url.pathname === '/measurement-shell', async route => {
    const response = await route.fetch({ url: origin + '/' })
    const html = (await response.text()).replace(/<script[^>]*src=["']\/src\/main\.tsx["'][^>]*>\s*<\/script>/, '')
    await route.fulfill({ response, body: html })
  })
  await page.goto(origin + '/measurement-shell')
  await page.evaluate(async ({ id, cfg, seed }) => {
    const { draftRepository: repo, draftDatabase: db } = await import('/src/features/local-drafts/draftDatabase.ts')
    const { apiClient } = await import('/src/lib/api/client.ts')
    if (cfg.seed !== false) await db.drafts.put(seed)
    const read = repo.read.bind(repo), write = repo.write.bind(repo)
    const m = window.m = { t0: performance.now(), reads: 0, attempts: 0, commits: 0, cas: 0, failures: 0, active: 0, maxActive: 0, inputEvents: 0, commitsTrace: [], order: [], naiveContent: null }
    m.sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2,'0')).join('')
    apiClient.interceptors.response.use(response => {
      if (response.config.url === '/notes/' + id) {
        m.serverFinished = performance.now() - m.t0; m.naiveContent = response.data.content; m.order.push('server')
      }
      return response
    })
    repo.read = async key => {
      const first = ++m.reads === 1
      if (first) { m.localStarted = performance.now() - m.t0; if (cfg.ldelay) await new Promise(resolve => setTimeout(resolve,cfg.ldelay)) }
      const value = await read(key)
      if (first) { m.localFinished = performance.now() - m.t0; m.naiveContent = value?.content; m.order.push('local') }
      return value
    }
    repo.write = async (...args) => {
      m.attempts++; m.active++; m.maxActive = Math.max(m.maxActive,m.active)
      const start = performance.now()
      try {
        if (cfg.wdelay) await new Promise(resolve => setTimeout(resolve,cfg.wdelay))
        const value = await write(...args)
        m.commits++; m.commitsTrace.push({ revision: value.localRevision, at: performance.now(), duration: performance.now()-start, contentHash: await m.sha(value.content) })
        return value
      } catch(error) {
        if (error.name === 'LocalDraftConflict') m.cas++; else m.failures++
        throw error
      } finally { m.active-- }
    }
    history.replaceState({}, '', '/notes/' + id)
    if (cfg.app !== false) await import('/src/main.tsx')
  }, { id, cfg, seed: fixture(id, cfg.dirty !== false) })
  return { page, id, gets, server: note }
}
async function exportRecovery(page, id) {
  return page.evaluate(async id => {
    const m = window.m
    const db = (await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase
    const local = await db.drafts.get(id)
    const content = document.querySelector('[aria-label="문서 내용"]').value
    return { id, baseVersion: local.baseVersion, serverVersion: 1, localFinishedMs: m.localFinished, serverFinishedMs: m.serverFinished, localReadDurationMs: m.localFinished-m.localStarted, completionOrder: m.order, finalHash: await m.sha(content), localHash: await m.sha(local.content), naiveFinalHash: await m.sha(m.naiveContent), preserved: content === local.content, naivePreserved: m.naiveContent === local.content, finalSource: content === local.content ? 'local' : 'server-or-other', attempts: m.attempts }
  }, id)
}
async function pool(items, run, concurrency = 4) {
  const results = new Array(items.length); let index = 0, done = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < items.length) { const current = index++; results[current] = await run(items[current],current); done++; if (done % 20 === 0) console.log(phase + ' completed ' + done + '/' + items.length) }
  }))
  return results
}
async function recovery(browser) {
  const cases = []
  for (const sdelay of [0,100,500,1000]) for (const ldelay of [0,100,500,1000]) for (let repeat=0;repeat<10;repeat++) cases.push({sdelay,ldelay,repeat})
  const rows = await pool(cases, async cfg => {
    const context = await browser.newContext()
    try {
      const {page,id} = await setupPage(context,cfg)
      await until(() => page.evaluate(() => window.m.serverFinished !== undefined && window.m.localFinished !== undefined && !!document.querySelector('[aria-label="문서 내용"]')), 'both recovery completions')
      await pause(50) // Allow React effects/commit; all arrivals have completed first.
      const row = await exportRecovery(page,id)
      assert.ok(row.preserved,'Current barrier failed; hashes in results only'); assert.equal(row.finalHash,sha('L'.repeat(20000))); assert.equal(row.localHash,sha('L'.repeat(20000)))
      return {...cfg,...row}
    } finally { await context.close() }
  })
  const groups = []
  for (const sdelay of [0,100,500,1000]) for (const ldelay of [0,100,500,1000]) {
    const group = rows.filter(row=>row.sdelay===sdelay&&row.ldelay===ldelay)
    groups.push({sdelay,ldelay,runs:group.length,preserved:group.filter(r=>r.preserved).length,naivePreserved:group.filter(r=>r.naivePreserved).length,localFinishedMs:stats(group.map(r=>r.localFinishedMs)),serverFinishedMs:stats(group.map(r=>r.serverFinishedMs))})
  }
  return { rows, groups, total:rows.length, preserved:rows.filter(r=>r.preserved).length, overwritten:rows.filter(r=>!r.preserved).length, naiveOverwritten:rows.filter(r=>!r.naivePreserved).length, localFinishedMs:stats(rows.map(r=>r.localFinishedMs)),serverFinishedMs:stats(rows.map(r=>r.serverFinishedMs)) }
}
async function writes(browser) {
  const scenarios = [ {count:35,interval:5,wdelay:0},{count:35,interval:80,wdelay:600},{count:100,interval:5,wdelay:0},{count:100,interval:25,wdelay:800} ]
  const cases = scenarios.flatMap(s=>Array.from({length:10},(_,repeat)=>({...s,repeat})))
  const rows = await pool(cases,async cfg=>{
    const context = await browser.newContext()
    try {
      const {page,id}=await setupPage(context,{...cfg,dirty:false,serverVersion:2})
      await until(()=>page.evaluate(()=>window.m.serverFinished!==undefined&&document.querySelector('[aria-label="문서 내용"]')?.value.length===20000),'typing ready')
      await page.evaluate(async ({count,interval})=>{
        const m=window.m, input=document.querySelector('[aria-label="문서 내용"]')
        m.inputAt=[]
        input.addEventListener('input',()=>{m.inputEvents++;m.inputAt.push(performance.now())})
        const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set
        for(let i=0;i<count;i++) {
          const content='T'.repeat(19990)+String(i).padStart(10,'0')
          setter.call(input,content); input.dispatchEvent(new Event('input',{bubbles:true}))
          if(i<count-1) await new Promise(resolve=>setTimeout(resolve,interval))
        }
        m.expectedHash=await m.sha('T'.repeat(19990)+String(count-1).padStart(10,'0'))
      },cfg)
      await until(()=>page.evaluate(()=>window.m.commitsTrace.some(row=>row.contentHash===window.m.expectedHash)),'final commit',18000)
      const row=await page.evaluate(async id=>{
        const m=window.m, db=(await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase
        const value=await db.drafts.get(id), finalHash=await m.sha(value.content)
        const final=m.commitsTrace.find(row=>row.contentHash===m.expectedHash)
        return {id,inputEvents:m.inputEvents,attempts:m.attempts,commits:m.commits,cas:m.cas,failures:m.failures,maxActive:m.maxActive,finalHash,expectedHash:m.expectedHash,preserved:finalHash===m.expectedHash,lastInputToCommitMs:final.at-m.inputAt.at(-1),realInputIntervalsMs:m.inputAt.slice(1).map((v,i)=>v-m.inputAt[i]),commitsTrace:m.commitsTrace}
      },id)
      assert.equal(row.inputEvents,cfg.count);assert.ok(row.preserved);assert.equal(row.maxActive,1)
      return {...cfg,...row}
    } finally { await context.close() }
  })
  return { rows, groups:scenarios.map(s=>{const g=rows.filter(r=>r.count===s.count&&r.interval===s.interval&&r.wdelay===s.wdelay);return {...s,runs:g.length,inputEvents:g.reduce((n,r)=>n+r.inputEvents,0),attempts:g.reduce((n,r)=>n+r.attempts,0),commits:g.reduce((n,r)=>n+r.commits,0),cas:g.reduce((n,r)=>n+r.cas,0),failures:g.reduce((n,r)=>n+r.failures,0),preserved:g.filter(r=>r.preserved).length,lastInputToCommitMs:stats(g.map(r=>r.lastInputToCommitMs)),realInputIntervalsMs:stats(g.flatMap(r=>r.realInputIntervalsMs))}}) }
}
async function tabs(browser) {
  const rows=[]
  for (let repeat=0;repeat<20;repeat++) {
    const context=await browser.newContext(), id=randomUUID()
    try {
      const first=await setupPage(context,{id,app:false})
      const second=await setupPage(context,{id,app:false,seed:false})
      for(const item of [first,second]) await item.page.evaluate(async id=>{
        const {DraftSession}=await import('/src/features/local-drafts/draftSession.ts')
        const {draftRepository}=await import('/src/features/local-drafts/draftDatabase.ts')
        // Deliberately no BroadcastChannel: test transaction CAS as the last defense.
        window.session=new DraftSession(draftRepository,crypto.randomUUID());window.session.select(id)
      },id)
      await Promise.all([first,second].map(item=>until(()=>item.page.evaluate(id=>window.session.getSnapshot()[id]?.phase==='saved',id),'tab recovered')))
      await first.page.evaluate(id=>(window.tabLastInput=performance.now(),window.session.edit(id,{content:'A'.repeat(20000)})),id)
      await second.page.evaluate(id=>(window.tabLastInput=performance.now(),window.session.edit(id,{content:'B'.repeat(20000)})),id)
      // Gate both write wrappers before the actual repository to ensure a genuine competing attempt.
      await Promise.all([first,second].map(item=>item.page.evaluate(id=>window.session.flush(id),id)))
      const perTab=await Promise.all([first,second].map(item=>item.page.evaluate(async id=>{
        const e=window.session.getSnapshot()[id],m=window.m
        return {phase:e.phase,revision:e.revision,savedRevision:e.savedRevision,memoryHash:await m.sha(e.draft.content),lastInputToCommitMs:m.commitsTrace[0]?m.commitsTrace[0].at-window.tabLastInput:null,attempts:m.attempts,commits:m.commits,cas:m.cas,failures:m.failures}
      },id)))
      const dbState=await first.page.evaluate(async id=>{const db=(await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase;const r=await db.drafts.get(id);return {hash:await window.m.sha(r.content),revision:r.localRevision}},id)
      assert.equal(perTab.reduce((n,t)=>n+t.commits,0),1);assert.equal(perTab.reduce((n,t)=>n+t.cas,0),1)
      assert.ok(perTab[0].memoryHash===sha('A'.repeat(20000))&&perTab[1].memoryHash===sha('B'.repeat(20000)))
      // Token mismatch with a larger revision, then a low revision with the CURRENT token.
      const guards=await first.page.evaluate(async id=>{
        const {draftRepository:repo,draftDatabase:db}=await import('/src/features/local-drafts/draftDatabase.ts')
        const before=await db.drafts.get(id);const result={}
        for(const [kind,revision,token] of [['token',before.localRevision+10,'seed-token'],['revision',before.localRevision-1,before.storageToken]]) {
          try {await repo.write(before,revision,token,'guard-test');result[kind]='unexpected-success'}catch(e){result[kind]=e.name}
        }
        result.unchanged=(await db.drafts.get(id)).storageToken===before.storageToken
        return result
      },id)
      assert.equal(guards.token,'LocalDraftConflict');assert.equal(guards.revision,'LocalDraftConflict');assert.ok(guards.unchanged)
      rows.push({repeat,id,perTab,dbState,guards})
    } finally {await context.close()}
  }
  return {runs:rows.length,rows}
}
async function state(browser) {
  const rows=[]
  for (const dirty of [false,true]) for(let repeat=0;repeat<10;repeat++) {
    const context=await browser.newContext()
    try {
      const {page,id,server}=await setupPage(context,{dirty:false,serverVersion:2,sdelay:100})
      await until(()=>page.evaluate(()=>window.m.serverFinished!==undefined&&document.querySelector('[aria-label="문서 내용"]')?.value.length===20000),'state ready')
      server.version=3;server.title='remote-title-3';server.content='R'.repeat(20000)
      await page.evaluate(async id=>{
        const {queryClient}=await import('/src/lib/query/queryClient.ts')
        const {noteKeys}=await import('/src/lib/query/queryKeys.ts')
        window.refetchPromise=queryClient.refetchQueries({queryKey:noteKeys.detail(id)})
      },id)
      if(dirty) await page.getByLabel('문서 내용').fill('D'.repeat(20000))
      await page.evaluate(()=>window.refetchPromise)
      const expected=sha((dirty?'D':'R').repeat(20000))
      await until(()=>page.evaluate(async({id,expected})=>{
        const db=(await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase
        const value=await db.drafts.get(id)
        return value&&await window.m.sha(value.content)===expected
      },{id,expected}),'state snapshot committed')
      const result=await page.evaluate(async id=>{
        const {queryClient}=await import('/src/lib/query/queryClient.ts')
        const {noteKeys}=await import('/src/lib/query/queryKeys.ts')
        const db=(await import('/src/features/local-drafts/draftDatabase.ts')).draftDatabase
        const r=await db.drafts.get(id),q=queryClient.getQueryData(noteKeys.detail(id))
        return {uiHash:await window.m.sha(document.querySelector('[aria-label="문서 내용"]').value),cacheHash:await window.m.sha(q.content),cacheVersion:q.version,baseVersion:r.baseVersion,latestServerVersion:r.latestServerVersion,serverDirty:r.content!==r.baseContent}
      },id)
      assert.equal(result.uiHash,expected);assert.equal(result.cacheHash,sha('R'.repeat(20000)))
      assert.equal(result.baseVersion,dirty?2:3);assert.equal(result.serverDirty,dirty)
      rows.push({repeat,dirty,id,...result})
    }finally{await context.close()}
  }
  return {runs:rows.length,rows}
}
async function reversal(browser) {
  const rows=[]
  for(let repeat=0;repeat<20;repeat++) {
    const context=await browser.newContext()
    try {
      const {page,id}=await setupPage(context,{app:false})
      const result=await page.evaluate(async id=>{
        const {DraftDatabase,DexieDraftRepository,draftDatabase}=await import('/src/features/local-drafts/draftDatabase.ts')
        const {DraftSession}=await import('/src/features/local-drafts/draftSession.ts')
        const seed=await draftDatabase.drafts.get(id), wait=ms=>new Promise(r=>setTimeout(r,ms))
        const naiveDB=new DraftDatabase('measurement-naive-'+crypto.randomUUID())
        const safeDB=new DraftDatabase('measurement-safe-'+crypto.randomUUID())
        await naiveDB.drafts.put(seed);await safeDB.drafts.put(seed)
        const old={...seed,content:'O'.repeat(20000),localRevision:8,storageToken:'naive-old'}
        const latest={...seed,content:'N'.repeat(20000),localRevision:9,storageToken:'naive-new'}
        const naiveTrace=[],safeTrace=[]
        const naivePut=async(record,delay)=>{await wait(delay);await naiveDB.drafts.put(record);naiveTrace.push(record.localRevision)}
        const naiveRun=(async()=>{const first=naivePut(old,200);await wait(20);await Promise.all([first,naivePut(latest,0)])})()
        const baseRepo=new DexieDraftRepository(safeDB);let attempts=0,active=0,maxActive=0
        const repo={read:id=>baseRepo.read(id),write:async(...args)=>{
          active++;maxActive=Math.max(maxActive,active);const attempt=++attempts
          try{await wait(attempt===1?200:0);const r=await baseRepo.write(...args);safeTrace.push(r.localRevision);return r}finally{active--}
        }}
        const session=new DraftSession(repo,'safe-writer');session.select(id)
        while(session.getSnapshot()[id]?.phase!=='saved')await wait(1)
        session.edit(id,{content:old.content});const first=session.flush(id)
        await wait(20);session.edit(id,{content:latest.content});session.flush(id)
        await first
        while(session.getSnapshot()[id].revision!==session.getSnapshot()[id].savedRevision)await wait(1)
        await naiveRun
        const naive=await naiveDB.drafts.get(id),safe=await safeDB.drafts.get(id)
        const result={naivePreserved:naive.content===latest.content,safePreserved:safe.content===latest.content,naiveTrace,safeTrace,attempts,maxActive,naiveHash:await window.m.sha(naive.content),safeHash:await window.m.sha(safe.content),expectedHash:await window.m.sha(latest.content)}
        // These are uniquely named databases in this disposable context only; close, never touch user DBs.
        naiveDB.close();safeDB.close();return result
      },id)
      assert.equal(result.naivePreserved,false);assert.ok(result.safePreserved);assert.equal(result.maxActive,1)
      rows.push({repeat,id,...result})
    }finally{await context.close()}
  }
  return {runs:rows.length,rows}
}
async function history(browser) {
  const rows=[]
  for(const implementation of ['9789b32','current']) for(let repeat=0;repeat<10;repeat++) {
    const context=await browser.newContext(),page=await context.newPage(),id=randomUUID(),target=implementation==='current'?origin:historicalOrigin
    const note={id,folderId:'folder',title:'historical-server-title',content:'synthetic-body',version:2,sortOrder:0,createdAt:'',updatedAt:''}
    await page.route(url=>url.pathname.startsWith('/api/'),route=>{
      assert.equal(route.request().method(),'GET')
      return route.fulfill({json:new URL(route.request().url()).pathname==='/api/workspace/tree'?{folders:[{id:'folder',parentId:null,name:'folder',version:0,sortOrder:0,createdAt:'',updatedAt:''}],notes:[note]}:note})
    })
    try {
      await page.goto(target+'/notes/'+id)
      await until(()=>page.evaluate(()=>document.querySelector('[aria-label="문서 제목"]')?.value==='historical-server-title'),'history editor')
      await page.getByLabel('문서 제목').fill('synthetic-edited-title')
      await pause(500) // Common fixed observation window, not a latency benchmark.
      const result=await page.evaluate(async id=>{
        const label=document.querySelector(`[data-node-key="note:${id}"]`).textContent
        const editor=document.querySelector('[aria-label="문서 제목"]').value
        return {matches:label===editor,editorChanged:editor==='synthetic-edited-title'}
      },id)
      rows.push({implementation,repeat,...result})
    }finally{await context.close()}
  }
  return {rows}
}
async function main() {
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try {
    const sourceFiles=['frontend/src/features/local-drafts/draftSession.ts','frontend/src/features/local-drafts/draftDatabase.ts','frontend/src/features/notes/noteDrafts.ts','frontend/src/features/notes/useNoteDrafts.ts','frontend/src/features/folders/FolderTree.tsx']
    const manifest={date:new Date().toISOString(),phase,head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),uncommitted:!!git('status','--porcelain'),sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),environment:{node:process.version,os:os.type()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,memoryBytes:os.totalmem(),chrome:browser.version(),headless:true,viewport:{width:1280,height:720},concurrency:phase==='recovery'||phase==='writes'?4:1},percentile:'nearest-rank ceil(p*n)-1; per-scenario final-commit samples are 10, p95/p99 equal observed maximum, not production tail estimates'}
    const start=Date.now(),data=await ({recovery,writes,tabs,reversal,state,history}[phase])(browser)
    fs.writeFileSync(path.join(__dirname,phase+'.json'),JSON.stringify({manifest,elapsedMs:Date.now()-start,data},null,2)+'\n')
    console.log(phase+' results written; no manuscript bodies logged')
  }finally{await browser.close()}
}
main().catch(error=>{console.error({name:error.name,message:error.message});process.exitCode=1})
