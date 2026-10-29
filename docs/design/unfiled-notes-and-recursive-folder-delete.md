# 폴더 없는 원고와 하위 전체 삭제

## 원고 위치 계약

- `notes.folder_id`는 nullable이다. `POST /api/notes`의 `folderId: null` 또는 생략은 폴더 없는 원고를 생성한다. `Note`, `NoteSummary`, 생성 Outbox의 folderId도 null을 유지한다.
- 이동 요청의 `targetFolderId: null`은 폴더 밖으로 이동하는 명시적 계약이다. 필드 누락은 계속 400이다. 이동 UI는 추가하지 않았다.
- 기존 `content: string`의 Tiptap JSON, `@Version`, expectedVersion, Idempotency-Key 계약은 유지한다.
- Workspace summary는 LEFT JOIN으로 폴더 없는 원고도 포함한다. 루트 원고의 sortOrder는 별도 partial unique index로 보호하며 기존 구조 잠금 아래 할당한다.
- 화면은 폴더 다음에 최상위 원고를 정렬한다. 폴더/노트 선택 시 기존 생성 위치를 유지한다. 선택이 없으면 폴더 없는 원고를 만든다. + 메뉴의 ‘폴더 없이 새 문서’는 선택과 무관하게 루트에 생성한다.
- root 원고의 생성 전송에는 부모 의존 작업이 없다. 제목/본문 Draft·Outbox/ACK는 기존 경로를 재사용한다.

## 삭제 경계

- `DELETE /api/folders/{id}`는 하위 폴더 및 원고 전체의 물리 삭제다. V5 migration에서 두 FK를 ON DELETE CASCADE로 바꾼다. 기존 V1~V4는 수정하지 않았다. FK cascade는 같은 서버 트랜잭션으로 확정된다.
- 확인 모달은 복구 불가·하위 전체·로컬 원고와 대기 작업 삭제를 명시한다. 취소하면 요청하지 않는다. 수치는 현재 Workspace에서 확인된 개수다. 다른 클라이언트의 새 하위 데이터까지 포함하는 서버 최종 개수는 보장하지 않는다.
- 전체 동기화/자동 생성과 동일한 Web Lock으로 삭제를 직렬화한다. 아직 시도하지 않은 로컬 subtree는 오프라인에서 취소할 수 있다. 서버 존재 가능성이 있는 subtree는 온라인 DELETE 성공 또는 정확한 FOLDER_NOT_FOUND 확인 후 정리한다.
- 서버 DELETE 실패 시 로컬 원고·Outbox를 유지한다. 서버 성공 뒤 IDB 정리가 실패하면 실패로 표시한다. 같은 폴더 재삭제의 FOLDER_NOT_FOUND를 확인하고 로컬 정리를 재시도할 수 있다. 서버와 IDB는 분산 원자적 트랜잭션이 아니므로 중간 실패를 성공으로 숨기지 않는다.

## Dexie v5

- v1~v4 선언을 보존하고 `deletedEntities: &key`만 추가했다. Draft/Outbox 기존 행을 변환하거나 초기화하지 않는다.
- 레코드는 `{key:'note:'+id 또는 'folder:'+id,id,kind,deletedAt}`다. 본문은 저장하지 않는다. 같은 UUID를 쓰는 서로 다른 엔티티 종류를 구분한다.
- 삭제 확인 뒤 subtree Draft/Outbox/CreationOutbox/localEntities/Workspace 정리와 tombstone 기록이 하나의 IDB readwrite transaction이다. 중간 실패는 전체 rollback한다.
- 오래된 GET 결과는 tombstone과 병합해 삭제 subtree를 숨긴다. stale 탭의 repository read/write는 LocalNoteDeleted로 중단한다. CAS를 우회하거나 삭제한 원고를 재생성하지 않는다.
- 기존 Draft BroadcastChannel의 삭제 알림은 재조회 신호다. 해당 탭과 다른 탭은 IDB를 다시 읽고 삭제된 노트에서 다른 노트 또는 빈 화면으로 이동한다. 알림 자체를 저장 성공 근거로 사용하지 않는다.
- tombstone은 현재 자동 만료하지 않는다. 대량 삭제에 따른 누적/정리 정책은 후속 과제다. 오프라인에서 이미 서버에 존재하는 폴더 삭제는 지원하지 않는다. 다른 프로필의 메모리는 공유되지 않으며 서버 NOTE_NOT_FOUND 복구 정책을 따른다.

## 배포

백엔드를 재시작하면 Flyway V5가 적용된다. 프론트엔드는 같은 origin에서 새 앱이 열릴 때 Dexie v5로 additive upgrade한다. 기존 브라우저 DB를 지울 필요가 없다. 구버전 탭이 DB 연결을 잡고 있으면 모든 Seam Note 탭을 닫고 새 앱 버전으로 다시 연다. 실제 개발 DB는 이번 검증에서 변경하지 않았다.
