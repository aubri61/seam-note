# 2026-10-25 — Dexie 로컬 원고 저장 작업 이력

## 실제 작업 순서

1. 첨부 작업 지시서/AGENTS.md 및 clean main을 확인했다. 사용자가 지정한 feat/offline-local-storage를 현재 main에서 분기했다.
2. Draft/Hook/이탈/AppLayout/NoteEditor/라우팅/Query/생성·삭제/테스트 구조를 읽고 기존 IndexedDB 코드가 없음을 확인했다. pnpm add dexie를 실행했다.
3. draftDatabase.ts에 schema v1 및 revision+token 트랜잭션 CAS를 작성했다. draftSession.ts에 복구 barrier/직렬 쓰기/디바운스/실패/탭 간 확인을 작성했다.
4. useNoteDrafts의 소유 위치는 AppLayout에 유지하고 session 구독/복구/flush/이탈을 연결했다. 기존 순수 Draft 정책을 재사용한다. 로컬 상태/실패 retry/메모리와 서버 저장의 구분을 UI에 연결했다.
5. 로컬 전용 troubleshooting/README에 실제 위험과 설계를 기록했다.
6. 첫 build/tsc/lint는 성공했으나 Dexie를 정적 import한 초기 index chunk가 558.17kB(gzip 181.94kB)로 500kB 경고를 냈다. 타입/오류/이름을 localDraftTypes로 분리하고 localDraftRepository의 dynamic import adapter로 DB runtime을 지연 로딩했다. 최종 초기 index 461.47kB(gzip151.11kB), deferred DB 99.21kB(gzip31.84kB)로 경고가 해소됐다. 총 전송량/초기 응답 시간 개선을 측정했다고 주장하지 않는다.
7. localDraftStorage.test.mjs와 TS helper를 확장해 recovery barrier/디바운스·최대대기/쓰기 직렬화/dirty/오류·retry/CAS 동등 revision/서버 baseline을 테스트했다. 기존 65개를 유지해 최초 78개가 통과했다.
8. 실제 IndexedDB 통합용 localDraftStorage.cjs를 작성했다. 격리 Chrome persistent profile에만 fixture를 저장하고 실제 Chrome 종료·재실행 복원, mock GET 서버, 지연/failure wrapper, 동일 DB 두 탭을 검증했다. 실제 개발 DB 쓰기는 없다.
9. 최초 fault-injection HTML shell은 Vite React refresh preamble이 없어 오류가 났다. 실제 Vite index HTML을 받아 preamble은 유지하고 main import만 지연하도록 테스트를 수정했다. 앱 코드를 바꿔 preamble 검사를 끄지 않았다.
10. 제목/본문/빈 값의 reload 및 browser reopen, 늦은 로컬 복구, 느린 쓰기, quota/read failure retry, 독립 revision 충돌/채널 차단 CAS, 실제 transaction abort rollback, 서버 삭제 후 로컬 복구가 Chrome에서 통과했다. WebKit 실행 파일은 없어 Safari/WebKit 검증으로 집계하지 않았다.
11. 긴 원고 약 2만자 fixture를 35번 연속 입력하는 검증을 추가했다. 최종 Chrome 실행의 저장 시도는 3회였고 마지막 입력이 DB에 보존됐다. 이는 해당 테스트 환경의 시도 횟수이며 일반 성능/지연 SLA로 일반화하지 않는다.
12. 동명 DB를 target version 없이 읽어 알려진 v1인지 먼저 확인하는 schema guard를 추가했다. 알 수 없는 table을 가진 동명 DB가 자동 변경되지 않고 원래 데이터/테이블이 유지되는 실제 브라우저 검증을 추가했다. 낮은 revision+최신 token의 쓰기도 실제 transaction에서 거부됨을 확인했다.
13. A 저장 실패 중 B를 보는 경우 오류가 묻히지 않도록 AppLayout의 background issue 확인 Link를 추가했다. 실패한 A의 메모리 입력으로 돌아가 retry 성공하는 검증을 추가했다.
14. 기존 Draft/라우팅 브라우저의 메모리 전용 beforeunload 기대값을 현재 local commit 기준으로 갱신했다. Link 클릭 직후 다른 원고 field를 프로그램으로 채우던 부분은 대상 원고 표시를 기다리게 했다. 기존 입력/서버 버전/모바일 검증은 유지했다.
15. 앱 소스 변경과 fault-injection 테스트가 겹친 실행에서 read control이 호출되지 않는 timeout이 있었다. HMR timestamp/module identity 차이를 원인으로 추정했다(모듈 identity trace로 확정하지 않음). 소스를 고정하고 이번 테스트 전용 Vite를 재시작하자 같은 테스트가 통과했다. 사용자 서버는 재시작하지 않았다.
16. 코드 검토에서 이미 commit된 Draft의 head 확인이 실패한 뒤 retry가 waiting으로 남을 가능성을 확인했다. 쓰기 없는 retry도 DB의 동일 snapshot을 재확인해 saved로 돌아가도록 수정하고 새 회귀 테스트를 추가했다. 실패/충돌은 이탈 경고도 유지한다. 총 Node 79개가 됐다.
17. 마지막 소스 수정 뒤 임시 Vite를 다시 시작하고 앱 코드를 고정한 채 localDraftStorage/noteDrafts/workspaceReadonly/workspaceCreateDelete/noteRouting 5종을 모두 통과했다. build/tsc/lint/Node 79개도 성공했다. desktop 1360×900/mobile 390×844 screenshot을 직접 확인했다.
18. 설계/미래 migration·Outbox/PWA 경계/한계를 작성하고 기존 Draft/라우팅/생성/조회 문서와 frontend README를 현재 로컬 저장 단계로 연결했다. 로컬 troubleshooting 기록을 해결로 보완했다.
19. 최종 파일/ignore/금지 범위 및 브랜치를 확인했다. 테스트 프로필/contexts는 스크립트가 생성한 것만 정리했고 임시 25173 Vite만 종료한다. 사용자 5173/개발 DB/기존 원고는 유지한다. commit/push는 이번 요청에 없어 수행하지 않았다.


