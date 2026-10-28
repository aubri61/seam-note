# 앱 시작·온라인 복귀 원고 자동 동기화 사전 검증

검증일:2026-10-28. **제품 NOTE_UPDATE 자동 전송을 추가하지 않았다.** 현재 이미 구현된 생성 전용 자동 반영은 유지했다. 기존 미커밋 작업도 보존했으며 commit/push하지 않았다.

## 결론

Draft/Outbox/ACK/Ledger의 데이터 보호 핵심은 재사용할 수 있다. 실제 강제 종료와 서버 GET 선행 실험에서 원고 유실은 발견하지 않았다. 그러나 `syncWorkspace()`를 시작/online effect에 그대로 반복 연결하는 단계로 넘어가서는 안 된다. 의도적 삭제 후 남은 수정 작업, ACK 실패·CAS의 재시도 구분, 후속 작업의 유한 재실행, 기존 생성 scheduler와의 통합, 서버·계정 범위를 먼저 정해야 한다. 인증 없는 공유/운영 서버로 모든 로컬 원고를 자동 업로드하도록 허용하는 것은 권고하지 않는다.

## 1. ‘삭제된 서버 원고 복구’가 뜨는 정확한 경로

`manualSync.ts`의 syncOneNote는 PUT404 **code=NOTE_NOT_FOUND**를 Outbox status=conflict/failureCode로 보존한다. useConflictList는 이 기록을 읽고 AppLayout이 모달을 자동으로 연다. inspectConflict는 최신 서버 GET을 다시 확인하고 SERVER_NOTE_DELETED를 선택한다. 기존 VERSION_CONFLICT를 비교하려고 GET했는데 NOTE_NOT_FOUND인 경우에도 삭제 복구 화면으로 전환된다.

- 단순 네트워크 실패, 모든404, 다른409, 로컬 CAS 거부를 무조건 삭제로 취급하지 않는다.
- 정상적인 미반영 새 로컬 노트는 CreationOutbox/LOCAL_UNPUBLISHED 계약으로 구분하며 서버 미생성을 삭제로 간주하지 않는다.
- 단순 상세 GET404만으로 항상 이 모달이 자동 생성되는 것은 아니다. 자동 진입은 충돌 목록 경로가 기준이다. clean 사본의 정확한 GET404 복구는 서비스가 지원하지만 현재 임의의 모든 조회 오류를 popup으로 바꾸지는 않는다.
- status=conflict/failureCode가 저장돼 있으면 다음 앱 실행에서도 즉시 다시 나타날 수 있다. 새 자동 NOTE_UPDATE 엔진이 이미 동작해서 뜬다는 뜻은 아니다.

### 현재 실제로 재현한 혼란 원인

1. 합성 원고를 편집해 pending NOTE_UPDATE를 로컬 저장.
2. 같은 앱의 원고 메뉴에서 직접 삭제를 확인하여 서버 DELETE 성공.
3. 선택/Query/Workspace는 정리되지만 해당 DraftSession/IndexedDB Draft와 기존 수정 Outbox는 남음.
4. 전체 동기화가 그 원고의 PUT을 보내고 서버가 NOTE_NOT_FOUND 반환.
5. 로컬 원문을 지우지 않기 위해 삭제 복구 모달 표시.

실제 Chrome/Spring/PostgreSQL에서 이 경로를 재현했다. 즉, **다른 기기가 지운 경우뿐 아니라 내가 의도적으로 삭제한 경우에도 나타날 수 있다.** 사용자 실제 화면의 특정 UUID/이력을 수집한 것은 아니므로 그 화면이 반드시 이 원인이었다고 단정하지 않는다.

코드 근거: workspaceMutations.ts의 deleteNoteMutationOptions는 목록/Query를 정리하지만 Draft/Outbox의 의도적 삭제 표식·취소 정책은 없다. useFolders.ts 삭제 callback도 선택 이동을 처리한다. SyncCoordinator는 Workspace 목록에서 사라졌다는 이유만으로 로컬 수정 작업을 버리지 않는다.

NOTE_NOT_FOUND가 확정하는 것은 ‘현재 연결된 서버가 ID를 찾지 못함’이다. DB/서버 환경이 바뀌거나 다른 API에 연결돼도 발생할 수 있어 물리 삭제의 이력을 증명하지는 않는다. UI의 ‘삭제된’ 문구는 이를 강하게 표현하고 있다. 후속으로 ‘서버에서 찾을 수 없는 원고’처럼 설명하고 의도적 삭제 정책을 별도로 정하는 것이 적절하다. 이번에 라벨/삭제 동작을 변경하지 않았다.

## 2. inFlight A + 추가 입력 B + 실제 종료/재실행

