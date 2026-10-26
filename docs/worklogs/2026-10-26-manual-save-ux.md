# 일반 원고 수동 서버 저장 UX 작업 이력

## 범위

기존 미커밋 작업은 보존했다. 모든 정상 원고에서 개발·프로덕션 공통으로 수동 저장을 사용할 수 있도록 기존 테스트 gate/버튼 연결만 제품화했다. 백엔드/API/DB migration/IndexedDB schema/프록시를 변경하지 않았다. 사용자 클릭만 PUT하며 일괄 수정/자동 전송은 없다. 개발 DB/기존 원고를 테스트로 수정하지 않았다. commit/push는 요청하지 않아 수행하지 않았다.

## 실제 변경 순서

1. `syncContract.ts`, `manualSync.ts`, `useManualSync.ts`, AppLayout/AppHeader/NoteEditor, useFolders의 Workspace/URL/상세404 판정, 기존 단위/브라우저 테스트를 확인했다. 제한 원인과 완료 상태/남은 작업의 혼동 위험을 로컬 troubleshooting에 먼저 기록했다.
2. `syncContract.ts`의 isManualSyncNote를 build mode/환경설정과 무관한 UUID 검사로 변경했다. `manualSaveState`를 추가해 조회/로컬복구/Outbox/dirty/요청중 상태를 순수 함수로 판정한다. clean+작업0이면 로컬 초기 레코드를 아직 commit중이어도 서버 저장은 비활성이다.
3. `manualSync.ts`의 syncOneTestNote를 syncOneNote로 바꾸고 지정UUID 인자를 제거했다. UUID/session noteId/failed·conflict·recovering 검사를 추가하고 flush/claim의 await 뒤 가용성을 확인한다. 기존 Web Lock/flushLatest/fence/불변 snapshot/Idempotency-Key/expectedVersion/응답검증/ACK/rebase를 재사용했다. 실패 상태를 서버 저장 버튼이 몰래 복구·전송하지 않으며 기존 로컬 재시도 버튼으로 먼저 복구한다.
4. `useManualSync.ts`는 DEV/실험env gate를 제거하고 Outbox read/sequence·noteId·entry 확인/조회 실패 차단을 추가했다. entry/결과/busy/focus/visibility에 로컬 조회만 수행한다. 성공/실패와 작업 수를 분리해 표시하고 새로운 revision에는 과거 완료 문구를 최신 입력 완료로 보여주지 않는다. PUT404는 로컬 작업을 보존하고 전송 차단/서버 GET invalidate만 한다. 중복 클릭 ref는 유지한다. 디버그용 operationId/version 진행 문구는 제품 UI에서 제거했다.
5. AppLayout에서 현재 route/Workspace/상세 조회/삭제 등 busy 상태로 가용성을 전달한다. AppHeader의 기존 SyncStatus 바로 옆에 Emotion 버튼과 결과/남은 작업 안내를 연결했다. NoteEditor의 실험 버튼 패널은 제거했다. URL/선택/드래프트 수명은 유지한다.
6. `manualSync.test.mjs`는 gate 테스트를 일반 UUID/잘못된ID 검증으로 바꾸고 복구실패/조회상태 변경/상태 매트릭스를 추가했다. 기존 응답/실패/같은key/409 테스트를 유지했다. `manualSyncLive.cjs`는 버튼 이름/clean 비활성/로컬 복구 후 ACK 재시도에 맞게 UI assertion을 바꿨으며 실제10개 저장 시나리오를 유지했다.
7. `manualSaveUx.cjs`를 추가했다. 별도 두 UUID/헤더 위치/clean 비활성/입력 직후flush/모바일/같은key 응답유실 재시도/409/PUT404/직접없는노트/잘못된UUID/IndexedDB 복구실패를 mock API로 검사한다. 제품 코드 디버그 훅 없이 production preview에서도 실행한다.
8. `scripts/manual-sync-lab.py`는 제품 실행에 필요 없어진 실험env 주입을 제거했다. 기존10개+회귀7종에 신규 UX를 추가하고 이번 결과를 별도 manual-save-results.json에 기록해 이전 역사적 JSON을 보존한다.
9. build/tsc/lint/Node101개 통과 후 새 격리DB fixture에서 backend27개/실제10개/기존브라우저7종이 통과했다. 신규 dev UX는 처음에 초기화 timeout이 발생했다. mock glob `**/api/**`가 `/src/lib/api/client.ts`까지 가로챘기 때문이다. product 코드를 바꾸지 않고 `pathname.startsWith('/api/')`로 mock 범위를 수정했다. 같은 테스트를 별도 Vite에서 다시 통과했다. 명령을 저장소 루트에서 실행해 pnpm no-package가 발생한 경우 frontend cwd로 재실행했다(제품 오류 아님).
10. production preview의 동일 mock UX 테스트도 통과했다. 모바일 버튼 bounding box가390px viewport 안에 있는지 검사하고 합성 fixture 스크린샷으로 위치를 확인했다. 확인된404/복구실패/충돌 상태에서는 전송되지 않고 입력을 보존했다.
11. README/최신 제품 설계/이전 학습 문서의 후속 안내/이 작업 이력/로컬 troubleshooting 목록을 갱신했다. 최종 UI의 clean 판정을 보강해 변경 없는 최초 로컬 commit 중에도 버튼을 비활성화하고 단위/브라우저 UX를 재확인했다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| frontend/src/features/manual-sync/syncContract.ts | 일반 UUID/순수 버튼 상태 판정 |
| frontend/src/features/manual-sync/manualSync.ts | 일반 원고 진입점/가용성·복구 보호, 기존 전송 경로 재사용 |
| frontend/src/features/manual-sync/useManualSync.ts | Outbox 상태·남은 작업·결과·404·중복 클릭 UX |
| frontend/src/app/AppLayout.tsx | 조회 상태와 session을 hook/header로 연결 |
| frontend/src/app/AppHeader.tsx | SyncStatus 옆 서버에 저장 버튼·결과 |
| frontend/src/features/notes/NoteEditor.tsx | 테스트 전용 패널 제거 |
| frontend/tests/manualSync.test.mjs | 일반화 계약/차단/상태 매트릭스 |
| frontend/tests/browser/manualSyncLive.cjs | 기존10개 UI assertion 갱신 |
| frontend/tests/browser/manualSaveUx.cjs | 신규 dev/production mock UX |
| scripts/manual-sync-lab.py | 테스트env 제거/신규 UX 추가/별도 결과 파일 |
| frontend/README.md | 일반5173 사용법과 제품 계약 |
| docs/design/manual-server-save.md | 현재 상태/책임/오류/안전성 계약 |
| docs/design/outbox-idempotency.md | 최신 제품 계약 안내 |
| docs/learning/2026-10-26-note-storage-flow.md | 역사적 실증 보존/현재 제품 안내 |
| docs/verification/2026-10-26-manual-save-results.json | 이번 실제 수직 통합 수치/hash |
| docs/worklogs/2026-10-26-manual-save-ux.md | 작업 순서/파일/결과 |
| docs/troubleshooting/2026-10-26-manual-save-availability.md 및 README | 제한·UX 위험·테스트 mock 오류/검증, Git 제외 유지 |

