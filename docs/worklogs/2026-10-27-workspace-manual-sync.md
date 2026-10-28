# Workspace 전체 수동 동기화 구현·실증

## 기준과 범위

기준 commit은35d8a78이며 시작 시 작업 트리는 clean이었다. 사용자 첨부 지시서의 전체 수동 동기화만 구현했다. 자동 서버 전송/재시도, 충돌 병합, 인증, 새 테이블/Dexie v5/Flyway 변경은 없다. 실제 개발 DB와 사용자 브라우저 프로필을 테스트에 사용하지 않았다. 요청대로 commit/push하지 않았다.

## 변경 순서와 파일

1. AppLayout/useNoteDrafts/DraftSession, 두 Outbox의 claim/ACK, creationSync/manualSync/useManualSync, Workspace merge, 서버 ErrorCode/Idempotency-Key/expectedVersion, 기존 lab runner·설계 문서를 읽었다. 기존 UI는 선택 원고+필요 조상만 처리하며 전역 Outbox scan을 하지 않는 정상 계약임을 확인했다.
2. `frontend/src/features/manual-sync/syncLock.ts` 추가: 기존 creation-sync global Web Lock을 재사용한다. `creationSync.ts`, `manualSync.ts`, `useManualSync.ts`를 수정해 개별 원고 전체 create+update를 한 global lock으로 감싸고 coordinator 내부의 lockHeld 경로에서는 재획득하지 않는다. 노트별 기존 잠금은 유지한다.
3. `frontend/src/features/local-drafts/draftSession.ts`: readyForSync 추가. 선택/URL을 바꾸지 않고 기존 recovery barrier를 기다리며 failed/conflict 원고를 강제 재초기화하지 않는다.
4. `frontend/src/features/local-drafts/draftDatabase.ts`: 두 Outbox/엔티티/Draft/Workspace의 원자 readonly snapshot, 경량 native count 추가. creation/UPDATE claim에 optional operationId allowlist를 transaction 안에서 검사한다. 기존 ACK/fence/token CAS/rebase는 재사용한다. conflict 기록에 선택적 failureCode metadata 추가.
5. `frontend/src/features/outbox/{creationModel.ts,outboxModel.ts,creationStorage.ts,outboxRepository.ts}`: optional failureCode 및 allowlist/실패 코드 전달. IndexedDB object store/schema v1~v4 선언은 HEAD와 byte 비교해 동일함을 확인했다. 기존 Flyway V1~V4도 byte 동일.
6. `frontend/src/features/manual-sync/workspaceSyncStorage.ts`와 `SyncCoordinator.ts` 추가: 메모리 원고별 flush, 고정 snapshot/의존 그래프/순환·누락 검사, 기존 생성·수정 함수 조율, 제한된 ACK 후속 UPDATE, 원고별 실패 격리, 최종 실제 큐 재조회. known NOTE_NOT_FOUND만 확인 필요로 보존하며 재생성하지 않는다. 연속 네트워크2건/권한 실패에서는 요청 확산을 중단한다.
7. `frontend/src/features/manual-sync/useWorkspaceSync.ts`, `frontend/src/app/{AppLayout.tsx,AppHeader.tsx}`: 전역 버튼, 실제 Outbox count, 미commit 원고 수, 실행 중 방지, 마지막 실행 ACK/충돌/확인/보류/네트워크/기타/로컬 실패/남은 작업과 항목별 안내. 개별 버튼을 유지한다.
8. 초기 build에서 index504.56kB의 Vite 경고를 확인해 coordinator를 클릭 시 dynamic import로 분리했다. 최종 index496.16kB, coordinator7.24kB. 실제 로딩 latency/프레임 개선은 측정하지 않았으며 PWA precache는 분리 chunk도 포함한다. count UI에서 매 입력마다 전체 본문 snapshot을 읽는 비용은 코드 분석으로 식별해 native count로 대체했다.
9. `frontend/tests/syncCoordinator.test.mjs` 신규13개, `manualSync.test.mjs`404 분류1개 추가, `helpers/loadModules.mjs` 모듈 등록. Node 총115→129개.
10. `frontend/tests/browser/workspaceSyncLive.cjs` 추가: production build·HTTP proxy·격리 Chrome persistent profiles·실제 Spring/PostgreSQL18개 scenario. 로그에는 작업 UUID/버전/제목·본문 hash를 남기며 기존 실제 원고를 사용하지 않는다.
11. `scripts/manual-sync-lab.py --workspace` 추가: 임시 PG DB/포트와 테스트 서버, 기존11개 browser suite 및 production PWA10개 실행. `frontend/tests/browser/pwaOffline.cjs`에 결과/이미지 출력 경로 alias를 지원해 과거 검증 결과를 덮어쓰지 않도록 했다.
12. 첫 실증에서18개 중 timeout scenario의 test15초 대기가 API15초 timeout보다 먼저 끝나 테스트를 수정했다. 최신 코드로 전체를 재실행해18개 모두 통과했다. 제품 timeout 정책은 변경하지 않았다.
13. `docs/design/workspace-manual-sync.md`에 함수 호출 순서/상태 전이/정책/실패·재현·한계를 작성했다. 기존 manual-server-save/offline-creation과 frontend README를 연결했다. `docs/troubleshooting/2026-10-27-workspace-sync.md` 및 목록 갱신(기존 gitignore로 로컬 전용).
14. 신규 검증 파일 `docs/verification/2026-10-27-workspace-sync-results.json`, `2026-10-27-workspace-sync-pwa-results.json` 기록. 최종 core5개 source hash가 실증 결과와 일치함을 확인했다.