## 파일별 변경 (첫 코드 변경 순서)

| 파일 | 변경 내용 |
| --- | --- |
| frontend/package.json, frontend/pnpm-lock.yaml | Dexie 4.4.7 설치 |
| frontend/src/features/local-drafts/draftDatabase.ts | schema v1, 기존 schema 검사, 레코드 검증, 원자적 revision/token CAS |
| frontend/src/features/local-drafts/draftSession.ts | 복구 barrier, ID별 session, debounce/max wait/직렬 쓰기/실패·retry/알림·head 확인 |
| frontend/src/features/notes/useNoteDrafts.ts | AppLayout 소유 session과 React 구독, URL 선택 복구/전환 flush/이탈 조건 |
| frontend/src/features/local-drafts/localDraftStatus.ts | 로컬 상태와 서버 dirty/조회 상태를 분리한 UI 결정 |
| frontend/src/features/notes/noteDrafts.ts | 기존 정책 유지, 상태 타입에 로컬 단계 추가 |
| frontend/src/app/AppLayout.tsx | 로컬 상태/retry/복구 전달, 서버 404여도 로컬 원고 보존, 비활성 원고 실패 Link |
| frontend/src/features/notes/NoteEditor.tsx | 저장 오류·retry와 보존 한계 안내, 입력·스타일 유지 |
| frontend/src/features/sync/SyncStatus.tsx | local/server 의미를 구분한 tooltip |
| frontend/src/app/sidebar/Sidebar.tsx | 메모리 전용 안내를 현재 로컬 저장 안내로 갱신 |
| frontend/tests/helpers/loadModules.mjs | 실제 저장 모듈 테스트 로드 |
| frontend/src/features/local-drafts/localDraftTypes.ts | 기존 모델 확장 레코드/저장 계약/오류·상수 분리 |
| frontend/src/features/local-drafts/localDraftRepository.ts | 첫 복구 때 Dexie 지연 import |
| frontend/tests/localDraftStorage.test.mjs | 저장/복구/경쟁/타이밍/실패 14개 정책 테스트 |
| frontend/tests/browser/localDraftStorage.cjs | 실제 IndexedDB·브라우저 재시작·두 탭·보존·오류·타이밍 통합 |
| frontend/tests/browser/noteDrafts.cjs | commit 기준 경고/현재 배지·안내, 비동기 화면 전환 대기 |
| frontend/tests/browser/noteRouting.cjs | 로컬 commit된 dirty Draft는 이탈 경고 해제됨을 반영 |
| docs/design/local-draft-storage.md | 최종 스키마/상태/복구/경쟁/한계/확장 계약 |
| docs/design/note-drafts.md, docs/design/note-routing.md | 과거 메모리 전용 단계와 현재 계약 구분 |
| docs/design/create-delete-ui.md, docs/design/workspace-readonly-ui.md | 현재 IndexedDB 단계 안내 링크 |
| frontend/README.md | 로컬 복구 사용/보존 조건과 설계 링크 |
| docs/worklogs/2026-10-25-local-draft-storage.md | 이 작업 순서/파일별 변경/검증 기록 |

