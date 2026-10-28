# 폴더 생성 모달 제거와 트리 인라인 입력 복원

## 작업 순서와 파일

1. AppLayout/Sidebar/useFolders/FolderTree 및 localCreations/creationStorage를 읽었다. 기존 FolderName의 Enter/blur/Escape 처리를 확인했다.
2. `frontend/src/features/folders/useFolders.ts`: pendingFolder를 UI 전용 행으로 합성하고 기존 생성 위치에 표시한다. beginFolderCreation은 이름 입력만 열며, renameCreatedFolder 콜백은 pending 행일 때 로컬 생성 mutation을 호출한다. 성공 시 행 확정/선택/위치 펼침, 실패 시 입력·UUID 유지, 취소 시 preview만 제거한다. 캐시 DTO 직접 수정이나 서버 PATCH 없이 명명된 FOLDER_CREATE를 한 번 기록한다.
3. `frontend/src/app/AppLayout.tsx`: LocalFolderDialog와 folderName 상태/렌더링 제거. 기존 + 메뉴에서 인라인 입력 시작. 오프라인 pending 명명도 허용한다.
4. `frontend/src/app/sidebar/Sidebar.tsx`: 새 최상위 폴더 메뉴로 기존 모달의 root 선택을 대체하고, 입력 중 중복 생성 차단 및 생성 오류 연결.
5. `frontend/src/features/folders/FolderTree.tsx`: 기존 입력의 Enter/blur/Escape 유지. 기본 이름 그대로 확정도 허용하고 aria-invalid/role=alert로 검증·실패를 표시한다. 기존 실제 폴더의 이름 불변 no-op은 useFolders에 유지했다.
6. `frontend/src/features/workspace/LocalFolderDialog.tsx` 제거(이전 미커밋 작업에서 추가된 파일).
7. `frontend/tests/browser/inlineFolderCreation.cjs` 신규 검증. `folderExpansion.cjs`, `workspaceCreateDelete.cjs`, `offlineCreationLive.cjs`의 모달 조작을 트리 입력/Enter/Escape로 교체했다. live production suite는 selector 갱신만 했으며 재실행하지 않았다.
8. `docs/design/offline-creation.md`, `frontend/README.md`의 현재 UX 갱신. 과거 이력은 그대로 두고 이번 이력으로 변경점을 명시한다. 기존 `docs/troubleshooting/2026-10-25-create-delete-selection-cache.md`의 동일 모달 회귀 항목을 갱신(로컬 gitignored).

## 검증 결과

- pnpm --dir frontend test: 114개 통과.
- pnpm --dir frontend lint: 통과.
- pnpm --dir frontend build: TypeScript/PWA production build 통과.
- 실제 Chrome + 격리된 IndexedDB + mock HTTP: inlineFolderCreation, folderExpansion, workspaceCreateDelete, noteRouting 4개 suite 통과.
- 신규 suite는 모달 없음/자동 focus, 취소 시 데이터 없음, 공백 이름 거부, Enter/default name/blur, 부모·최상위 위치, 로컬 실패 입력 유지/동일 UUID 재시도, 새로고침, 오프라인 모바일을 검증한다. 모바일의 기존 Drawer dialog는 유지한다.
- 실제 개발 DB와 사용자 브라우저 데이터에 쓰지 않았다. 백엔드 API·Flyway·IndexedDB 스키마·수동 동기화 계약 변경 없음. 사용자가 확정하기 전의 폴더 이름 입력은 메모리 UI이며 재시작 복원 대상이 아니다.
