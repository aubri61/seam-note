# 원고 메뉴·동기화 버튼·공통 조작 효과

## 변경 순서

1. Sidebar/FolderTree/FolderMenu, AppHeader/NoteEditor, 기존 삭제 확인/Mutation, GlobalStyles/공통 버튼 스타일을 확인했다.
2. Sidebar + 메뉴의 ‘새 최상위 폴더’ 항목을 제거했다. 폴더 데이터나 서버 생성 API를 제거한 것이 아니다. 일반 새 폴더는 기존 생성 위치 정책을 유지한다.
3. FolderMenu를 kind=note로 재사용해 원고에는 ‘원고 삭제’ 하나만 표시한다. 사이드바 원고 오른쪽과 에디터 헤더 오른쪽 메뉴에서 같은 삭제 확인 흐름을 사용한다. 기존 에디터 툴바의 직접 삭제 버튼은 제거했다.
4. 비선택 원고 삭제는 해당 ID로 처리하며 메뉴 클릭만으로 선택/URL을 바꾸지 않는다. 삭제 확인 제목은 최신 Draft 제목을 우선한다. 온라인/서버 확인/요청 중 보호와 확인/취소/실패 시 보존을 유지한다. 미반영 로컬 노트의 삭제 정책은 확장하지 않았다.
5. FolderTree 노트 행을 treeitem div와 실제 URL Link/메뉴 버튼의 형제 구조로 변경했다. button이 anchor 안에 중첩되지 않도록 했다. 일반 클릭·수정키 새 탭 링크, roving focus·Shift+F10·메뉴 키보드를 유지한다.
6. 기존 전체 동기화 동작을 저장 상태 옆 ‘동기화’ 버튼으로 옮겼다. 앞에 sync 아이콘을 추가하고 busy 시 회전하며 aria-label=모든 변경사항 동기화/aria-busy를 유지한다. 원고 하나만 저장하는 새 엔진을 추가하지 않았다.
7. GlobalStyles에서 모든 활성 button/summary에 동일한 필터·호버·scale 눌림과 부드러운 transition을 적용했다. disabled에는 효과를 주지 않고 prefers-reduced-motion에서는 transition/animation을 끈다. 공통 IconButton/메뉴의 disabled hover도 제외했다.
8. 새 최상위 폴더 버튼에 의존하던 autoCreationLive/workspaceSyncLive의 폴더 fixture 준비를 서버 fixture 폴더 선택→일반 새 폴더로 갱신했다. 이번 수정 후 실제 서버 전체 묶음을 재실행했다고 주장하지 않는다.

## 검증

- 단위169개, pnpm lint, pnpm build(TypeScript 포함) 통과.
- production Chrome/native IndexedDB/mock GET·DELETE2개 묶음 통과: desktop 비선택/선택 원고 삭제, 확인 취소(요청0), 서버 실패 시 본문·URL 보존, 메뉴 키보드 진입, 실제 링크/메뉴 중첩 금지, 동기화 아이콘/hover/pressed, reduced motion, mobile 메뉴/취소/선택 보존.
- 실제 사용자 원고나 개발 DB에 변경 요청을 보내지 않았다.
- 원시 결과: docs/verification/2026-10-28-note-menus.json. 기존 생성 자동 반영과 함께 미커밋 상태로 남긴다. commit/push하지 않았다.
