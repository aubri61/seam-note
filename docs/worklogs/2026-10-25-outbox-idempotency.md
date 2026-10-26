# Outbox + 서버 멱등성 기반 작업 이력

## 범위와 보존

feat/offline-local-storage에서 기존 미커밋 로컬 저장·사이드바·측정 문서를 보존했다. 이번 요청은 Draft/Outbox의 원자적 기록과 Note 수정 성공의 재사용까지다. 자동 HTTP 전송·온라인 재시도·성공 ack·충돌 병합·PWA는 추가하지 않았다. commit/push는 요청하지 않아 수행하지 않았다.

## 실제 작업 순서

1. AGENTS.md/git status/log, v1 schema/CAS/session/lazy repository, NoteController/NoteService/DTO/@Version, Flyway V1/V2와 기존 API/마이그레이션 테스트, 로컬 저장 설계를 분석했다.
2. 아직 Draft와 전송 의도/서버 적용 결과가 각각 원자적으로 기록되지 않는 위험을 로컬 troubleshooting에 기록했다. v1 선언/과거 migration을 보존하고 성공 replay 기록은 무기한 보존하는 계약을 정했다.
3. outboxModel.ts에 immutable 요청 snapshot, 상태/attemptedAt 검증, 새 key 기반 미전송 병합, frozen 작업 뒤 clean 원복의 후속 의도를 설계했다.
4. draftDatabase.ts에 additive v2/dirty 백필/known-schema preflight, [drafts,outbox] CAS transaction, 조회/claim/conflict 상태 전이를 구현했다. DraftSession/DraftRepository 인터페이스/기존 직렬화 정책은 바꾸지 않았다.
5. Flyway V3에 PK가 있는 성공 ledger를 추가하고 NoteUpdateLedger/IdempotentNoteUpdates를 구현했다. 기존 controller의 수정 경로만 wrapper로 연결하고 key 재사용409를 공통 ErrorCode에 추가했다. NoteService/@Version/DTO/기존 잠금 코드는 그대로다.
6. 기존 Java 환경/Gradle offline 캐시로 컴파일했다. 기존 DB 대신 새 /private/tmp PostgreSQL 클러스터를 초기화해127.0.0.1:25441/seam_note_outbox_test에서만 테스트했다. 실제 버전은14.20이다.
7. API 멱등 테스트9개를 작성했다. 첫 테스트 컴파일의 var 복합 선언 오류를 분리 선언으로 고쳤다. response drop은 실제 API commit 뒤 TCP proxy가 응답 바이트 없이 연결을 닫도록 구현했다. ledger insert trigger 실패는 테스트 DB에서만 주입했다.
8. READ_COMMITTED를 wrapper에 명시했다. 요청 fingerprint는 필드 길이와 UTF-16 code units를 사용하고 경계/Unicode/note/version 테스트3개를 추가했다. 전체 backend27개와bootJar가 성공했다.
9. frontend의 모델 테스트5개와 lazy outboxRepository adapter를 추가했다. 최초 build 명령을 저장소 root에서 실행한 위치 오류는 frontend 디렉터리에서 재실행해 해결했다. build/tsc/lint/Node84개가 성공했다.
10. 신규 outboxStorage.cjs로 실제 Chrome/별도 이름의 IndexedDB에서 upgrade/백필/rollback/병합/claim/CAS를 검사했다. 닫힌 Dexie instance는 자동 재개방되지 않는 테스트 오류를 새 connection 사용으로 수정했다. 이후 대기가 긴 실행은 테스트만 종료하고 단계별 진단/초기화 제한 시간을 추가했다. 원인이 확인되지 않은 대기를 제품 데이터 오류로 기록하지 않았으며 최종 전체 시나리오는 통과했다.
11. frontend 최종 소스를 고정한 뒤 신규1종+기존6종 브라우저 테스트를 모두 통과했다. 실제 두 탭 회귀에는 패자의 Outbox 부분 기록 부재/pending 승자 하나 검증을 추가해 해당 스크립트를 다시 통과했다.
12. 설계/기존 v1 설계 follow-up/README, 이 작업 이력과 로컬 troubleshooting을 갱신했다. 기존 측정 JSON은 과거 source hash의 기록으로 유지하고 현재 코드인 것처럼 다시 작성하지 않았다.
13. 기존 migration 해시·변경 범위·ignore·diff·문서 링크를 최종 확인하고 자체 Vite25173(PID53856)/임시 PostgreSQL25441만 종료했다. 사용자5173과개발DB15439/서버18765는 유지했다.

