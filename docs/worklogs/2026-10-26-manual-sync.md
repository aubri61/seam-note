# 수동 서버 동기화 수직 통합 작업 이력

## 범위·기존 작업 보존

`feat/offline-local-storage`의 기존 미커밋 로컬 저장/사이드바/측정/Outbox/멱등성 작업을 보존했다. 이번 변경은 지정 테스트 원고의 명시적 수동 PUT과 ack/rebase다. 자동 엔진·온라인 재시도·충돌 병합은 없다. commit/push는 수행하지 않았다. 사용자 개발 DB15439/API18765/프론트5173을 실험용으로 쓰지 않았다.

## 실제 작업 순서와 파일 변경

1. `AGENTS.md`, git 상태/이력, 설계/작업 이력/로컬 troubleshooting 규칙을 확인했다. DraftSession→lazy repository→Dexie v2 CAS/Outbox의 기록·claim, PUT DTO/expectedVersion/@Version, IdempotentNoteUpdates/Ledger의 transaction과 기존 테스트를 분석했다. 기존 코드에는 전송 성공 ack/후속 rebase가 없었다.
2. `docs/troubleshooting/2026-10-26-manual-sync-ack.md`에 전송 중 입력/flush/ack 경쟁의 구체적 근거를 먼저 기록했다. 사용자 손실 사례로 표현하지 않았다.
3. `frontend/src/features/manual-sync/syncContract.ts`에 DEV/지정UUID gate와 응답 key/noteId/snapshot/version 검증을 추가했다. `frontend/src/lib/api/client.ts`에 Axios PUT과 key header/15초timeout/응답 key 반환을 추가했다. 기존 API 오류를 보존한다.
4. `frontend/src/features/local-drafts/draftDatabase.ts`에 head CAS와 원자적 prepareManual/acknowledge를 추가했다. `frontend/src/features/outbox/outboxRepository.ts`에 lazy adapter를 추가했다. schema v1/v2와 migration V1/V2/V3는 변경하지 않았다. ack는 최신 저장 원고 유지+기준 갱신+확인된 한 작업 삭제+후속 새ID/expectedVersion 생성 전체를 하나의 transaction으로 처리한다.
5. `draftSession.ts`에 flushLatest/savedHead/acceptServerAck와 자체 쓰기 fence를 추가했다. fence 중 입력은 메모리에서 유지하고 commit 뒤 최신 입력을 로컬 저장한다. 다른 탭의 head CAS 실패는 중단한다. `manualSync.ts`에 Web Lock/한 작업 전송/같은 key 재시도/409보존/ack 순서를 연결했다.
6. `useManualSync.ts`에 중복 클릭 방지와 메시지, 실제 ack 뒤에만 서버 캐시 반영/트리 invalidate를 추가했다. `useNoteDrafts.ts`에서 AppLayout 소유 session을 전달하고, `AppLayout.tsx`/`NoteEditor.tsx`에 테스트 gate가 켜진 한 노트의 버튼만 연결했다. 기존 편집/라우팅/디자인을 유지한다. 일반 footer는 자동 전송이 없음을 정확하게 표현한다.
7. `backend/.../NoteController.java`는 성공 시 검증된 Idempotency-Key를 response header로 echo한다. 기존 NoteService/엔티티/잠금/EntityManager/DTO는 변경하지 않았다. Ledger/expectedVersion transaction을 그대로 사용한다. `vite.config.ts`에는 실험용 API target env override만 추가하고 기존18765기본값을 유지했다.
8. `tests/helpers/loadModules.mjs`, `tests/manualSync.test.mjs`, `tests/localDraftStorage.test.mjs`에 계약/실패/flush/fence 단위 테스트를 추가했다. ESLint의 preserve-caught-error 오류는 원인 cause 보존으로 수정했다. 루트에서 pnpm 명령 또는 frontend 위치에서 루트 상대 경로를 사용한 작업 명령 오류는 올바른 cwd에서 재실행했다(제품 오류 아님).
9. `scripts/manual-sync-lab.py`와 `tests/browser/manualSyncLive.cjs`를 작성했다. 새 임시 PostgreSQL(UTF8)·JUnit DB·실험 DB·신규 폴더/노트, 별도 Vite origin/cacheDir, 별도 Chrome profile을 사용한다. 임시 클러스터는 명시적 UTF8 initdb로 만들고 jar의 test profile 대신 전용 datasource CLI 인자를 사용했다. 닫힌/지연 route 처리 순서와 fresh-profile 초기 로컬 commit 대기 문제는 테스트 harness에서 수정했다. 실험 서버를 전용 process group으로 종료하도록 했다.
10. 첫 실제 통합9개와 기존 브라우저7종이 통과했다. `/private/tmp/seam-note-manual-sync-ems7p0yc`의 결과는 당시v11/Ledger11/Outbox0이었다. 이 결과를 전체 안전성으로 일반화하지 않고 추가 검토를 진행했다.
11. 전송 중 옛 기준 내용으로 되돌리면 dirty=false가 되는 경계를 발견했다. 먼저10번째 통합 테스트를 추가하고 `/private/tmp/seam-note-manual-sync-bumcb2gn`에서 실제 GETv12가 로컬 원복을 덮어쓰는 assertion 실패를 재현했다. 기대/실제 본문 해시가 달랐고, 사용자 데이터에서 실험하지 않았다.
12. `localDraftTypes.ts`의 read projection `serverOperationPending`과 `draftDatabase.ts`의 coherent drafts/outbox 읽기, `draftSession.ts`의 미확정 보호를 추가했다. frozen 작업이 있으면 dirty와 독립적으로 title/content/base를 유지하고 관측version만 갱신한다. 이 flag는 스키마 필드로 저장하지 않으며 write는 Draft 필드를 명시적으로 구성한다. 수동 시작부터 보호하고 실제 ack commit 후에만 해제한다. `noteDrafts.ts`/`localDraftStatus.ts`에 `서버 결과 확인 필요`를 추가했다. 재조회/복구 단위 테스트2개를 추가했다.
13. 최종 소스에서 build/tsc/lint 및 Node98개를 통과했다. 새 격리 환경 `/private/tmp/seam-note-manual-sync-l4sfzpk9`에서 백엔드27개, 실제 통합10개를 다시 실행해 통과했다. 같은 clean-revert probe의 기대/실제 해시가 일치했고 base11을 GETv12 뒤에도 유지했다. 동일 key replay→후속보상 별도 전송 후v13/Outbox0이다.
14. `docs/learning/2026-10-26-note-storage-flow.md`, 실제 결과 JSON/스크린샷, 이 작업 이력, 기존 README/Outbox 설계의 후속 안내, 로컬 troubleshooting 목록을 갱신했다. 과거 측정 JSON의 hash/수치는 현재 결과로 바꾸지 않았다. 마지막 기존 브라우저 회귀7종도 모두 통과했고, 전용 실험 프로세스/DB를 종료했다.

