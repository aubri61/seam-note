# 폴더 오른쪽 작업 메뉴와 빈 폴더 삭제

## 분석

FolderController DELETE /api/folders/{id} → FolderService.delete가 structure lock 아래 빈 폴더만 삭제하고204를 반환하며, 자식이 있으면409 FOLDER_NOT_EMPTY인 것을 확인했다. 기존 폴더 삭제 프론트 API/Mutation은 없었다. 로컬 생성은 별도 entity+creationOutbox이므로 미전송 취소와 서버 삭제를 구분해야 한다.

## 실제 변경 순서와 파일

1. `frontend/src/features/local-drafts/draftDatabase.ts`: 빈 폴더/자식 생성 의도/현재 생성 상태 검사와 prepareFolderDeletion/finishFolderDeletion 추가. pending 로컬 entity+intent의 원자 취소 및 서버 삭제 후 metadata/confirmed receipt 정리. 기존 v1~v4 schema 선언은 변경하지 않았다.
2. `frontend/src/features/outbox/creationStorage.ts`: 로컬 폴더·노트 생성 adapter에서 기존 creation-sync Web Lock 공유. 원격 삭제 중 다른 탭의 자식 생성을 직렬화한다. IndexedDB 부모 검증을 재사용한다.
3. `frontend/src/features/folders/folderApi.ts`: 실제 서버 계약의 bodyless DELETE 함수. `folderDeletion.ts` 추가: 잠금, 로컬 상태 재검증/미전송 취소 또는 온라인 서버 DELETE, 후처리 실패 구분. `frontend/src/lib/api/client.ts`의 DELETE 설명을 공통 endpoint에 맞게 갱신했다.
4. `frontend/src/features/workspace/workspaceMutations.ts`: retry=false 폴더 삭제 Mutation, Query 취소/성공 후 목록·상세·자식 캐시 정리/무효화. 낙관적 삭제를 하지 않는다.
5. `frontend/src/features/folders/useFolders.ts`: 폴더 삭제 busy/error/중복 클릭 guard 연계, 성공 시 해당 폴더 선택/펼침 preference 정리, 명시적 parentOverride 생성 위치 지원.
6. `frontend/src/features/folders/FolderMenu.tsx` 추가: 우측 점 세 개, 폴더/문서 추가·삭제, 키보드/외부 클릭/포커스 처리. `FolderTree.tsx`: row 선택/접힘과 버튼 이벤트 분리, Shift+F10, 기존 트리 키보드 이동 유지.
7. `frontend/src/app/sidebar/Sidebar.tsx`, `frontend/src/app/AppLayout.tsx`: 메뉴 대상 ID로 생성/삭제 연결. `frontend/src/features/workspace/WorkspaceActionDialog.tsx`: 빈 폴더 삭제 확인·비어 있지 않음 차단·물리 삭제 안내·실패 상태 연결. 원고 삭제 확인도 유지한다.
8. 신규 메뉴의 body portal은 모바일 Radix Drawer에서 pointer/focus 보호에 막히는 실제 새 구현 버그를 브라우저로 확인했다. menu portal을 trigger가 속한 dialog 내부로 옮겨 해결했다. 기존 Drawer 보호 자체는 유지한다.
9. `frontend/tests/helpers/loadModules.mjs`, `frontend/tests/workspaceMutations.test.mjs`: 새 모듈 및 DELETE204/409 코드 보존 단위 검증. `frontend/tests/browser/folderMenu.cjs` 추가: 메뉴/생성 위치/삭제 성공·실패·취소·409/중복/두 탭/불확실 작업/원자 rollback/모바일·오프라인 로컬 취소/재조회·Draft 보존.
10. `frontend/tests/browser/inlineFolderCreation.cjs`: HMR 인스턴스 의존적 함수 monkey patch를 실제 IDB add 실패 주입으로 교체. `manualSaveUx.cjs`: responsive 반영을 기다린 뒤 모바일 버튼 경계를 측정하도록 변경. 기능 기대를 완화하지 않았다.
11. `docs/design/folder-menu-deletion.md` 추가. `docs/troubleshooting/2026-10-27-frontend-folder-menu-deletion.md`와 목록 갱신(기존 gitignore 로컬 전용). 실제 발견한 모바일 버그와 코드 분석으로 예방한 생성·삭제 경쟁을 구분했다.

## 검증 결과

- pnpm --dir frontend test: 115개 통과.
- pnpm --dir frontend build: TypeScript/PWA production build 통과.
- pnpm --dir frontend lint 및 git diff --check: 통과.
- mock HTTP + 격리 Chromium + 실제 IndexedDB: folderMenu, inlineFolderCreation, folderExpansion, workspaceCreateDelete, noteRouting, manualSaveUx 6개 suite 통과.
- 두 탭: DELETE 응답을 보류한 상태에서 다른 탭의 자식 생성을 요청했다. 삭제 뒤 최신 IndexedDB 부모 검사로 거부돼 고아 entity/intent를 남기지 않았다.
- 원자성: 로컬 entity delete에 오류를 주입해 앞선 Outbox 삭제도 rollback됨을 확인했고 재시도로 양쪽 정리됨을 확인했다.
- 기존 사용자 DB/프로필·원고에는 쓰기하지 않았다. 서버 API/엔티티/Flyway/IndexedDB schema 변경 없음. 실제 Spring/PostgreSQL 및 production SW 실증은 이번에 재실행하지 않았다.

## 지원 범위와 한계

기존 서버 계약대로 빈 폴더만 삭제한다. 하위 원고/폴더 cascade 삭제 또는 서버 폴더의 오프라인 삭제 예약은 없다. 아직 시도하지 않은 빈 로컬 폴더의 생성 취소만 오프라인 지원한다. inFlight/conflict/불확실 작업은 보존하며 서버 DELETE 응답 유실/서버 성공 뒤 로컬 정리 실패는 수동 목록 확인이 필요하다. Web Locks 없는 환경의 삭제는 안전하게 중단한다. 다른 장치/구버전 탭은 브라우저 잠금에 참여하지 않으므로 서버 검사에 의존한다. Safari는 미검증이다.
