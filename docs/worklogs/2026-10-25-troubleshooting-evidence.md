# 트러블슈팅 이력 감사 및 정량 측정

## 목적·범위

기능 구현 없이 A(GET/복구), B(쓰기·멀티탭), C(Query/Draft), D(제목 불일치)의 실제 이력과 안전성을 조사했다. feat/offline-local-storage의 기존 미커밋 제품 작업을 보존했다. 이 작업에서 제품 코드/API/스키마/운영 설정을 수정하지 않았다. 커밋·푸시 요청은 없어 수행하지 않았다.

## 실제 작업 순서

1. git status/log/show/diff, 현재 저장 모듈·Hook·에디터·트리·Query 설정, 기존 worklogs/troubleshooting/테스트를 먼저 읽었다.
2. 실제 API 연결은 readOnly였고 Draft/IndexedDB 도입부터 방어가 있었음을 확인했다. D는 과거에도 편집기/Draft와 서버 트리의 제목이 달랐다는 근거를 찾았다.
3. 독립 측정 디렉터리 docs/measurements/2026-10-25-draft-concurrency/를 만들고 하네스를 작성했다. 모든 최종 실험 API를 GET mock으로 제한하고 합성 원고·격리 Chrome context·실제 IndexedDB를 사용했다.
4. 실제 과거9789b32 소스를 git archive로 자체 /private/tmp 디렉터리에 추출했다. 현재 node_modules 설치물을 재사용해 서버25174에서 실행하고 현재는25173에서 제공했다.
5. 초기 두 서버의 생성 캐시 공유 때문에 Dexie import가504 Outdated Optimize Dep로 실패했다. 초기 recovery/writes 실행을 중단·집계 제외했다. 사용자5173 프로세스는 건드리지 않고 자체 서버 둘을 종료, 생성 캐시를 현재 구성으로 복구하고 cacheDir을 서로 다른 임시 경로로 분리했다. 제품 설정은 수정하지 않았다.
6. recovery:16조합×10회=160회 실제 앱 DOM/IDB를 측정했다. 같은 callback 순서의 가상 수신 대입 모델은 별도 변수로 비교하고 실제 과거 코드로 표현하지 않았다.
7. writes:2만 자/35·100회 입력/4개 간격·지연 조합×각10회=40회,2700 input/60 commit을 측정했다. 입력 interval은 실제 배열로 기록하고 저장 commit 시각을 성공 promise 기준으로 기록했다.
8. tabs:실제 두 page에서 생산 session/repository로20회 동일 기준 경쟁을 실행했다.40요청 중20commit/20CAS거부를 확인했다. 추가token/revision guard40회도 모두 거부됐다. loser의 메모리 보존과 DB에는 winner만 저장됨을 구분했다.
9. reversal:transaction 생성 전200/0ms 지연의 가상 naive와 실제 직렬session을 같은 입력 순서로20회 비교했다. 과거 제품 버그라는 해석을 금지했다.
10. history:실제 과거9789b32/현재 각각10회,같은 입력/500ms 관측 창에서 제목 불일치10/10→0/10을 재현했다. 과거 의존성 환경은 현재 설치물을 재사용했음을 명시했다.
11. state:clean/dirty 각10회,새 서버v3 refetch를100ms지연하고 응답 대기 중 입력을 검증했다. clean은base3 채택,dirty는입력/base2 유지,Query는양군모두서버v3로 유지됐다.
12. independent analyze.cjs로280개 실행 결과를 재집계하고 관련 제품5개 파일의 SHA-256이 모든 phase 전후 동일함을 검증했다. recovery의UI/DB해시가 처음fixture와 일치함도 추가 확인했다.
13. pnpm test79개 및 noteDrafts/sidebarDraftTitles/localDraftStorage 브라우저3종을 재실행해 모두 통과하고 로그를 보관했다. 제품 변경이 없어 build/lint는 이번 조사에서 다시 실행하지 않았다.
14. 이력/실측 보고서에 사례별 원인·해결·대안·수치·한계·3줄요약·질문5개를 작성하고 기존 로컬 troubleshooting에 실측 근거를 보완했다. 새 캐시 환경 문제도 별도 기록했다.
15. 마지막 source integrity/diff/JSON/링크/로그 검사를 통과하고 자체 연구 서버25173/25174(PID65823/65722)만 종료했다. 사용자5173(PID37770)과 기존 데이터는 유지했다.

## 이번 조사에서 작성·보완한 파일

- docs/reports/2026-10-25-troubleshooting-evidence.md:엄격한 분류/Git·함수·테스트 근거/기술 설명/수치/면접 자료.
- docs/measurements/2026-10-25-draft-concurrency/measure.cjs:독립 브라우저 실험6종.
- 같은 경로 analyze.cjs:해시 검증/집계/결과 artifact digest 생성.
- 같은 경로 README.md:환경·정의·재현·제외 실행/캐시 이슈.
- 같은 경로 recovery/writes/tabs/reversal/state/history.json:실행별 ID/version/hash/time/count와manifest.
- 같은 경로 summary.json/summary.md:실제 결과 재집계/16조합 표/입력·CAS·버전·과거 비교.
- 같은 경로 unit-test.log/noteDrafts.log/sidebarDraftTitles.log/localDraftStorage.log:실제 회귀 로그.
- docs/worklogs/2026-10-25-troubleshooting-evidence.md:작업 순서/범위/결과.
- Git 제외 로컬 docs/troubleshooting/:기존local-draft-storage/note-drafts/sidebar-draft-title 문서에 측정 보완,새measurement-cache-isolation 및README등록.

## 결과와 남은 한계

총280개 실험의 구체적 수치는보고서/JSON기준이다. A/C는실제사용자원고유실관측이없는예방설계,B는실제stalewrite경쟁재현과방어(단일탭역전은사전예방),D는실제과거UI버그수정으로구분했다. 가상naive의손실을제품장애로표현하지않고p95/p99의작은표본/실제interval차이를공개했다. 충돌메모리사본영속화/강제종료/저장소회수/모든브라우저·운영tail은보장하지않는다.