## 변경 파일 목록 (현재 요청에 한정)

- `frontend/src/features/manual-sync/{syncContract.ts,manualSync.ts,useManualSync.ts}`: 신규 수동 전송 계약/오케스트레이션/UI hook.
- `frontend/src/features/local-drafts/{draftDatabase.ts,draftSession.ts,localDraftTypes.ts,localDraftStatus.ts}`: CAS claim/atomic ack, 최신 저장 대기/fence, frozen 보호·복구/상태.
- `frontend/src/features/outbox/outboxRepository.ts`: lazy storage adapter 확장.
- `frontend/src/lib/api/client.ts`: PUT/key/응답 echo 처리.
- `frontend/src/features/notes/{noteDrafts.ts,useNoteDrafts.ts,NoteEditor.tsx}`: 상태 타입/session 연결/테스트 버튼.
- `frontend/src/app/AppLayout.tsx`, `frontend/src/features/sync/SyncStatus.tsx`: hook 연결, 상태 설명.
- `frontend/vite.config.ts`: 기존 기본값 유지, 전용 실험 target override.
- `backend/src/main/java/com/seamnote/backend/note/controller/NoteController.java`: 성공 operationId echo.
- `frontend/tests/{manualSync.test.mjs,localDraftStorage.test.mjs,helpers/loadModules.mjs,browser/manualSyncLive.cjs}`: 단위·실제 전 구간/실패 검증.
- `scripts/manual-sync-lab.py`: 독립 실행·검증·정리/학습 서버 모드.
- `frontend/README.md`, `docs/design/outbox-idempotency.md`, `docs/learning/2026-10-26-note-storage-flow.md`, `docs/verification/2026-10-26-manual-sync-*`, 이 문서: 계약/실행법/실증 결과.
- `docs/troubleshooting/2026-10-26-manual-sync-ack.md`와 목록: 로컬 전용 유지, Git ignore 확인.

