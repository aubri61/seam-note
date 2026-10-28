# 폴더 펼침 설정 영속화와 수동 폴더 저장 흐름 확인

## 작업 범위

기존 미커밋 오프라인 생성 작업을 보존했다. 이번에는 원고/서버/API/IndexedDB 스키마를 수정하지 않고 localStorage UI 설정만 추가했다. 실제 개발 원고와 DB에는 쓰기 요청을 보내지 않았다.

## 수행 순서와 파일

1. AGENTS.md, useFolders, FolderTree, Sidebar, creationSync, FolderCreationSave, useManualSync 및 기존 브라우저 테스트를 읽었다. 상태 소유자는 useFolders이며 navigation/select가 기존 접힘을 다시 여는 것을 확인했다.
2. `frontend/src/features/folders/folderExpansion.ts` 추가: UI 전용 키, 안전한 읽기/쓰기, 누락과 유효한 빈 배열 구분, 손상 JSON/차단/quota 방어.
3. `frontend/src/features/folders/useFolders.ts` 수정: lazy 복원, 설정 우선/미설정 조상 기본값, effect 저장, URL의 강제 재펼침 제거. 명시적 생성 경로 reveal은 유지.
4. `frontend/tests/helpers/loadModules.mjs`에 순수 모듈 등록, `frontend/tests/folderExpansion.test.mjs` 추가. null/[]/잘못된 타입/중복/삭제 ID/직렬화/접근·쓰기 실패 검증.
5. `frontend/tests/browser/folderExpansion.cjs` 추가: 실제 Chrome persistent profile 종료·재실행, 직접 URL, 새로고침, 클릭/키보드, 모바일, 새 로컬 폴더와 재복원, 삭제 ID/손상 설정/차단 저장소 검증. 첫 fixture 비UUID 문제를 실제 계약의 UUID로 수정.
6. `frontend/tests/browser/noteRouting.cjs` 수정: 요구와 충돌하는 'Back 시 강제 펼침' 기대를 접힘 유지로 변경. 기존 Draft/URL/no reload/느린 GET/모바일 검증은 유지.
7. `docs/design/folder-expansion.md` 추가: 정책·한계와 기존 폴더/노트 수동 서버 저장 테스트 방법. `docs/troubleshooting/2026-10-27-frontend-folder-expansion.md` 및 목록 갱신(기존 gitignore에 따라 로컬 전용).

## 복원 정책

`seam-note:expanded-folders:v1`의 string[]은 전체 펼침 설정이다. []는 모두 접힘이다. 미설정/손상/접근 실패는 현재 원고 조상 기본값을 사용하며 자동 기본값을 저장하지 않는다. 최초 사용자 조작 또는 명시적 생성 위치 reveal부터 설정을 저장한다. 미표시/삭제 ID는 렌더링에서 자연스럽게 무시하며 부분 트리만 보고 삭제하지 않는다. 같은 origin/프로필에서만 복원되고 차단 시 현재 메모리 조작은 유지된다.

## 서버 폴더 저장 조사

기능 변경 없이 실제 함수 호출을 확인했다. 온라인에서도 생성은 local-first다. 원고 저장은 syncLocalNote → foldersFor(필요 조상 root-first) → NOTE_CREATE ACK → syncOneNote(필요 후속 NOTE_UPDATE)이다. 폴더 선택 시 FolderCreationSave의 `폴더 서버에 저장`이 syncLocalFolder → foldersFor로 자신과 미확정 조상만 반영한다. 형제/자식 원고 전체는 저장하지 않는다. 요청 실패·응답 유실·ACK 실패 시 로컬 작업은 보존한다. 개발 DB 대상으로 재현/임의 저장하지 않았으며 실제 사용자 환경의 실패 여부를 새로 단정하지 않았다.

## 검증

- pnpm --dir frontend test: 114개 통과.
- pnpm --dir frontend build: TypeScript/PWA production build 통과.
- pnpm --dir frontend lint: 통과.
- 신규 folderExpansion 브라우저: 통과(실제 Chrome 프로세스 재실행 포함).
- 기존 noteRouting, workspaceCreateDelete, sidebarDraftTitles, noteDrafts, outboxStorage, workspaceReadonly, manualSaveUx: 통과.
- localDraftStorage: 통과. 기존 8개 + 신규 1개 브라우저 suite 전체 통과.
- git diff --check: 통과.

별도 Vite 127.0.0.1:25173과 격리 Chrome 프로필/mock API만 사용했다. 서버 저장 UI 회귀도 mock HTTP로 수행했다. 실제 Spring/PostgreSQL 수직 통합은 이번 UI 변경에서 재실행하지 않았다. Service Worker production 수직 통합/Safari/OS 설치는 이번 추가 검증 범위가 아니다. 기존 PWA/서버 코드와 스키마를 변경하지 않았다.
