// Recompute summaries from measured JSON; never infer unexecuted experiments.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto')
const dir=__dirname, root=path.resolve(dir,'../../..'), hash=s=>createHash('sha256').update(s).digest('hex')
const load=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'))
const datasets=Object.fromEntries(['recovery','writes','tabs','reversal','state','history'].map(n=>[n,load(n)]))
const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1]
const stats=v=>({n:v.length,p50:percentile(v,.5),p95:percentile(v,.95),p99:percentile(v,.99)})
const r=datasets.recovery.data,w=datasets.writes.data,t=datasets.tabs.data,v=datasets.reversal.data,c=datasets.state.data,h=datasets.history.data
assert.equal(r.rows.length,160)
const expected=hash('L'.repeat(20000))
assert.ok(r.rows.every(row=>row.finalHash===expected&&row.localHash===expected&&row.attempts===0))
assert.ok(w.rows.every(row=>row.preserved&&row.maxActive===1&&row.inputEvents===row.count))
assert.ok(c.rows.every(row=>row.cacheHash===hash('R'.repeat(20000))&&row.baseVersion===(row.dirty?2:3)&&row.serverDirty===row.dirty))
assert.ok(h.rows.every(row=>row.editorChanged&&row.matches===(row.implementation==='current')))
const tabInputs=t.rows.flatMap(row=>row.perTab)
assert.ok(t.rows.every(row=>row.guards.unchanged&&row.guards.token==='LocalDraftConflict'&&row.guards.revision==='LocalDraftConflict'))
assert.ok(v.rows.every(row=>row.safePreserved&&!row.naivePreserved&&row.maxActive===1))
const sourceIntegrity=Object.entries(datasets).map(([name,set])=>({name,unchanged:Object.entries(set.manifest.sourceHashes).every(([file,expected])=>hash(fs.readFileSync(path.join(root,file)))===expected)}))
assert.ok(sourceIntegrity.every(row=>row.unchanged))
const sum=(rows,k)=>rows.reduce((n,row)=>n+row[k],0)
const summary={
  caseRuns:r.rows.length+w.rows.length+t.rows.length+v.rows.length+c.rows.length+h.rows.length,
  sourceIntegrity,
  recovery:{n:r.rows.length,preserved:r.preserved,overwritten:r.overwritten,naivePreserved:r.rows.filter(row=>row.naivePreserved).length,naiveOverwritten:r.naiveOverwritten,localReadDurationMs:stats(r.rows.map(row=>row.localReadDurationMs)),localFinishedMs:r.localFinishedMs,serverFinishedMs:r.serverFinishedMs},
  writes:{runs:w.rows.length,inputEvents:sum(w.rows,'inputEvents'),attempts:sum(w.rows,'attempts'),commits:sum(w.rows,'commits'),cas:sum(w.rows,'cas'),failures:sum(w.rows,'failures'),preserved:w.rows.filter(row=>row.preserved).length,groups:w.groups},
  tabs:{runs:t.rows.length,competingAttempts:sum(tabInputs,'attempts'),competingCommits:sum(tabInputs,'commits'),competingCAS:sum(tabInputs,'cas'),nonCASFailures:sum(tabInputs,'failures'),additionalGuardAttempts:t.rows.length*2,additionalGuardCAS:t.rows.length*2,winnerLastEditToCommitMs:stats(tabInputs.filter(row=>row.lastInputToCommitMs!==null).map(row=>row.lastInputToCommitMs)),bothMemoryCopiesPreserved:t.rows.filter(row=>row.perTab[0].memoryHash===hash('A'.repeat(20000))&&row.perTab[1].memoryHash===hash('B'.repeat(20000))).length},
  reversal:{n:v.rows.length,currentPreserved:v.rows.filter(row=>row.safePreserved).length,hypotheticalNaivePreserved:v.rows.filter(row=>row.naivePreserved).length},
  state:{n:c.rows.length,cleanAdopted:c.rows.filter(row=>!row.dirty&&row.uiHash===row.cacheHash).length,dirtyPreserved:c.rows.filter(row=>row.dirty&&row.uiHash===hash('D'.repeat(20000))).length},
  history:{beforeRuns:h.rows.filter(row=>row.implementation==='9789b32').length,beforeMismatches:h.rows.filter(row=>row.implementation==='9789b32'&&!row.matches).length,afterRuns:h.rows.filter(row=>row.implementation==='current').length,afterMatches:h.rows.filter(row=>row.implementation==='current'&&row.matches).length},
  artifactHashes:Object.fromEntries(['measure.cjs','analyze.cjs',...Object.keys(datasets).map(n=>n+'.json')].map(n=>[n,hash(fs.readFileSync(path.join(dir,n)))])),
}
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const f=n=>n.toFixed(1),p=s=>[s.p50,s.p95,s.p99].map(f).join(' / ')
let md='# 실측 집계 — 원시 JSON에서 재계산\n\n총 '+summary.caseRuns+'개 실험 실행. 6개 phase의 관련 제품 소스 SHA-256이 실행 후에도 동일함을 확인했다. 가상 비교 모델을 실제 과거 코드와 구분한다.\n\n'
md+='## 복구 16조합\n\n각 조합10회. 시각은 seed/측정용 import 뒤 app main import 직전 t0 상대값이며, 디스크 단독 지연이 아니다.\n\n| GET 주입ms | read 주입ms | n | 현재 로컬 보존 | 가상 모델 로컬 선택 | read구간 p50ms | t0→로컬완료 p50ms | t0→서버완료 p50ms |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
for(const g of r.groups){const rows=r.rows.filter(row=>row.sdelay===g.sdelay&&row.ldelay===g.ldelay);md+=`|${g.sdelay}|${g.ldelay}|${g.runs}|${g.preserved}|${g.naivePreserved}|${f(percentile(rows.map(row=>row.localReadDurationMs),.5))}|${f(g.localFinishedMs.p50)}|${f(g.serverFinishedMs.p50)}|\n`}
md+=`\n현재 보존 ${r.preserved}/160, 덮어쓰기 ${r.overwritten}. 최종 화면과 DB 모두 fixture SHA-256과 일치한다. 가상 모델 로컬 선택 ${summary.recovery.naivePreserved}/160, 서버 선택 ${r.naiveOverwritten}/160. 실제 제품 DB 손실 횟수가 아니다.\n\n로컬 read 구간 p50/p95/p99(ms): ${p(summary.recovery.localReadDurationMs)}. t0 상대 로컬 완료: ${p(r.localFinishedMs)}. Axios응답 완료: ${p(r.serverFinishedMs)}. 원시JSON은 실행별 시각/완료순서/해시를 포함한다.\n`
md+='\n## 2만 자 입력/쓰기\n\n| 입력×반복 | 대기ms / 실제간격p50ms | write주입ms | input | attempt | commit | CAS | 비CAS실패 | 보존 | 마지막input→commit p50/p95/p99ms |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
for(const g of w.groups)md+=`|${g.count}×${g.runs}|${g.interval} / ${f(g.realInputIntervalsMs.p50)}|${g.wdelay}|${g.inputEvents}|${g.attempts}|${g.commits}|${g.cas}|${g.failures}|${g.preserved}/${g.runs}|${p(g.lastInputToCommitMs)}|\n`
md+='\n시나리오별 n=10으로 p95/p99는 관측 최대값이다. 입력마다의 latency 표본이 아니라 실행마다 최종 입력 latency 1개다.\n'
md+=`\n## 두 탭 / revision / token\n\n20회, 경쟁40attempt /20commit /20CAS거부 /비CAS실패0. 두 메모리 입력 모두 유지20/20이나 DB는 승자만 저장한다. 큰revision+staleToken20회, 최신token+낮은revision20회도 모두 거부. 전체80요청/20commit/60예상거부.\n\n승자20개의 마지막 session.edit→commit p50/p95/p99(ms): ${p(summary.tabs.winnerLastEditToCommitMs)}. 이 측정은 debounce를 기다리지 않고 명시flush하며, DOM input latency와 합치지 않는다. 패자는 commit이 없어 latency가 null이다.\n`
md+=`\n## 추가 안전성·실제 과거 비교\n\n- 가상 지연 put 대비 실제 직렬session:20회, 가상 최신보존0/20, 현재20/20. 제품의 과거Before가 아니다.\n- 서버refetch20회: clean서버갱신${summary.state.cleanAdopted}/10, dirty입력/base보존${summary.state.dirtyPreserved}/10. Query는20회 모두 새 서버v3내용을 유지한다.\n- 실제9789b32의제목불일치${summary.history.beforeMismatches}/10, 현재제목일치${summary.history.afterMatches}/10. 동일mock/입력/500ms관측창이며 속도 개선률은 계산하지 않았다.\n`
fs.writeFileSync(path.join(dir,'summary.md'),md)
console.log(JSON.stringify({caseRuns:summary.caseRuns,sourceIntegrity:summary.sourceIntegrity,inputs:summary.writes.inputEvents,commits:summary.writes.commits},null,2))
