# 폴더 없는 원고·폴더 하위 전체 삭제

## 작업 순서

1. 제목 Tab→본문, 이름·단축키 tooltip, SVG undo/redo와 이전 단축키/빈 화면 작업을 `11b99c2`로 먼저 커밋했다. push하지 않았다.
2. Note nullable folder 엔티티/DTO/response, root sortOrder, workspace LEFT JOIN, 생성 멱등 fingerprint를 변경하고 Flyway V5를 추가했다.
3. TS DTO/생성 Outbox/Workspace 검증/트리/생성 위치/충돌 복구를 null folder 계약으로 연결했다. + 메뉴에 명시적 폴더 없는 생성도 추가했다.
4. 서버 FOLDER_NOT_EMPTY guard를 제거하고 FK cascade로 하위 전체를 삭제하도록 했다. 확인 모달의 하위 전체·영구 삭제 경고와 선택 복구를 연결했다.
5. 삭제 이후 stale 탭/생성 대기 작업이 원고를 되살릴 위험을 코드 분석으로 식별했다. Dexie v5 삭제 ID marker, 원자적 subtree 정리, 기존 BroadcastChannel 재확인, repository tombstone 검사를 추가했다. 기존 CAS·ACK는 유지했다.
6. 합성 API 및 격리 Spring/PostgreSQL/Chrome 프로필에서 검증했다. 실제 개발 원고/DB/브라우저 profile 초기화는 하지 않았다.

## 변경 파일 묶음

- backend: Note entity·Create/Move/Response DTO·Repository·Service, FolderService, IdempotentCreations, 신규 Flyway V5, FolderMigrationTests/FolderNoteApiTests.
- frontend: AppLayout/Sidebar, useFolders/FolderTree/folderDeletion, workspaceTree/workspaceActions/workspaceMutations/WorkspaceActionDialog, api/types, creationModel, workspaceCache, syncContract, draftDatabase/draftSession/localDraftTypes, ConflictDialog/conflictService.
- tests: workspaceTree/offlineWorkspace/folderSubtree Node 테스트, unfiledCascadeLive 실제 통합 harness, editorShortcutsEmpty의 기본 생성 위치 계약 갱신.
- 설계: docs/design/unfiled-notes-and-recursive-folder-delete.md.
- 개인 troubleshooting: docs/troubleshooting/2026-10-27-frontend-folder-menu-deletion.md와 Tiptap 기록을 보완한다. 해당 폴더는 gitignore 정책을 유지한다.

## 검증

- frontend pnpm lint/build 통과. Node 181개 통과.
- backend 전체 38개 통과. 새로운 임시 PostgreSQL(25521) 테스트 DB에서 migration/nullable 생성·이동·수정·summary 및 cascade/타 root 보존을 검증했다.
- 실제 Chrome UI·IndexedDB+Spring/PostgreSQL: 폴더 없는 생성/수정/ACK, 서버 recursive delete·취소·503 보존·IDB quota fault rollback·서버404 retry cleanup·2탭 이동·stale write 거부, 오프라인 pending subtree 취소, v4→v5 Draft bytes 보존의 4그룹 통과.
- 실제 수치/재현은 docs/verification/2026-10-29-unfiled-cascade.json. 테스트 주소/UUID는 격리 synthetic fixture다.
- production PWA·수동 동기화/충돌/오프라인 복구 회귀와 실제 Chrome 강제 종료 복구도 실행했다. 결과는 각 verification JSON과 아래 최종 기록을 참조한다.

## 적용 및 한계

UI 체크포인트 이후 이번 DB/삭제 작업은 아직 커밋하지 않았다. 개발 DB에는 아직 V5를 적용하지 않았으므로 실제 앱 사용 시 백엔드 재시작이 필요하다. IndexedDB는 새 프론트에서 v5로 올라가며 데이터 삭제는 불필요하다. 서버 삭제와 IDB 정리는 두 저장소 사이 원자성이 없어서 실패를 표시하고 재시도한다. 다른 브라우저 프로필의 로컬 미동기화 원고는 자동 삭제하지 않는다.

## 최종 회귀 결과

- production Tiptap/PWA 실제 통합 13그룹 통과: 서식 복원·ACK·추가 입력·응답 유실·서버/로컬 충돌 선택·오프라인 새로 실행·생성 의존성·긴 한국어 원고 전환. 결과 docs/verification/2026-10-29-tiptap-live.json.
- 실제 Chrome SIGKILL/동일 profile 재실행 4그룹 통과: 서버 처리 전/응답 유실, 후속 작업 누락 fault injection, ACK transaction abort를 포함해 후속 작업이 expectedVersion3으로 전송되어 version4 확인. 결과 docs/verification/2026-10-28-inflight-crash-recovery.json(기존 harness의 파일명 유지, 환경/소스 해시를 이번 실행으로 갱신).
- 합성 API의 Chrome 빈 화면/기본 unfiled 생성/선택 폴더 생성/오프라인/모바일 5시나리오 및 Command/Control 서식·undo·redo·sidebar 단축키 통과. 결과 docs/verification/2026-10-29-editor-shortcuts-empty.json.
- 마지막 lint 및 git diff --check 통과. UI 체크포인트 이후 폴더/DB 변경은 미커밋 상태이며 push 없음.