## 변경 파일 (이번 요청 기준)

| 파일 | 변경 |
| --- | --- |
| frontend/src/features/outbox/outboxModel.ts | 작업 모델/검증/새 ID 병합·원복 정책 |
| frontend/src/features/outbox/outboxRepository.ts | lazy 조회/claim/conflict adapter, 네트워크 없음 |
| frontend/src/features/local-drafts/draftDatabase.ts | v2 업그레이드/백필, atomic Draft+Outbox 저장, 상태 전이 |
| frontend/tests/helpers/loadModules.mjs | Outbox 모델 로드 |
| frontend/tests/outbox.test.mjs | 모델/버전/불변성/병합 5개 |
| frontend/tests/browser/outboxStorage.cjs | 실제 IndexedDB migration·원자성·경쟁 |
| frontend/tests/browser/localDraftStorage.cjs | 실제 두 탭의 Outbox 무부분기록 검증 |
| backend/src/main/resources/db/migration/V3__note_update_idempotency.sql | 성공 ledger 신규 table |
| backend/src/main/java/com/seamnote/backend/note/idempotency/NoteUpdateLedger.java | 동일 transaction JDBC lock/조회/기록 |
| backend/src/main/java/com/seamnote/backend/note/idempotency/IdempotentNoteUpdates.java | fingerprint/replay/NoteService 래퍼 |
| backend/src/main/java/com/seamnote/backend/note/controller/NoteController.java | 선택 Idempotency-Key/기존 수정 응답 연결 |
| backend/src/main/java/com/seamnote/backend/common/exception/ErrorCode.java | IDEMPOTENCY_KEY_REUSED |
| backend/src/test/java/com/seamnote/backend/NoteIdempotencyTests.java | 동시성/응답 유실/rollback 포함 API9개 |
| backend/src/test/java/com/seamnote/backend/note/idempotency/NoteUpdateFingerprintTests.java | fingerprint3개 |
| docs/design/outbox-idempotency.md | schema/전송 계약/보존/후속 엔진/테스트 |
| docs/design/local-draft-storage.md | v1 설명의 후속 v2 안내 |
| frontend/README.md | Outbox 기록과 실제 서버 동기화 구분 |
| docs/worklogs/2026-10-25-outbox-idempotency.md | 실제 변경 순서/검증 |
| docs/troubleshooting/2026-10-25-outbox-idempotency.md 및README | 로컬 전용 위험/시행 오류/검증, Git 제외 유지 |

## 최종 검증

- pnpm build(tsc 포함), pnpm lint 성공.
- pnpm test:84 / failures0 / skipped0 (기존79+신규5).
- Chrome browser7종 성공:outboxStorage/localDraftStorage/noteDrafts/noteRouting/workspaceCreateDelete/workspaceReadonly/sidebarDraftTitles.
- backend:TEST_DB_URL=jdbc:postgresql://127.0.0.1:25441/seam_note_outbox_test ./gradlew test bootJar --offline 성공. JUnit XML 집계27 / failures0 / errors0 / skipped0 (기존15+API9+fingerprint3).
- V1 SHA-256:56c668815f4f5b2e1813e3b04bc8c97a99715e48d349b2abf3d994027886b599
- V2 SHA-256:a0bcad8c7c9be4a9a1fad22390d51dea56aae8cee720f600d664a994119461f0
- 실제 개발 DB 데이터 변경 없음. 클라이언트 쓰기 시나리오는 격리 IndexedDB/mock API, 서버 쓰기는 전용 PostgreSQL만 사용했다.

## 한계

자동 전송·ack가 없으므로 inFlight 처리 후 선행 결과 확정/후속 version 재조정은 다음 단계다. 서버 ledger는 본문을 무기한 보존해 용량·삭제 정책이 필요하다. v2 upgrade는 모든 Draft를 toArray로 읽어 단일 transaction에서 백필하므로 대규모 원고 집합의 메모리/초기 열기 시간은 미측정이다. Safari와 PostgreSQL17 직접 검증은 수행하지 않았다. 유한 기간 정리나 인증을 도입할 때는 재시도 보장/key 범위를 별도로 설계해야 한다.