## 실제 검증 결과

- `pnpm build`(TypeScript 포함), `pnpm lint`, `pnpm test`: 성공,101 / failures0 / skipped0.
- 새 PostgreSQL14.20 UTF8, UI25175/API18766/DB25442, `/private/tmp/seam-note-manual-sync-lqnutdyp`. Backend27 / failures0 / errors0 / skipped0.
- 실제 수직 통합10개 통과. fixture note `8a617b1b-2130-4457-b99c-5af328d3fdd9`. 최종version13/Ledger13/Outbox0. 정상저장/전송·ACK중입력/중복·두탭/409/응답유실reload+같은key/500/잘못된응답key/ACKrollback/stalehead중단/clean원복보호를 유지했다.
- 기존 브라우저7종 통과: outboxStorage/localDraftStorage/noteDrafts/noteRouting/workspaceCreateDelete/workspaceReadonly/sidebarDraftTitles.
- 신규 manualSaveUx: dev25175 및 production preview25176 각각 통과, mock API만 사용. 제품 저장에는 별도env/fixture noteId가 필요하지 않음을 서로 다른 UUID2개로 검증했다.
- 첫 runner 실행은 마지막 신규 UX의 잘못된 mock 범위에서 exit1이었다. 앞선10개+7종 성공 결과와 이를 구분한다. 수정한 신규 UX는 standalone dev/production으로 재실행했다. 전체 runner를 최종 exit0했다고 주장하지 않는다.

## 한계

외부 삭제/다른 탭 상태는 조회 전까지 알 수 없다. 확인된 오류는 보존 후 차단하며 CAS/서버 version 검증은 최종 방어다. Web Locks 미지원은 기존처럼 중단한다. conflict 해결 UI/자동 동기화/인증은 추가하지 않았다. 서버와 IndexedDB 스키마는 그대로다.

최종 source hash/문서 링크/diff 공백/ignore를 확인했다. 임시25175(PID81590)/preview25176(PID76000)는 종료했고 사용자5173(PID37770)은 유지했다. 결과 로그의 성공 표기를 모두 PASS:로 가정한 검증 스크립트 assertion은 sidebar 테스트의 `titles passed:` 형식을 인정하도록 정정했다(제품 오류 아님).
