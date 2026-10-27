# 모든 원고의 명시적 수동 서버 저장

후속 오프라인 생성 단계에서 additive v4와 FOLDER_CREATE/NOTE_CREATE·생성 Ledger·부모 우선 명시적 반영을 추가했다. 최신 생성/수동 저장 흐름은 [오프라인 생성 계약](offline-creation.md)을 따른다. 아래는 해당 선행 단계의 설계·실증 기록이다.


2026-10-26 수동 수직 통합에 있던 DEV/실험UUID gate를 제거했다. 개발·프로덕션 공통으로 현재 열린 정상 원고를 사용자가 클릭할 때만 저장한다. localhost5173은 기존 `/api`와 Vite proxy를 그대로 사용한다. 별도 실험 모드/DB/env 설정은 제품 기능을 사용하는 데 필요 없다.

## 위치와 상태 소유

- `AppLayout`은 URL/Workspace/상세 조회와 로컬 Draft 상태를 모아 저장 가능 여부를 전달한다.
- `AppHeader`는 기존 SyncStatus 바로 옆에 `서버에 저장` 버튼을 놓고, 아래에 현재 안내·남은 Outbox 작업 수·해당 원고의 결과를 표시한다. 에디터 본문의 실험 패널은 제거했다.
- `useManualSync`는 로컬 Outbox를 읽어 상태를 표시하고 명시적 이벤트에서만 `syncOneNote`를 호출한다. Query 캐시는 서버 상태만 유지한다. 최신 성공 결과는 해당 원고 revision에 대해서만 완료 문구를 유지한다. 추가 입력 뒤 과거 완료 문구를 최신 입력의 완료처럼 보여주지 않는다.
- Outbox 조회는 entry/busy/결과 변경과 focus/visibility 때 갱신한다. 늦은 read는 noteId/entry/sequence로 무시한다. 이 조회는 서버 PUT을 발생시키지 않는다.

## 저장 가능 여부

| 상태 | 버튼/안내 |
| --- | --- |
| 정상 원고, dirty 또는 아직 로컬 commit하지 않은 입력 | 사용 가능, 클릭 시 flushLatest로 최신 commit 확인 |
| clean + Outbox0 | 비활성, 서버에 저장할 변경사항 없음 |
| inFlight | 동일 key/snapshot의 명시적 재시도 가능 |
| pending 후속 작업 | 남은 개수 표시, 다음 클릭으로 한 작업 전송 |
| Outbox conflict | 비활성, 충돌 해결 필요/원고 보존 |
| 로컬 recovering/failed/conflict, Outbox 조회 실패/대기 | 비활성, 로컬 복구·상태 확인 필요 |
| 잘못된 UUID/Workspace 제외/조회 오류/알려진404/삭제 중 | 비활성 |
| 같은 탭 요청 중 | 비활성+동기 ref 방어 |
| 다른 탭에서 전송 중 | Web Lock 획득 실패로 전송 없이 안내 |

외부에서 삭제한 원고를 캐시만으로 즉시 알 수는 없다. PUT404도 로컬 작업을 지우지 않고 보존하며 이후 전송을 차단하고 GET을 갱신한다. 성공 ack가 불확실하거나 로컬 저장 실패 상태면 먼저 기존 `로컬 저장 다시 시도`로 상태를 확인해야 한다. 서버 충돌 자동 해결은 없다.

## 기존 전송 안전성

`syncOneTestNote`를 제품 의미의 `syncOneNote`로 바꾸고 지정UUID 인자를 제거했다. 정상 UUID와 session noteId/복구 상태를 검사하고, flush와 claim의 await 뒤에도 현재 조회/가용 상태를 확인한다. 조회 불가로 바뀌면 작업을 보존한 채 중단한다.

그 외 순서는 기존과 같다: 노트별 Web Lock → 미확정 서버 재초기화 보호 → flushLatest → 저장 head CAS → prepareManual → 불변 snapshot PUT(`/api/notes/{id}`) → response key/snapshot/version 검증 → ack fence → Draft와 성공 작업/후속 rebase 원자적 commit → 추가 입력 로컬 저장. operationId/Idempotency-Key, expectedVersion, ACK transaction과 IndexedDB v1/v2 선언, 백엔드 API는 변경하지 않았다.

응답 유실/네트워크 실패는 inFlight를 유지한다. 후속 pending은 실제 성공 version에 맞춘 새ID로 생성한다. 한 클릭은 한 작업만 처리하며 온라인 이벤트/재조회/입력은 서버 전송하지 않는다. Web Locks를 사용할 수 없는 환경은 기존처럼 중단한다. 프로덕션에는 실험 UUID/env gate/원고 ID 디버그 메시지를 노출하지 않는다. 임시 DB와 브라우저 검증 스크립트는 제품 번들에 포함되지 않는다.

## 검증

[작업 이력](../worklogs/2026-10-26-manual-save-ux.md)에 실행 결과를 기록한다. 실제 개발 DB/기존 원고는 테스트로 수정하지 않는다. mock API/실제 격리 fixture를 사용하며 제품 사용 시 별도 실험 DB를 요구하는 것은 아니다. [이전 학습 문서](../learning/2026-10-26-note-storage-flow.md)는 첫 수직 통합의 당시 기록이며, 버튼 노출·이름·위치·활성 조건은 이 문서를 따른다.
