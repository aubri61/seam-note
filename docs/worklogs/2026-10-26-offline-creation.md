# 오프라인 생성·명시적 서버 반영 작업 이력

## 선행 커밋과 기준

사용자 요청대로 먼저 PWA 작업을 `0618d65 feat: PWA 오프라인 실행과 Workspace 원고 복원 구현`으로 커밋했다. 시작 브랜치는 feat/pwa-install이고 이후 생성 작업은 아직 커밋/푸시하지 않았다. ignore된 troubleshooting은 커밋하지 않았다. 시작 시 PWA 외 별도 사용자 미커밋 변경은 없었다.

## 실제 구현 순서

1. AGENTS.md, v3 Workspace/라우팅/DraftSession/Outbox/수동 저장/생성삭제 UI, Folder/Note DTO·Service·Controller, 기존 Ledger/Flyway/테스트를 읽었다. UUID는 client 지정 가능하지만 기존 POST의 재시도는409라 수정 멱등성을 생성에 가정할 수 없음을 확인했다. 구체적 예상 위험을 로컬 troubleshooting에 먼저 기록했다.
2. backend CreationLedger/IdempotentCreations와 신규 Flyway V4를 추가했다. type/entityId/payload fingerprint와 원래201 JSON을 entity 생성과 같은 transaction에 기록한다. 기존 NOTE_UPDATE key lock을 공유하고 양쪽 Ledger의 key 재사용을 검사한다. 기존 Folder/NoteService/JPA @Version/expectedVersion/구조 lock은 그대로다.
3. POST Controller를 wrapper로 연결하고 key echo/Location201/기존 body 필드를 보존했다. key 없는 기존 클라이언트도 유지한다. 과거 migration은 수정하지 않았다. compileJava/compileTestJava를 먼저 통과했다.
4. creationModel/creationStorage와 Dexie additive v4 localEntities/creationOutbox를 추가했다. 로컬 UUID 충돌/부모/순서 검증 뒤 entity+초기NoteDraft+create 의도를 한 transaction으로 commit한다. 기존 v1/v2/v3 선언/백필은 그대로다.
5. Draft CAS write가 미생성 note를 식별해 pending NOTE_CREATE를 새ID/snapshot으로 병합하도록 분기했다. inFlight/conflict는 변경하지 않고 최신 Draft만 기록한다. 확인 전 NOTE_UPDATE를 만들거나 기존 prepareManual로 보내지 못하도록 방어했다.
6. parent-chain 조회/claim/Folder ACK/Note ACK를 구현했다. parent ACK 전 child를 claim하지 않는다. Note ACK는 기존 session fence/token CAS로 최신 입력을 보존하며 baseVersion0/confirmed marker/Workspace/성공작업 제거/후속 NOTE_UPDATE를 원자적으로 처리한다. ACK receipt는 오래된 GET의 일시적 항목 누락을 보충하되 이후 서버 snapshot을 존중한다.
7. creationSync의 global ifAvailable Web Lock, 불변 POST/응답 검증/409표시/원래key 재시도/부모실패 중단을 추가했다. 기존 useManualSync에서 생성 체인을 먼저 처리하고 기존 syncOneNote로 후속 PUT을 연결했다. 폴더만 선택한 경우 별도 명시적 저장 버튼을 제공한다.
8. localCreations mutation/useFolders/Workspace cache merge/Note Query를 연결했다. 온라인에서도 local-first다. 현재 위치/UUID/URL 이동을 유지하고 서버에 없는 local note는 GET도 생략한다. Workspace cache는 서버 metadata, localEntities는 별도 상태이며 pending 생성은 GET으로 사라지지 않는다.
9. 기존 + dropdown 안에서 folder 이름/현재위치·최상위 선택을 생성 전 Radix/Emotion dialog로 받고, tree에 로컬 표시를 추가했다. 기존 에디터/Draft/라우팅을 유지한다. local note 삭제는 차단하고 오프라인 이름변경은 구현하지 않았다. 로컬 저장과 서버 생성 완료/남은 작업 상태를 구분한다.
10. 최초 tsc는 tree prop/명시 타입 누락, lint는 사용하지 않는 destructuring 필드를 검출했다. 타입과 명시적 summary 생성으로 수정했다. build의 불필요 dynamic import 경고는 이미 static인 module을 static import로 정리해 해결했다.
11. 신규 Spring 테스트8개를 추가해 최초 격리 실행에서 모두 통과했다. 같은키/동시POST/다른본문·UUID충돌/cross-update key/부모없음/ledger insert rollback을 확인했다. 총35개다.
12. offlineCreationLive.cjs와 runner --creation을 추가했다. production SW/별도 HTTP proxy/실제 임시 Spring/PostgreSQL/격리 persistent Chrome을 사용한다. 이전 v3 record의 bytes를 검사하고 offline A→B→C 생성/재실행, 부모실패/부분성공/응답유실/추가입력/두탭/ACKrollback/폴더단독저장을 검증했다.
13. 첫 browser 실행은 두 새문서 버튼의 모호한 test locator여서 menu scope로 수정했다. TCP response drop 주입 실행에서는 예상 error UI 대기가 timeout됐다. 그 실행의 원인을 확정하지 않았고 브라우저 자동재전송이라고 단정하지 않는다. 이후 원래 성공응답을 잃은 gateway502로 실패를 명시해 같은key replay를 검증했다. local pending/서버 Ledger 검사가 통과했다.
14. 생성 실증10개가 통과한 뒤 기존 unknown-schema 회귀가 실패했다. local merge read 오류가 성공한 서버 metadata까지 가리는 실제 회귀였다. live server view와 로컬 실패 안내를 분리하고 별도 단위 회귀를 추가했다. 저장소 오류 시 session의 기존 write 금지는 유지한다.
15. 생성/삭제 회귀는 의도적으로 바뀐 local-first 계약에 맞춰 갱신했다. 삭제된 server UUID404와 미생성 UUID GET을 구분했고, cold URL에서 Workspace 분류 전 GET 가능성은 코드 분석으로 예방했다. local marker를 detail Query에서도 확인하며, skipToken local detail에는 목록 refresh가 억지 refetch를 하지 않는다. 서버 부모404를 local note404로 영구 차단할 위험도 분리했다.
16. 최종 격리 전체 실행은 생성10개/기존 실제 수정10개/브라우저8종/Backend35개를 모두 exit0으로 통과했다. production PWA10개도 v4에서 재실행했다. Node112개와 build/tsc/lint가 통과했다. 이후 local note의 완료된 로컬 저장 badge도 서버 미동기화로 정확히 표시하고 PWA source hash를 다시 검증했다.
17. 새 설계/README/기존 설계의 후속 안내/이 작업 이력/트러블슈팅/실증 JSON·이미지를 작성했다. 과거 커밋의 측정/검증 JSON을 현재 수치로 덮지 않았다. 기존 사용자 DB/profile을 테스트하지 않고 실험용 프로세스만 정리했다.

