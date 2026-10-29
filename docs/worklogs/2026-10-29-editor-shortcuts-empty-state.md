# 에디터 기본 단축키와 빈 화면 생성

## 커밋 경계

사용자가 먼저 요청한 Tiptap 적용은 이미 `e0a2a38 feat: Tiptap 리치 텍스트 에디터 도입`에 커밋돼 있고 작업 트리는 시작 시 깨끗했다. 이 커밋을 변경하거나 push하지 않았다. 다음 UI·단축키 변경은 별도 미커밋 작업으로 남긴다.

## 실제 변경 순서

1. AppLayout의 ⌘B capture listener, RichTextEditor StarterKit 기본키, AppHeader 툴팁, 빈 NoteEditor 및 creationParent를 확인했다. Tiptap 설치 소스에서 기본 list/undo/redo 키를 확인했다.
2. AppLayout/AppHeader의 사이드바 단축키를 Command/Control+Backslash로 바꿨다. 기존 모바일 포커스·다른 모달 차단·반복키/IME 보호는 유지했다.
3. RichTextEditor에 우선순위가 높은 작은 Tiptap extension을 추가해 Ctrl과 Meta 두 조합을 같은 편집 명령으로 연결했다. B/I/Shift8/Shift7/Z/ShiftZ/Y를 지원하고 toolbar title/aria-keyshortcuts에 노출했다. 별도 global 서식 handler나 상태 저장소는 추가하지 않았다.
4. NoteEditor의 no-note 기본 경로에서 중앙 안내/노트 생성 버튼을 렌더하고 비활성 제목·본문은 숨겼다. loading/404/조회 실패/복구 상태는 기존 구분을 유지한다.
5. AppLayout의 생성 목적지를 기존 선택/활성 원고 폴더 우선, 없으면 트리 표시 순 첫 root로 정했다. root도 없으면 새 UUID 최상위 ‘새 폴더’를 기존 local creation으로 만든 뒤 note를 생성한다. 전체 async chain을 ref gate로 보호한다. 각각의 기존 엔티티+CreationOutbox commit/부모 의존 전송을 유지한다. 폴더+note가 하나의 DB 트랜잭션이라고 주장하지 않는다.
6. 새 editorShortcutsEmpty browser harness를 작성했다. 기존 tiptapLive의 사이드바 키 검사만 새 Backslash로 갱신했고 과거 실증 결과는 덮어쓰지 않았다.
7. production preview25211 + Chrome 임시 contexts + 합성 API로5개 시나리오를 검증했다. 실제 개발 DB·원고를 생성/수정/삭제하지 않았다.
8. 현재 설계 문서의 키 계약과 생성 정책을 갱신하고 기존 troubleshooting에 원인/개선/검증을 보완했다. commit/push하지 않았다.

## 실제 결과

- lint / TypeScript build / Node175개 통과.
- production Chrome5묶음: 표시순 root fallback, 폴더가 전혀 없을 때 생성, 명시적 하위 폴더 선택 우선, offline no-folders 생성/전송0, mobile empty 생성.
- 동일 turn의 두 번 클릭에도 노트1개만 생성.
- no-folders에서 마지막 노트의 실제 UI 삭제(합성 DELETE) → `/` 중앙 안내 복귀 → 같은 root에 재생성, 기본폴더 중복 생성 없음.
- Command/Control+B/I가 bold/italic을 토글하고 sidebar 상태는 유지. 목록 Shift8/Shift7, Undo Control/Meta+Z, Redo Control+Y·Control+Shift+Z·Meta+Shift+Z 통과. Sidebar Command/Control+Backslash는 본문 HTML을 바꾸지 않음.
- 실제 개발 DB 쓰기0. 결과 docs/verification/2026-10-29-editor-shortcuts-empty.json.

## 구현 중 오류와 범위

첫 JSX 변경의 조건부 fragment 닫는 brace 누락을 lint가 검출해 수정했다. 첫 browser harness 버튼 label에 일본어 ‘生成’이 남아 locator가 실패했으며 정확한 ‘노트 생성’으로 고쳐 통과했다. 제품의 생성 API 실패로 해석하지 않는다.

백엔드/IndexedDB 스키마/ACK/CAS는 변경하지 않았다. 기존 Tiptap JSON 저장 계약과 자동 로컬 저장/생성 반영/수동 수정 동기화 정책을 유지한다. 이번 브라우저 검증은 production UI와 mock API이며 Spring/PostgreSQL 실증을 새로 수행했다고 주장하지 않는다.