로컬 전용 docs/troubleshooting/2026-10-25-frontend-local-draft-storage.md 및 README도 작성·갱신했으며 Git ignore 정책은 유지한다.

## 검증 결과

- Node v20.20.0/pnpm10.32.1/Vite8.3.5/Dexie4.4.7, 기존 제공 Playwright/설치된 Chrome(headless).
- pnpm build(tsc/Vite), pnpm lint, pnpm test 79개 모두 통과. 기존 65개 유지 +14개 신규, 실패/스킵 0.
- 브라우저 5종 모두 통과. 새 persistence 스크립트는 실제 IndexedDB이며 실패·지연은 test wrapper에서 주입한다. schema 보존/원자적 CAS/revision 거절/abort rollback은 실제 DB로 확인했다.
- 실제 Chrome profile 종료·재실행과 같은 origin 직접 URL에서 복원했다. 제목만/본문만/빈 문자열도 확인했다. 별도 탭의 상태/서버 목록 404는 자동 로컬 데이터 삭제나 서버 재생성을 유발하지 않았다.
- 약 2만자 fixture 35 입력/3 저장 시도, 최신 내용 보존. 가상 clock에서는 400ms debounce/2초 최대 대기 검증. 느린 I/O에서는 2초 내 commit을 보장하지 않는다.
- Safari/WebKit은 테스트 실행 환경이 없어 미검증. 실제 비공개 모드 quota를 채우거나 사용자 데이터/브라우저 profile을 지우지 않았다.
- backend/API/Query Key/DB migration/서버 저장/Outbox/PWA 변경 없음. backend 테스트는 이번에 다시 실행하지 않았다. 개발 DB 쓰기 없음.
- 새로운 runtime dependency는 Dexie 하나이며 테스트/상태 관리 패키지는 추가하지 않았다.

```sh
cd frontend
pnpm build
pnpm lint
pnpm test
# 별도 검증 서버: pnpm exec vite --host 127.0.0.1 --port 25173 --strictPort
# 저장소 root: 기존 Playwright 경로를 설정
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/localDraftStorage.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/noteDrafts.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/noteRouting.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceReadonly.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceCreateDelete.cjs
```

## 보존 한계와 후속 지점

origin/profile별 로컬 보관이며 서버 백업이 아니다. commit 전 종료/저장 실패/충돌 중 입력은 메모리뿐일 수 있어 경고·복사가 필요하다. 브라우저 저장소 삭제·회수/사생활 모드 종료 등에는 데이터가 사라질 수 있다. 충돌 사본 자동 병합/강제 덮기/로컬 보관함·삭제/서버 재생성은 구현하지 않았다. 향후 Outbox는 현재 drafts CAS와 같은 transaction에서 실제 저장 의도만 enqueue해야 하며, PWA app shell/serviceworker는 별도 범위다.
