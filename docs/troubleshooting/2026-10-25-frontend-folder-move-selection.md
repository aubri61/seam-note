# 문서 이동 후 다음 생성 위치가 이전 폴더에 남는 문제

- 발견일: 2026-10-25
- 영역: frontend
- 구분: 발견된 문제
- 상태: 해결

## 현상과 영향

새 문서를 다른 폴더로 드래그한 뒤 다시 생성하면 이전에 선택했던 폴더 아래에 생성된다. 폴더 트리 기능을 workspace로 명명해 실제 워크스페이스 도메인과 혼동하는 문제도 확인했다.

## 재현 조건과 근거

- React Arborist 4.0.1, React 세션 내 폴더/문서 상태, 데스크톱 1440×1000 브라우저에서 확인.
- 새 문서 생성 → 다른 폴더를 선택한 상태로 그 문서를 외부 폴더에 드래그 → 다시 새 문서 생성.
- 변경 전 브라우저 재현: My notes가 선택된 상태에서 새 문서를 Journal로 이동하면 헤더는 Journal을 표시하지만 트리 선택은 My notes에 남는다. 다시 생성하면 My notes에 생성됐다.
- 라이브러리 `src/dnd/drag-hook.ts`: 드래그 시작은 dragIds를 설정하며 클릭 선택을 수행하지 않는다. 애플리케이션의 기존 move도 items만 갱신하고 selectedId를 변경하지 않았다.

## 원인

확인된 원인: 클릭 선택과 드래그 대상을 같은 것으로 가정했다. 생성 위치는 selectedId를 우선하는데 드롭 후 선택을 동기화하지 않아 이전 폴더가 다음 생성 위치로 남았다. 순수 이동 모델은 parentId를 올바르게 갱신하고 있었다.

표시 목록 제약: Arborist의 `TreeApi.get/select`는 표시 중인 노드를 사용한다. 닫힌 목적지로 이동한 항목은 조상을 펼친 뒤 표시 목록 갱신을 기다려 선택해야 한다. 폴더 생성 때 이미 사용하던 다음 프레임 선택 처리를 이동에도 적용했다.

명명 문제: 폴더/문서 트리 모델과 상태를 WorkspaceItem/useWorkspace 등으로 부르면서 실제 워크스페이스 선택 UI와 경계가 모호했다.

## 개선 내용

- 유효한 이동이 완료되면 selectedId를 이동한 항목으로 갱신한다. 거부된 이동은 기존 상태를 유지한다.
- 목적지 조상의 펼침 상태를 저장한다. movedId 요청으로 트리를 펼친 뒤 다음 프레임에 이동 행을 선택하고 포커스를 옮긴다.
- 생성/이동 선택 복원 중에는 라이브러리의 이전 선택 콜백이 상위 선택을 덮어쓰지 않게 한다.
- 이동은 activeId와 문서 본문을 변경하지 않는다. 사용자가 이후 다른 폴더를 직접 선택하면 그 폴더가 다음 생성 위치가 된다.
- 폴더 관련 파일·훅·타입·변수·import·접근성 이름·테스트·문서를 folders로 정리했다.
- 실제 워크스페이스 선택은 별도 `features/workspaces/WorkspacePicker.tsx`로 분리하고 기존 디자인과 의미를 유지했다.

관련 파일:

- `frontend/src/features/folders/useFolders.ts`: 이동 후 선택과 펼침 상태 동기화.
- `frontend/src/features/folders/FolderTree.tsx`: 생성/이동 후 표시 목록에 맞춘 선택·포커스 복원.
- `frontend/src/features/folders/folderModel.ts`, `FolderSection.tsx`: 폴더 도메인 경로 및 명명.
- `frontend/src/app/sidebar/Sidebar.tsx`, `SidebarDrawer.tsx`, `DesktopSidebar.tsx`: 앱 레이아웃 사이드바 조합. 후속 경로 정리에서 folders에서 app/sidebar로 이동했으며 UI·동작은 변경하지 않았다.
- `frontend/src/features/workspaces/WorkspacePicker.tsx`: 실제 워크스페이스 선택 UI 분리.
- `frontend/src/app/AppLayout.tsx`, `frontend/src/features/notes/NoteEditor.tsx`: 새 폴더 도메인 참조.
- `frontend/tests/folderModel.test.mjs`, `frontend/FOLDERS_UI.md`, `frontend/UI.md`: 테스트와 문서 정리.

## 검증과 전후 비교

- `pnpm test`: 13개 모델 테스트 통과. 연속 이동 후 최상위 생성 위치, 이동한 폴더 선택 시 하위 생성 위치·자손 경로를 추가 검증했다.
- `pnpm build`: TypeScript (`tsc -b`) 및 Vite 빌드 통과.
- `pnpm lint`: 통과.
- 브라우저: 이전 Journal 선택 → 문서를 닫힌 Work로 실제 드래그 → 이동 문서 행이 선택됨 → 새 문서가 Work에 생성됨을 확인했다.
- 다른 폴더 Journal을 직접 선택 → 새 문서 생성 → Journal 아래 생성 확인.
- 새 폴더 인라인 이름 입력·선택, 선택한 새 폴더 아래 문서 생성 확인.
- 이동한 원문을 다시 선택했을 때 제목·본문이 유지됨을 확인.
- 모바일 Drawer 재마운트와 데스크톱 복귀 후 문서 내용·선택·펼침 상태 유지 확인.
- UI 검증 스크린샷: `/private/tmp/seam-note-folder-move-fixed.png` (임시 검증 자료).
- 후속 사이드바 경로 이동 검증: 테스트 13개·타입 검사·빌드·린트 재통과. Vite 산출물 해시가 이동 전후 동일했다.
- 커밋 환경: 기본 샌드박스에서 `.git/index.lock` 생성이 차단됐다. 승인된 Git 쓰기 권한으로 스테이징을 재실행해 해결했다. 코드 오류는 아니며 frontend 경로만 커밋 대상으로 제한했다.
- 성능 수치 미측정. 이번 변경에서 성능 개선을 주장하지 않는다.

## 남은 문제와 후속 조치

- React 메모리 상태이며 새로고침 시 초기화되는 기존 범위는 유지된다.
- DB 스키마/API/영구 저장 및 실제 워크스페이스 전환은 구현하지 않았다. 폴더 도메인과 워크스페이스 도메인은 후속 DB 설계에서도 구분해야 한다.
- 모델 회귀 테스트는 자동화되어 있고 실제 드래그·선택 콜백 연동은 브라우저 수동 검증이다.
- 기존 HTML5 드래그 backend의 터치 제스처 제한은 유지된다.
