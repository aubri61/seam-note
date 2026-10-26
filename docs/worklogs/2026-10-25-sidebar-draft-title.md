# 사이드바 Draft 제목 반영 작업 이력

## 범위

feat/offline-local-storage의 기존 미커밋 IndexedDB 작업을 보존하고, 사이드바 표시 연결만 추가한다. 서버 API/DB/IndexedDB 스키마/저장 정책/선택·라우팅 계약 변경은 없다. 커밋·푸시는 요청 범위에 없어 수행하지 않는다.

## 실제 작업 순서

1. AGENTS.md, 변경 상태, AppLayout/useNoteDrafts/Sidebar/FolderTree, DraftSession, Workspace 정렬/검색, Query 정책, 기존 브라우저 테스트를 확인했다.
2. 서버 nodeLabel만 렌더링하는 원인을 로컬 전용 트러블슈팅 문서에 기록하고 목록에 등록했다.
3. useNoteDrafts에서 session snapshot의 원고 ID → 제목 맵을 파생했다. 복구 중 draft=null 항목은 제외하고 빈 제목은 그대로 유지한다.
4. AppLayout → Sidebar → FolderTree props로 제목 맵을 전달했다. noteId 기준 nullish fallback과 표시 전용 '제목 없음'을 행 텍스트/tooltip에 적용했다. 서버 노드 및 Query 캐시는 수정하지 않았다.
5. 격리된 Chrome/실제 테스트 IndexedDB + mock GET으로 sidebarDraftTitles.cjs를 추가했다. write를 1초 늦춰 DB에 서버 제목이 남은 시점에도 UI가 즉시 바뀌는지 검증한다. Query 데이터 원본, 입력 전후 GET 수, A/B, 새로고침 복구, 빈 값, 모바일, 트리 순서/선택/URL, 서버 재조회를 확인한다.
6. 기존 noteDrafts.cjs에 clean 서버 재조회 후 제목 갱신/dirty Draft 유지 시 사이드바 제목 assertion을 추가했다.
7. build(타입 검사 포함), lint, Node 테스트 79개를 실행했다. 별도 25173 Vite에서 신규 브라우저 테스트를 통과했고 기존 5개 브라우저 회귀를 실행했다. sandbox의 최초 listen EPERM은 전용 테스트 서버 실행 권한으로 해결했으며 사용자 5173 서버는 건드리지 않았다.
8. 설계 문서와 기존 Draft 설명을 보완하고 검증 결과/트러블슈팅을 갱신했다. 종료 시 자체 25173 테스트 서버만 정리한다.

## 이번 요청에서 변경한 파일

| 파일 | 변경 |
| --- | --- |
| frontend/src/features/notes/useNoteDrafts.ts | React snapshot에서 noteId별 draftTitles 파생 |
| frontend/src/app/AppLayout.tsx | Sidebar로 draftTitles 전달 |
| frontend/src/app/sidebar/Sidebar.tsx | 타입/FolderTree props 전달 |
| frontend/src/features/folders/FolderTree.tsx | 로컬 제목 우선 텍스트/tooltip, 빈 값 표시 |
| frontend/tests/browser/sidebarDraftTitles.cjs | 신규 격리 브라우저 회귀 |
| frontend/tests/browser/noteDrafts.cjs | clean/dirty 서버 재조회 사이드바 회귀 |
| docs/design/local-draft-storage.md | 제목 우선순위/복구·검색 범위 문서화 |
| docs/design/note-drafts.md | 후속 단계 제목 정책 연결 |
| docs/worklogs/2026-10-25-sidebar-draft-title.md | 실제 순서/파일/검증 결과 |
| docs/troubleshooting/2026-10-25-frontend-sidebar-draft-title.md 및 README | 원인/개선/검증, Git 제외 유지 |

## 검증 결과

- pnpm build: 성공 (tsc 포함).
- pnpm lint: 성공.
- pnpm test: 79 통과 / 실패·취소·skip 0.
- sidebarDraftTitles.cjs: 성공.
- 기존 브라우저 5종: noteDrafts/noteRouting/workspaceCreateDelete/workspaceReadonly/localDraftStorage 모두 성공. 신규 포함 총 6종 통과.
- 개발 DB 요청: 없음. 쓰기는 mock/격리된 브라우저 저장소에만 수행한다.

## 한계

제목 맵은 현재 AppLayout에서 읽거나 복구한 React Draft만 포함한다. 아직 선택하여 복구하지 않은 노트의 로컬 제목을 보여주기 위한 전체 DB 선조회는 추가하지 않았다. 기존 서버 제목 기준 검색 정책은 유지하여 로컬 제목 검색은 후속 범위다. 별도 dirty 배지·서버 저장 표시를 추가하지 않았다. Safari 실기기 검증과 렌더 성능 측정은 이번 작업에서 수행하지 않았다.
