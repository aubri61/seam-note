# inFlight NOTE_UPDATE 중 추가 입력과 Chrome 강제 종료 검증

검증일:2026-10-28. 개발 DB/사용자 프로필을 사용하지 않았으며 제품 ACK/Outbox 구현은 변경하지 않았다.

## 실제 구현과 요청 시나리오의 차이

현재 `DexieDraftRepository.write()`는 drafts/outbox/localEntities/creationOutbox를 같은 readwrite transaction으로 연다. `planOperation()`은 frozen A의 title/content와 최신 Draft를 비교해, 다르면 pending B를 생성한다. 따라서 **A+B가 commit됐지만 B가 아직 생성되지 않은 중간 상태는 정상 write의 commit 경계에 존재하지 않는다.** A가 서버에서 성공했는지와 관계없이 inFlight snapshot은 고정된다.

실제 Chrome에서 정상 write 후 Draft A+B와 Outbox A(inFlight)+B(pending)가 이미 함께 존재함을 확인했다. 요청한 B 부재 조건은 합성 노트의 pending B만 테스트에서 제거하여 별도로 주입했다. 이를 실제 제품에서 관측한 유실 버그라고 표현하지 않는다.

## ACK의 원자성 경계

`draftDatabase.ts`의 `acknowledge()`는 다음을 **동일한 drafts+outbox readwrite transaction**으로 처리한다.

1. 최신 Draft token/revision/baseVersion과 저장된 inFlight A snapshot 검증.
2. Draft title/content는 최신 A+B를 유지하고, 기준 title/content는 A snapshot으로 갱신. baseVersion은 실제 성공 version3.
3. 남은 pending 작업과 최신 Draft를 `planOperation()`에 전달.
4. Draft 저장, A 삭제, 대체할 pending 삭제, 필요하면 새 operationId의 B(expectedVersion3) 추가.
5. 전체 commit 후 Promise resolve. 이후에만 DraftSession checkpoint/token 갱신.

A 삭제 요청 뒤 B 추가 전에는 transaction이 아직 commit되지 않았다. 이 구간에서 오류/중단되면 모두 rollback하며 A만 사라진 committed 상태는 남지 않는다. 브라우저/OS 저장소 장애·수동 삭제까지 막는 외부 백업 보장은 아니다.

## 실제 실험 방법

- 별도 PostgreSQL14.20:25442, Spring:18766, Vite:25175, DB `seam_note_manual_lab`.
- 실제 Chrome156의 테스트 전용 user-data-dir를 직접 실행하고 CDP로 연결. 각 강제 종료는 **추적한 Chrome root PID에 SIGKILL**. 일반 close/reload/pagehide로 대체하지 않았다.
- 복구는 동일 user-data-dir와 origin에서 새 Chrome 프로세스를 실행했다. 총4개 조건, crash 경계 SIGKILL5회(ACK rollback 조건은 재차 종료).
- 격리 진단 HTML에서 실제 DraftSession/repository/syncOneNote/syncWorkspace 모듈을 사용한다. 입력 commit은 명시적 flush로 통제하고 debounce clock만 테스트가 제어한다. CAS·ACK·schema·서버 코드는 대체하지 않았다. 일반 앱 에디터의 clean/dirty 재조회는 별도 production UI 하네스로 검증했다.
- A를 서버에 보내기 전 또는 실제 server commit 뒤 HTTP 응답 전달 전에 Playwright route로 대기시킨다. 추가 입력을 실제 IndexedDB에 commit한 뒤 Chrome을 죽인다.
- B 부재는 테스트의 합성 pending B만 transaction으로 제거해 주입한다.
- ACK rollback은 실제 native `IDBObjectStore.add`가 successor 삽입 시 QuotaExceededError를 던지도록 주입한다. A 삭제 뒤까지 진행된 실제 Dexie transaction 전체가 rollback되는 것을 확인한다.
- 본문/제목은 출력하지 않고 SHA256, UUID, version/revision/token과 SQL md5(content)로 비교했다. 개발 주소5173/API18765/DB15439와 개발 DB를 하네스가 거부한다.

## 실행 결과

| 조건 | 강제 종료 직후 서버 | A 재전송 | A ACK 후 로컬 | 다음 명시적 B 전송 |
| --- | --- | --- | --- | --- |
| 서버 도달 전, 정상 B 존재 | v2 | 같은 key/payload → v3 | A+B 유지, 새 B expected3 | v4/ACK/Outbox0 |
| 서버 commit 후 응답 유실, 정상 B 존재 | v3 | Ledger replay v3 | A+B 유지, 새 B expected3 | v4/ACK/Outbox0 |
| 서버 도달 전, B 부재 주입 | v2 | 전체 sync에서 같은 A → v3 | ACK가 B 생성, 다음 실행으로 남음 | v4/ACK/Outbox0 |
| 서버 commit 후 응답 유실, B 부재+ACK 삽입 실패 주입 | v3 | 첫 retry ACK rollback, 재시작 후 같은 A → v3 | 실패 때 A/기준v2 유지; 다음 ACK에서 B 생성 | v4/ACK/Outbox0 |

4/4 통과. A HTTP 요청은 앞3개 조건에서각2회, rollback 조건3회였으나 Ledger A는 각각1건이다. B Ledger도 각각1건. 최종 서버 version4/title AB/content A+B를 실제 API GET과 PostgreSQL SELECT(version,md5(content))로 확인했다. 최종 Draft clean/Outbox0이다.

정상 B 존재 조건은 A retry를 syncOneNote로 한 번만 실행하고 이후 syncWorkspace로 B를 전송했다. B 부재 조건은 첫 retry부터 실제 syncWorkspace를 사용하여 snapshot에 A만 있더라도 ACK가 새 B를 남기며 다음 전체 동기화가 이를 발견함을 검증했다. 정상적으로 A+B가 클릭 snapshot에 함께 존재하면 기존 coordinator의 bounded follow-up 정책으로 같은 전체 실행에서 후속 전송될 수도 있다. 이를 무조건 다음 실행까지 미룬다고 주장하지 않는다.

## 결론과 한계

정상 write 및 ACK 원자성 경로에서 dirty Draft만 남고 전송 작업이 비는 고아 상태는 이번4개 실험에서 발생하지 않았다. 기존 v4/ACK/planOperation 구현이 이미 보호하고 있어 제품 저장 로직을 수정하지 않았다. 모든 Outbox를 외부에서 지운 손상 상태에 대한 범용 복구 엔진을 구현·검증한 것은 아니다. OS 전원 차단/디스크 고장/저장소 회수/Safari는 미검증이다.

- 실행 코드: `frontend/tests/browser/inFlightCrashRecovery.cjs`
- 실제 결과/환경/소스 hash: `docs/verification/2026-10-28-inflight-crash-recovery.json`
- 원고/작업 write: `frontend/src/features/local-drafts/draftDatabase.ts`의 `write`, `acknowledge`
- snapshot 계획: `frontend/src/features/outbox/outboxModel.ts`의 `planOperation`
- 메모리 ACK fence: `frontend/src/features/local-drafts/draftSession.ts`의 `acceptServerAck`
- 복구/전송: `frontend/src/features/manual-sync/manualSync.ts` 및 `SyncCoordinator.ts`

재현은 `python3 scripts/manual-sync-lab.py --serve`로 출력된 fixture를 SEAM_NOTE_LAB_FIXTURE에 지정하고 하네스를 실행한다. 합성 노트만 새로 생성한다. commit/push하지 않았다.