정상 write는 Draft A+B와 pending B를 **동일 readwrite transaction**으로 저장한다. 따라서 요청한 ‘A+B만 commit되고 B는 아직 없음’은 정상 commit 경계에 존재하지 않는다. 정상 경로2개와 합성 B 부재 주입2개를 구분해 현재 소스로 다시 실행했다.

| 조건 | 종료 직후 서버 | 복구·A replay | 이후 결과 |
| --- | --- | --- | --- |
| 서버 도달 전, 정상 B 존재 | v2 | 같은 key/payload로 v3 ACK | B expected3 → v4 |
| 서버 commit 후 응답 유실, 정상 B 존재 | v3 | Ledger의 기존 v3 재사용 | B expected3 → v4 |
| 서버 도달 전, B 부재 주입 | v2 | 실제 coordinator ACK가 B 생성 | 다음 명시적 pass가 B 발견 → v4 |
| 서버 성공·B 부재·ACK 삽입 실패 주입 | v3 | ACK 전체 rollback, 재시작 뒤 같은 A replay | B 생성/다음 pass v4 |

4/4 통과, Chrome root PID에 실제 SIGKILL5회. 각 A Ledger1건, B Ledger1건, 최종 Draft 제목/본문 보존·서버v4·Outbox0. A 요청은 처음3개 조건2회씩, 마지막 조건3회였으나 서버 중복 적용은 없었다.

acknowledge()는 Draft 기준 갱신/A 삭제/pending 재조정/새 B 생성이 같은 drafts+outbox readwrite transaction이다. 실제 successor 삽입 오류에서 A 삭제도 rollback됐다. A만 제거되고 B 생성 전 상태가 committed되는 틈은 없다. 제품 ACK/Outbox 저장 코드를 수정할 근거가 발견되지 않아 변경하지 않았다.

정상적으로 클릭 snapshot에 A+B가 함께 있으면 기존 bounded follow-up 정책에 따라 같은 coordinator pass에서 B까지 전송될 수 있다. B가 A ACK에서 새로 생겨 초기 snapshot에 없었던 조건은 다음 pass를 필요로 한다. 이를 ‘항상 다음 실행’ 또는 ‘항상 한 번에 완료’라고 단정하지 않는다.

## 3. 서버 GET/전송과 로컬 복구의 순서

별도 격리 페이지에서 실제 서버의 A 성공 v3를 GET해 receive()한 뒤, IndexedDB read를 gate로 지연했다. 그동안 실제 syncWorkspace를 테스트가 명시 호출했다. 제품 startup hook을 추가한 것이 아니다.

- dirty A+B: 복구 전 Draft=null, PUT0. 복구 후 A+B/기준v2/serverProtected 유지. A replay와 B 전송 뒤 서버v4에 A+B 보존.
- clean revert + 미확정 A: 로컬 텍스트가 기준과 같아 dirty=false여도 A가 서버를 바꿀 수 있다. 복구 전 GETv3가 들어와도 원복한 제목/본문을 덮어쓰지 않았고 PUT0. 복구 후 같은 A replay와 보상 B를 통해 서버v4가 원복 내용이 됨.

근거:

- DraftSession.recover/applyServer는 로컬 read 전에 server를 보관하며 기준 원고 초기화를 기다린다.
- repository.read는 Draft/Outbox/local entity 상태를 같은 readonly transaction으로 읽고, frozen 작업이나 미반영 생성이 있으면 serverOperationPending을 계산한다.
- dirty 보호만으로는 부족하다. serverProtected가 미확정 작업의 clean revert도 보호한다.
- Coordinator.safeNote → readyForSync/flushLatest 뒤에만 claim/HTTP를 수행한다. 이 경로를 우회하여 Query 결과로 Draft나 요청 body를 새로 만들면 검증한 보호 범위 밖이다.

외부에서 모든 Outbox를 지운 dirty Draft나 손상된 백업을 복원한 상태까지 자동 수선한다는 의미는 아니다. Coordinator는 작업 큐 중심이므로 그러한 상태는 startup preflight에서 감지·보류할 후보이며, 일반 경로에서 고아가 발생했다고 관측한 것은 아니다.

## 4. Coordinator 재사용 범위와 최소 구현안

### 그대로 유지할 부분

유한 click snapshot, 부모 생성 순서, 원고별 복구/flush, 기존 Idempotency-Key/expectedVersion, global Web Lock, ACK/CAS, 독립 원고 계속 처리, terminal 작업 보존, network 연속 실패 후 fan-out 중단을 재사용한다.

실제 두 탭에서 같은 Coordinator를 명시 호출하고 첫 HTTP를 보류했다. 두 번째 호출은 global lock 때문에 즉시 거부됐고 실제 PUT1회/서버v1만 발생했다. 별도9개 멀티탭 회귀에서 서버 lock 도중 다른 탭의 로컬 입력·commit이 가능한 것도 확인했다.