## 파일별 변경

| 파일 | 책임 |
| --- | --- |
| backend/.../creation/CreationLedger.java | 생성 성공 Ledger 조회/기록 |
| backend/.../creation/IdempotentCreations.java | POST fingerprint/동일 key replay/원자적 entity+Ledger |
| backend/.../note/idempotency/IdempotentNoteUpdates.java | 생성 Ledger와 key 재사용 차단 |
| backend/.../folder/controller/FolderController.java, note/controller/NoteController.java | POST key/201 echo/Location wrapper |
| backend/src/main/resources/db/migration/V4__creation_idempotency.sql | 신규 생성 Ledger, 기존 migration 유지 |
| backend/src/test/java/com/seamnote/backend/CreationIdempotencyTests.java | 생성 계약8개 |
| frontend/src/features/outbox/creationModel.ts, creationStorage.ts | typed 생성 작업·lazy 저장 adapter |
| frontend/src/features/local-drafts/draftDatabase.ts | v4/원자적 생성/생성 병합·claim·ACK/CAS |
| frontend/src/features/offline/workspaceCache.ts | 서버 metadata+local entity merge/실패 격리 |
| frontend/src/features/workspace/localCreations.ts | local-first useMutation/확인된 local cache 반영 |
| frontend/src/features/workspace/LocalFolderDialog.tsx | 생성 전 이름·위치 입력 |
| frontend/src/features/manual-sync/creationSync.ts | 명시적 부모순서 전송/응답검증/생성 fence |
| frontend/src/features/manual-sync/FolderCreationSave.tsx | 선택한 폴더 명시적 반영/결과 |
| frontend/src/features/manual-sync/useManualSync.ts, syncContract.ts | 생성+수정 큐 상태/생성 후 기존 PUT 연결 |
| frontend/src/lib/api/client.ts |201 POST+key/응답 correlation |
| frontend/src/features/folders/useFolders.ts, FolderTree.tsx | 로컬 생성/로컬표시/분류·선택 |
| frontend/src/app/AppLayout.tsx, app/sidebar/Sidebar.tsx | 기존 + flow와 생성 dialog·버튼·offline 안내 |
| frontend/src/features/notes/noteQueries.ts | local note GET 차단/정상 server Query 유지 |
| frontend/tests/creationModel.test.mjs, offlineWorkspace.test.mjs | 생성 snapshot2개+merge 실패1개 추가 |
| frontend/tests/helpers/loadModules.mjs, apiFoundation.test.mjs, workspaceMutations.test.mjs | 모듈/저장 adapter 격리 갱신 |
| frontend/tests/browser/offlineCreationLive.cjs | 실제 offline 생성10개/SQL·실패 주입 |
| frontend/tests/browser/workspaceCreateDelete.cjs | local-first 생성/기존 confirmed delete 회귀 |
| frontend/tests/browser/pwaOffline.cjs, outboxStorage.cjs | additive v4 기대값/별도 결과 출력 |
| scripts/manual-sync-lab.py | --creation production 실증+실제 update 회귀+기존 browser suite |
| docs/design/offline-creation.md, 이전 설계/README | 데이터 흐름·정책·한계·재현 |
| docs/verification/2026-10-26-offline-creation-* | 실제 생성/수정/PWA 결과와 합성 화면 |
| docs/troubleshooting/2026-10-26-offline-creation.md 및 목록 | 예상위험/실제회귀/검증, Git 제외 |