## 실행 환경

- Node20.20.0, pnpm10.32.1, Chrome156.0.8078.48, PostgreSQL14.20(Homebrew).
- PG25442의 seam_note_manual_test / seam_note_manual_lab, Spring18766, 격리 Vite25175, 별도 production origin http://127.0.0.1:54421.
- Chrome profile과 build는 임시 디렉터리. DB/서버 로그 `/private/tmp/seam-note-manual-sync-boe8brbr`, production artifacts `/var/folders/j0/4ncpc9m90tg_c7d24lc1kvnr0000gn/T/seam-workspace-sync-Ro4BOQ`.
- 종료 후25442/18766/25175 listen 없음 확인. 개발15439/18765/5173 및 사용자 저장소는 초기화/변경하지 않았다.

## 실제 통합18개 결과

| 시나리오 | 관측·검증 |
| --- | --- |
| 여러 폴더만 생성 | ACK2, 남은0, 서버 Folder GET 확인 |
| A→B→C 노트 | POST 순서 A/B/C, 생성 Ledger3, 본문 일치 |
| 기존 원고3개/미선택 메모리 | ACK3, 각 서버 version1, UPDATE0개 남음 |
| 생성·수정 혼합 | ACK3, 두 Outbox0 |
| 부모 성공·하위 실패·독립 성공 | 첫 ACK2/남은2, 자식 전송 없음, 재시도 후0, 부모 POST1회 |
| POST 성공 응답 유실 | 동일 key2회 요청/생성 Ledger1, 최종0 |
| PUT 응답 유실·reload | 동일 key 복원, 서버 version1/수정 Ledger1 |
| 다른 프로필 선행 수정 | 충돌1/독립 원고 ACK1, 로컬 본문·VERSION_CONFLICT 보존 |
| 다른 프로필 실제 삭제 | NOTE_NOT_FOUND 격리, 재실행/reload 후 재PUT·POST 재생성0 |
| 지속502 | 첫2회만 요청/작업4개 보존, 다음 명시 실행 ACK4 |
| HTTP timeout | 원래 inFlight 보존, 재시도 후 Ledger1 |
| IndexedDB ACK rollback | 서버 Ledger1/로컬 기준 version0 유지, reload·동일 key 재시도로 version1/작업0 |
| 두 탭 전체/개별 경쟁 | 실제PUT1회, 경합 탭 전송0 |
| PUT 중 추가 입력 | 첫 실행PUT1/후속1 보존, 서버는 원래 snapshot, 다음 클릭으로 ACK |
| CREATE ACK 후 입력 | 노트POST1+후속PUT1만, 추가 입력/작업1 보존 |
| 완료 상태/initial read 실패 | 빈 큐 요청0, read 실패 전송0/완료 오인 없음 |
| 로컬 write 실패 | 메모리 유지, 독립 원고 ACK, 로컬 복구 뒤 실패 원고 저장 |
| production PWA 오프라인 재실행 | 동일 profile/origin 본문·생성2 복원, 오프라인 버튼 비활성, 온라인 명시 실행 ACK2 |

18개 시나리오의 proxy 기록은 총46개 쓰기 요청(POST18/PUT27/합성 원고 DELETE1)이다. 응답 유실·실패·재시도와 타 프로필의 명시적 요청을 포함하며 성공 작업 수와 동일하지 않다. 최종 PostgreSQL Ledger는 생성16/수정20이다. 멱등성 검증은 각 원래 operationId의 Ledger1건/버전 중복 증가 없음으로 확인했다.

## 나머지 검증

- pnpm build(TypeScript 포함), pnpm lint, pnpm test129개: 통과.
- 격리 backend35개: failures/errors/skipped0.
- 기존 browser11개: outboxStorage, localDraftStorage, noteDrafts, noteRouting, workspaceCreateDelete, workspaceReadonly, sidebarDraftTitles, manualSaveUx, inlineFolderCreation, folderExpansion, folderMenu 모두 통과.
- production PWA10개: 통과. 앱셸/오프라인 cold URL/이전 schema 보존/Recovery Barrier/업데이트/수동 ACK 회귀 포함. Safari 실증은 하지 않았다.
- 순환/중복/잘못된 부모/사라진 레코드, generic404·권한 실패 구분, 최종 read 실패, 무한 drain 방지, uncertain 선행+rebase 후속 순서 등은 별도 Node 테스트로 검증했다. 모든 항목을 실제 PostgreSQL scenario로 실행했다고 주장하지 않는다.
- git diff --check 통과. 실제 source hash 검증 통과. commit/push 없음.

## 남은 한계

다른 탭/프로필의 미commit 메모리는 이 Session이 flush하지 못한다. 최신 코드 동일 origin 탭의 global 잠금이며 구버전 탭을 강제 업그레이드하지 않는다. 실패·삭제 확인·충돌 해결 UI는 안내/보존까지이며 병합·원격 재생성·Tombstone은 없다. global lock 동안 폴더/원고 생성 commit이 대기할 수 있다. 서버 DB와 IndexedDB의 분산 원자성은 없으며 원래 key 재시도와 원자 ACK로 복구한다. 실행 중 새 입력/재조정된 작업은 남을 수 있고 다음 명시적 클릭이 필요하다.