### 후속 구현의 최소 순서(제안만, 미구현)

1. 허용할 서버·워크스페이스/사용자 범위를 명시. 인증 전에는 격리된 로컬 demo/test의 명시적 opt-in 범위만 고려.
2. 의도적 자기 삭제의 local intent를 정의. 서버 삭제 확인 후 archive/취소·미확정 작업 처리와 복구 popup 제외를 같은 로컬 원자 경계로 설계. pending/inFlight를 무조건 지우는 해결책은 채택하지 않음.
3. 기존 생성 scheduler와 수동 sync의 진입점을 한 wake/run gate로 조정. 시작/online 이벤트를 coalesce하고 탭 하나만 실행. 새 독립 scheduler가 syncWorkspace 바깥에서 같은 Web Lock을 다시 잡으면 내부 lock을 거부할 수 있으므로 이중 취득 금지.
4. 복구 완료/로컬 commit → 기존 syncWorkspace 1회 → 결과 분류. 복구 실패한 원고는 보내지 않고 독립 원고만 계속.
5. A ACK에서 새 B가 생긴 경우만 유한 후속 pass를 설계. 현재 메모리 revision/클릭 대상과 ACK에서 파생된 작업을 확인하고 최대 횟수 제한. 남은 작업 전체를 무한 drain하지 않고, 실행 중 추가 입력을 끝없이 업로드하는 autosave로 확장하지 않음.
6. retryable network/lock과 user-review/local-storage failure를 별도 관리. localFailures에 stage/code 같은 기계 판독 필드가 필요하며 문자열 파싱으로 ACK 실패와 CAS를 섞지 않음. schema 재작성은 필요하지 않지만 결과 계약의 보완은 필요.
7. 활성 상세 GET/Workspace invalidate는 기존 clean/dirty 분리 유지. beforeunload/페이지 종료 중 네트워크 완료를 약속하지 않으며 commit된 큐를 다음 실행에서 처리.

## 5. 중단·재시도 정책 제안

| 상태 | 처리 | 재시도 기준 |
| --- | --- | --- |
| VERSION_CONFLICT409 | 해당 원고 보류, snapshot/Draft 보존, 최신 서버 Diff | 사용자 버전 선택 후 새 key/최신 expectedVersion |
| IDEMPOTENCY_KEY_REUSED409/UUID 충돌 | 버전 충돌로 합치지 않고 해당 작업 격리 | 원인 확인 전 자동 새 key 교체·반복 금지 |
| NOTE_NOT_FOUND404 | 해당 원고 보류, 로컬 보존, 필요 시 새 UUID 복구 선택 | 자동 재생성/무한 PUT 금지. 의도적 자기 삭제는 별도 정책 |
| 일반404/잘못된 주소 | 삭제로 단정하지 않음 | API 환경·계약 확인 |
| LOCAL_DRAFT_CONFLICT | 검증된 metadata-only 재조정만 허용 | 실제 다른 내용은 사용자 선택, 토큰 강제 교체 금지 |
| ACK 실패 | 성공 여부를 임의 확정하지 않고 inFlight/최신 Draft 유지 | IDB 상태·head 재확인/복구 후 같은 key. 현재 session failed/conflict면 Coordinator만 반복해도 전송 차단됨 |
| 네트워크/timeout/5xx | 같은 frozen key/payload 유지, 전역 fan-out 제한 | bounded exponential backoff+jitter, 이후 다음 명시적 wake |
| 두 탭 lock 점유 | 중복 전송 없이 다른 탭에 맡김 | 짧은 jitter 또는 큐 변화/다음 wake, network 장애로 오분류 금지 |
| 401/403(인증 추가 후) | 전체 전송 중단 | 계정/권한 확인 후 재개, 다른 계정의 큐 전송 금지 |

ACK 실패 후 같은 세션은 phase=failed/conflict여서 readyForSync/syncOneNote가 차단한다. 네트워크 재시도처럼 단순 타이머로 계속 호출하면 해결되지 않는다. 기존 session.retry의 안전한 head 재확인 또는 앱 재실행 후 복구가 먼저다. 이번 실제 ACK rollback/restart/replay는 이를 검증했지만 범용 자동 로컬 복구 정책을 구현한 것은 아니다.

## 6. 인증 없는 서버에서의 범위와 위험

현재 WorkspaceService는 전역 폴더/노트를 반환한다는 코드 주석과 구현이 있다. NoteService.requireNote는 UUID findById이며 소유권 조건이 없다. build.gradle에는 Spring Security가 없고 별도 authorization/filter/principal 검사도 소스 검색에서 찾지 못했다. 실제 lab GET/PUT/DELETE는 Authorization 없이 성공했다.