## 실제 검증 수치

- Node112 / failures0 / skipped0. 기존109+creation model2+local merge 회귀1. `pnpm build`(tsc)/lint 성공.
- Backend35 / failures0 / errors0 / skipped0. 기존27+creation8. PostgreSQL14.20 UTF8, 전용JUnit DB.
- 생성 production10개: v3→v4 bytes 보존, local atomic rollback,offline A/B/C 생성·편집,새프로세스PWA복원,부모실패,부분성공·성공응답유실,동일key재시도+두탭+추가입력,ACKrollback/replay,폴더단독저장,실제GET검증/기존Draft보존.
- 최종 생성 실증: origin `http://127.0.0.1:65517`, `/var/folders/j0/4ncpc9m90tg_c7d24lc1kvnr0000gn/T/seam-note-create-JsFX1b`. 네트워크 mutation9회(실패/replay 포함), 성공 생성Ledger5개, C는 생성v0 뒤 후속PUT으로v1. 서버 저장 횟수와 mutation 횟수를 같다고 주장하지 않는다.
- 같은 DB의 별도 합성 seed Note로 기존 수동 수정10개(정상/응답유실/500/409/두탭/ACKrollback/clean원복 등) 통과. 최종v13/해당NoteOutbox0. 이는 생성 실증에서 보존한 legacy server 원고를 별도 회귀 단계에서 명시적으로 테스트한 것이며 실제 사용자 원고가 아니다.
- 브라우저8종 통과:outboxStorage/localDraftStorage/noteDrafts/noteRouting/workspaceCreateDelete/workspaceReadonly/sidebarDraftTitles/manualSaveUx. 생성삭제 UI test는 기존 의도적 변경에 맞춰 local-first/no automaticPOST를 검증하고 server delete의 cancel/failure/success/선택을 유지한다.
- PWA production10개 회귀 별도 결과를 기록했다. Chrome155.0.8059.86. Safari/OS 설치 dialog/실제 운영CDN은 미검증이다.
- 마지막 real runner `/private/tmp/seam-note-manual-sync-3o3lni99`, frontend25175/API18766/DB25442. user5173 및 실제 개발 DB15439/API18765에 테스트 mutation을 보내지 않았다.

## 포트폴리오 의사결정과 사실 구분

1. **사전 식별/예방**: client UUID를 받는 POST가 멱등적이라는 가정은 틀렸다. 실제 기존 코드의409 동작을 근거로 생성 Ledger를 별도 설계하고 테스트했다. 과거 운영 중 중복 생성 사고가 있었다는 주장은 하지 않는다.
2. **사전 식별/예방**: 생성 전 NOTE_UPDATE/부모 미확정 child 전송/같은key payload 변경은 위험이다. local entity state와 독립 create queue, parent ACK 경계, pending 새ID 병합으로 막았다. 실제 격리 실패 주입과 SQL로 검증했다.
3. **실제 구현 중 회귀 발견·수정**: local storage read 오류가 유효한 server Workspace까지 가려지는 unknown-schema 회귀를 기존 테스트에서 재현하고 실패 격리로 수정했다.
4. **실제 격리 재현/방어 검증**: 서버 commit 후 성공응답을 잃고 gateway502를 받는 상황, ACK transaction delete 실패, 부모503,두 탭/추가입력을 주입했다. 실제 사용자 사고가 아니라 합성 검증이며 ID/version/hash만 기록했다.
5. **tradeoff**: 생성 queue를 별도 store로 두어 기존 update model·fence를 유지했고, 생성 전송은 보수적인 global Web Lock으로 직렬화했다. metadata receipt/서버 snapshot은 전체 workspace 전역 동기화 엔진이 아니다. 생성/수정 key Ledger는 무기한 보존해 정리 정책이 후속 과제다.

## 사용·배포 한계

새 생성 멱등성 API를 쓰려면 새 backend를 실행해 Flyway V4를 적용해야 한다. 테스트에서는 전용 DB에 적용했다. 구 backend를 성공한 것으로 추정하거나 응답 header 검증을 우회하지 않는다. 개발5173/production4173은 다른 origin이며 로컬 원고를 자동 이동하지 않는다. PWA waiting/캐시 회수/미commit 입력의 한계는 기존과 같다. 자동서버전송/오프라인이동삭제이름변경/충돌병합/인증은 범위 밖이다. 잘못된 부모/UUID 충돌은 보존 후 중단하며 자동 remap하지 않는다.