## 검증 결과

- `frontend`에서 `pnpm build`(tsc 포함), `pnpm lint`, `pnpm test`: 성공, Node98 / failures0 / skipped0.
- 독립 스크립트의 `./gradlew test bootJar --rerun-tasks --offline`: 격리JUnit DB에서27 / failures0 / errors0 / skipped0.
- Chrome155.0.8059.86, PostgreSQL14.20(Homebrew), UTF8. 실험 DB `seam_note_manual_lab`, UI25175/API18766/DB25442.
- 노트 `d541a371-8b11-4843-8583-536243e3d6fa`, 최초 operation `b39dbd3f-8a8f-400a-bbf2-48c48341bd1b`: 실제v0→1/Ledger1/Outbox0, 별도 프로필 GETv1 일치.
- 실제 수직 통합10개 성공:10단계 정상 저장, 전송/ack 중 추가 입력, 중복 클릭/두 탭 lock,409, 응답 유실+reload+같은key,500+명시적retry, 잘못된응답key거부, ackrollback, stalehead중단/다른소유세션replay, clean원복+GET+응답유실+reload/보상.
- 최종v13/Ledger13/Outbox0. 브라우저 PUT19회에는 실패/같은key재시도 포함, 별도actor의 격리충돌수정1건은 이 네트워크 수집 바깥이다. 클릭당version13증가라는 뜻이 아니다.
- 기존 브라우저 회귀7종 통과: outboxStorage/localDraftStorage/noteDrafts/noteRouting/workspaceCreateDelete/workspaceReadonly/sidebarDraftTitles (mock API 또는 격리 IndexedDB).
- migration V1/V2의 SHA256은 이전 작업 기록과 동일하다. 결과 JSON의 핵심3파일 source hash/문서 링크/스크립트 문법/git diff --check도 확인했다.
- 실험 포트25175/18766/25442는 종료 후 LISTEN이 없고 기존5173 PID37770은 유지됐다.
- 원고 로그는 ID/version/hash만 사용했다. 제목·본문은 합성 fixture에서만 UI/DB로 처리한다.

## 한계·후속 연결

한 클릭은 한 작업만 처리한다. 온라인/포커스/재조회는 서버 전송하지 않는다. Web Locks 미지원은 중단하며, 멀티탭 stale head/불확실 ack는 무리하게 고치지 않고 보존 후 중단한다. conflict 해결 UI/자동 병합·자동 엔진·인증은 범위 밖이다. Ledger 무기한 보존/브라우저 회수 한계는 기존과 같다. 이 실험은 같은 origin Vite proxy이므로 응답 key header를 읽는다. 다른 origin을 직접 호출하도록 바꾸면 CORS에서 Idempotency-Key 요청 허용/응답 header 노출을 별도 확인해야 한다. Safari/PostgreSQL17/장시간 대규모 부하·성능은 검증하지 않았다.
