# 폴더 이름 변경·입력 테두리 제거·새 원고 제목 포커스

## 범위

이전 Workspace 전체 동기화의 미커밋 변경을 보존하고, 이번에는 폴더 메뉴 이름 변경과 입력 스타일, 생성 후 포커스만 추가했다. textbox 문맥에 따라 전체 input/textarea의 기본·focus 테두리를 제거했다. 실제 개발 DB/사용자 프로필은 테스트하지 않았고 commit/push하지 않았다.

## 실제 작업 순서와 파일

1. FolderMenu/FolderTree/useFolders/AppLayout/NoteEditor, 기존 renameFolder PATCH·mutation, IndexedDB creationOutbox 상태·잠금, GlobalStyles/Sidebar 검색 스타일을 확인했다. 기존 이름 변경 함수는 있었지만 메뉴 진입점이 없었고, 미전송 폴더는 서버에 없어 기존 PATCH를 직접 적용할 수 없는 경계를 확인했다.
2. `frontend/src/features/local-drafts/draftDatabase.ts`: renamePendingFolder 추가. 미전송 pending FOLDER_CREATE만 폴더 metadata와 함께 새 operationId의 생성 snapshot으로 원자 교체한다. inFlight/conflict/시도 이력이 있으면 보존·차단한다. confirmFolderRename은 서버 성공 후 Workspace/기존 confirmed receipt를 갱신해 과거 로컬 이름이 재표시되는 것을 방어한다. schema v1~v4는 변경하지 않았다.
3. `frontend/src/features/folders/folderRenaming.ts` 추가: 기존 creation-sync Web Lock 아래 pending 로컬 변경 또는 기존 PATCH /api/folders/{id}를 선택한다. 서버 폴더는 온라인에서만 가능하다. 로컬 metadata/Outbox는 실패 시 rollback, 서버 성공 후 로컬 정리 실패는 별도 오류다. 오프라인 서버 이름 변경 Outbox를 새로 만들지 않았다.
4. `frontend/src/features/workspace/workspaceMutations.ts`: 기존 서버 rename cache 처리 공유, 제품 hook을 안전한 로컬/서버 rename 경로로 연결했다. 로컬 결과는 merged Workspace를 다시 읽으며 서버 상세 캐시에 확정된 폴더처럼 넣지 않는다. 기존 순수 PATCH mutation options 테스트 계약은 유지한다.
5. `frontend/src/features/folders/useFolders.ts`: beginFolderRename, 기존 인라인 이름 확정/취소 재사용. createEmptyNote 성공 시 실제 생성 UUID를 반환해 포커스 대상을 식별한다. crypto.randomUUID 기본값의 TS template-literal 추론 때문에 재시도 string 인수가 빌드 실패한 것을 확인했고 id:string을 명시해 해결했다.
6. `frontend/src/features/folders/FolderMenu.tsx`: 이름 변경 메뉴와4행 popup 높이 반영. `FolderTree.tsx`: 생성/이름 변경 input의 label 구분, 테두리·outline·shadow 제거, 투명 배경. 기존 Enter/blur/Escape·검증·자동 select 유지. `frontend/src/app/sidebar/Sidebar.tsx`: 현재 생성 ID 전달, 검색 입력의 wrapper focus 테두리 제거.
7. `frontend/src/styles/GlobalStyles.tsx`: 모든 input/textarea의 기본/focus border·outline·shadow 제거. 트리·버튼의 기존 키보드 focus 처리는 유지한다.
8. `frontend/src/app/AppLayout.tsx`: 메뉴 이름 변경 연결, 서비스에서 가용성을 검사하도록 기존 온라인 wrapper 제거. 새 원고 UUID별 일회성 포커스 요청을 등록해 URL과 해당 Draft 복구/쓰기 가능 상태가 일치할 때 제목을 focus한다. 실패/다른 노트/모바일에서는 강제로 focus하지 않는다. 일반 노트 선택의 기존 모바일 동작은 유지하고 새 문서 생성으로 모바일 Drawer를 닫는 동작만 제거했다.
9. `frontend/tests/helpers/loadModules.mjs`에 경계 모듈 등록. `frontend/tests/browser/folderRenameFocus.cjs` 추가: 실제 IndexedDB+격리 Chrome+mock HTTP로 검증. 기존7개 관련 browser suite도 수행했다.
10. `docs/design/folder-menu-deletion.md`, frontend README와 이번 worklog 갱신. 기존 `docs/troubleshooting/2026-10-27-frontend-folder-menu-deletion.md`에 같은 컴포넌트의 추가 상태 경계를 기록했다(기존 gitignore에 따라 로컬 전용).

## 검증 결과

- pnpm build(TypeScript/PWA production build), pnpm lint, pnpm test129개 통과.
- 신규 folderRenameFocus 통과: 서버 이름 변경 성공/실패/재시도/같은 이름 no-op, pending 변경/취소/빈 이름/200자 제한, entity+Outbox rollback, inFlight payload 불변, 모바일 오프라인 pending 변경·reload, 서버 폴더 오프라인 차단.
- 생성·이름 변경·검색·에디터 제목 input의 computed border0/outline none/shadow none 확인. 폴더 이름 입력 자동 focus/select 유지.
- 폴더 메뉴/전역+메뉴/에디터 버튼3개 생성 진입점에서 새 Draft 제목으로 실제 키보드 타이핑 확인. 기존 원고가 변경되지 않음과 이후 검색 입력 중 focus를 빼앗지 않음 확인.
- 모바일 생성 후 Drawer visible, 뒤쪽 에디터 제목으로 focus 이동 없음 확인.
- 기존 inlineFolderCreation, folderMenu, folderExpansion, workspaceCreateDelete, noteRouting, manualSaveUx, sidebarDraftTitles7개 통과. 신규 포함 총8개 browser suite.
- 실제 개발 서버에는 PATCH/생성/삭제 요청을 보내지 않았다. 이번 서버 변경은 없고 Spring/PostgreSQL 전체 실증은 재실행하지 않았다. 앞선 Workspace18개/PWA10개 결과는 해당 작업 시점의 이력이며 이번 변경 후 다시 실행했다고 주장하지 않는다.

## 한계

미전송 로컬 폴더 이름은 오프라인에서도 생성 snapshot에 반영한다. 이미 전송 결과가 불확실한 폴더는 생성 결과를 확인한 뒤 변경한다. 서버 폴더의 이름 변경은 기존 온라인 PATCH 계약이며 expectedVersion/멱등성·오프라인 rename queue를 새로 추가하지 않았다. 확정 전 이름 입력은 메모리이며 새로고침 복원 대상이 아니다. 버튼/트리 키보드 focus와 모바일 Drawer 보호는 유지한다.
