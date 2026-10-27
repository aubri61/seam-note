# 폴더 작업 메뉴와 빈 폴더 삭제

각 폴더 오른쪽 `…`에서 폴더 추가/문서 추가/폴더 삭제를 제공한다. 생성은 메뉴를 누른 folderId를 명시적으로 전달하므로 현재 에디터나 이전 폴더 선택에 의존하지 않는다. 폴더 추가는 기존 트리 인라인 명명, 문서 추가는 기존 로컬 빈 Draft 생성/URL 이동이다.

## 삭제 계약

기존 Spring FolderController의 DELETE `/api/folders/{id}`는204이며 FolderService.delete는 structure lock 아래 자식 폴더/노트가 있으면409 FOLDER_NOT_EMPTY를 반환한다. 하위 항목 cascade 삭제를 새로 구현하지 않는다.

- 확인창에서 복구 불가/빈 폴더 제한/로컬 또는 서버 대상을 설명한다. 취소 시 삭제 요청이 없다.
- 트리에 자식이 보이면 버튼을 비활성화한다. 저장소의 실제 metadata/localEntities/생성 Outbox도 다시 검사하고 서버가 최종적으로 빈 폴더 조건을 검사한다.
- 미전송 로컬 폴더: FOLDER_CREATE가 pending, attemptedAt=null, 정확히1건이며 자식이 없을 때 entity+operation을 한 IndexedDB readwrite transaction에서 삭제한다. HTTP를 보내지 않는다.
- inFlight/conflict 또는 시도 이력이 있는 폴더: 이미 서버에 존재할 수 있어 삭제를 중단한다. 생성 작업을 임의 폐기하지 않는다.
- 서버 폴더: 온라인에서 DELETE 성공 후 로컬 Workspace metadata/confirmed receipt를 정리한다. Draft/NOTE_UPDATE 등 원고 저장소는 삭제하지 않는다.
- 서버 응답 또는 로컬 후처리 실패는 성공으로 표시하지 않는다. 서버 성공 후 로컬 정리 실패는 이를 구별한 오류를 표시하며 수동 목록 확인을 안내한다. DELETE는 멱등성 Ledger 계약을 새로 만들지 않으므로 응답 유실 뒤404가 반환될 수 있다.
- 성공 후 Workspace/폴더 Query를 갱신하고 상세/자식 캐시를 정리한다. 해당 폴더 선택/펼침 설정만 제거한다. 빈 폴더이므로 원고 URL과 Draft는 유지한다.

## 두 탭 경계

삭제는 기존 수동 생성과 같은 `seam-note:creation-sync` Web Lock을 exclusive/ifAvailable로 획득한다. 로컬 폴더/노트 생성 adapter도 같은 lock 아래 저장하므로 서버 DELETE 대기 중 다른 탭이 자식을 만들지 못한다. 삭제 완료 후 대기 생성은 최신 IndexedDB의 부모 존재 검사에서 거부된다. Web Locks가 없으면 삭제를 중단한다(기존 로컬 생성 fallback은 유지). 구버전 코드나 다른 장치의 작업은 이 브라우저 잠금에 참여하지 않으므로 서버의 빈 폴더 검사가 여전히 필요하다.

IndexedDB schema/Flyway/서버 API는 변경하지 않는다. 새 오프라인 삭제 Outbox도 만들지 않는다. 미전송 생성 취소만 오프라인에서 가능하고 서버 폴더의 오프라인 삭제 예약은 지원하지 않는다.

## 접근성

트리 row 클릭과 메뉴 클릭을 분리한다. 메뉴 버튼 또는 Shift+F10으로 열고, Up/Down/Home/End/Enter/Escape를 사용한다. 외부 클릭/Tab/스크롤/resize로 닫는다. 검색/폴더 펼침/선택은 메뉴를 여는 것만으로 바꾸지 않는다. 모바일 Radix Drawer에서는 메뉴 portal을 Drawer 내부에 두어 모달의 focus/pointer 보호를 유지한다.

## 이름 변경과 생성 후 포커스 (2026-10-27)

`… → 이름 변경`은 기존 인라인 입력을 열고 Enter/blur로 확정, Escape로 취소한다. 미전송 pending 로컬 폴더는 metadata와 FOLDER_CREATE snapshot을 새 operationId로 원자 교체한다. 이미 시도한 snapshot은 변경하지 않는다. 서버 폴더는 기존 온라인 PATCH이며 성공 후 로컬 Workspace/confirmed receipt도 갱신한다. 새 오프라인 rename 작업 종류나 schema는 없다.

입력란의 기본·focus 테두리는 제거했다. 새 문서는 데스크톱에서 실제 생성 UUID/URL/Draft 복구가 확인된 후 제목으로 일회성 키보드 focus를 옮긴다. 모바일 생성은 Drawer를 닫거나 뒤쪽 제목으로 강제로 focus하지 않는다. 기존 노트 클릭 동작은 별도다. 상세 파일과 검증은 [작업 이력](../worklogs/2026-10-27-folder-rename-focus.md)을 따른다.