- UUID, expectedVersion, Idempotency-Key는 인증/소유권 검증이 아니다. version을 알면 수정 계약을 만족할 수 있고 다른 사용자의 접근을 막지 못한다.
- 자동 전송은 클릭 없이 로컬 원문을 서버로 보내므로 잘못된 API/DB 환경 또는 공유 서버에 업로드할 위험이 커진다. 같은 브라우저 origin에서 proxy 대상만 바뀌어도 현재 Outbox에는 API identity/account/workspace binding이 없다.
- 기본 허용 범위는 비공개 loopback/테스트 서버·합성 원고·명시적 opt-in으로 제한하는 것이 적절하다. 실제 다중 사용자/외부 공개 서버의 자동 업로드는 인증/소유권·Workspace 필터·Ledger 응답 접근 검증 및 로컬 큐 계정 분리를 먼저 마련해야 한다.
- 사용자 전환/로그아웃/서버 변경 시 기존 큐를 자동 재귀속하면 안 된다. 인증 도입 후404가 권한 은닉 응답일 수 있으므로 ‘삭제’와 ‘권한/환경’도 재검토해야 한다.
- 이미 승인되어 구현된 생성 자동 반영에도 같은 서버·소유권 제약이 적용된다. 이번 분석에서 그 기능을 켜거나 끄지 않았다.

## 7. 실제 검증 수치와 한계

| 묶음 | 현재 소스로 실행한 결과 |
| --- | --- |
| 실제 Chrome SIGKILL/동일 프로필 재실행 | 4조건 통과, SIGKILL5회 |
| 기존 충돌/선택/키 충돌/ACK rollback/삭제 보호 | 14개 통과 |
| 기존 멀티탭 metadata/CAS/서버 lock 중 로컬 저장 | 9개 통과 |
| GET 선행 dirty/clean revert, 두 탭 Coordinator, 자기 삭제 popup | 4개 통과 |
| Node 단위 테스트 | 169개 통과 |

위 묶음들은 보호 경로가 겹치므로 독립 커버리지 총합으로 과장하지 않는다. 연구 origin25175/API18766/PostgreSQL25442의 새 DB와 합성 UUID/새 Chrome 프로필만 사용했다. 원고 원문 대신 hash/id/version을 기록했다. Chrome SIGKILL은 OS 전원 차단·디스크 고장·브라우저 저장소 회수 보장이 아니다. Safari/실제 모바일/운영 인증 환경은 미검증이다.

첫 crash 하네스 실행은 DevToolsActivePort 파일이 존재하되 내용이 아직 비어 port0을 읽은 실행 준비 경합이었다. 양의 port와 WebSocket 경로가 모두 기록될 때까지 기다리도록 테스트만 보완했다. 제품 저장 오류로 해석하지 않는다.

실행 코드: inFlightCrashRecovery.cjs(출력 경로 지정), conflictResolutionLive.cjs(출력 경로 지정), multiTabConflictAfter.cjs, autoSyncReadinessAudit.cjs. 실제 결과는 docs/verification/2026-10-28-auto-sync-audit-{crash,conflicts,multitab}.json 및 auto-sync-readiness.json이다. 제품 frontend/src·backend/src 전체 hash를 분석 시작/종료에 비교해 동일함을 확인한다. 변경은 조사 코드와 문서뿐이다.

## 코드 근거 바로가기

- [로컬 저장·읽기·ACK](../../frontend/src/features/local-drafts/draftDatabase.ts): read, write, acknowledge.
- [복구/서버 수신/ACK fence/재시도](../../frontend/src/features/local-drafts/draftSession.ts): recover, applyServer, readyForSync, acceptServerAck, retry.
- [전체 전송 pass](../../frontend/src/features/manual-sync/SyncCoordinator.ts): planWorkspaceSync, safeNote, allowedOperationIds, bounded follow-up.
- [개별 수정 전송](../../frontend/src/features/manual-sync/manualSync.ts): syncOneNote, sendNoteSnapshot, markConflict.
- [삭제 복구 판정·재검증](../../frontend/src/features/conflicts/conflictService.ts): deletedError, inspectConflict.
- [사용자 삭제 후 Query 정리](../../frontend/src/features/workspace/workspaceMutations.ts): deleteNoteMutationOptions.
- [삭제 후 선택 이동](../../frontend/src/features/folders/useFolders.ts): useDeleteNoteMutation callback.
- [전역 Workspace 조회](../../backend/src/main/java/com/seamnote/backend/workspace/service/WorkspaceService.java).
- [UUID 기반 원고 조회·수정·삭제](../../backend/src/main/java/com/seamnote/backend/note/service/NoteService.java).
- [operationId 기반 Ledger](../../backend/src/main/java/com/seamnote/backend/note/idempotency/NoteUpdateLedger.java).
