# 2026-10-25 — React 원고 Draft 작업 이력

## 실제 작업 순서

1. git status(깨끗함), AGENTS.md, AppLayout/AppHeader/useFolders/NoteEditor/useNoteQuery/Note 타입, Query 캐시와 생성 성공 흐름, SyncStatus/Emotion 반응형 스타일, 테스트 helper/브라우저 스크립트/문서 규칙을 확인했다.
2. 기존 에디터는 Query 객체 직접 표시/readOnly이며 별도 편집 상태가 없음을 확인했다. 로컬 전용 docs/troubleshooting/2026-10-25-frontend-note-drafts.md와 README에 문제 근거를 기록했다. 이 폴더의 Git ignore 정책은 유지한다.

3. noteDrafts.ts에 독립 모델(noteId/title/content/baseVersion/baseTitle/baseContent/latestServerVersion), 불변 수신/입력 갱신, dirty/배지 상태 함수를 작성했다. dirty 응답은 기준을 유지하며 clean의 단조 버전 갱신만 허용한다.
4. draftNavigation.ts에 beforeunload 등록/정리, useNoteDrafts.ts에 AppLayout 수명 동안 ID별 상태/선택 응답 guard/조건부 Query snapshot 조정/함수형 입력 갱신/전체 dirty listener를 작성했다.
5. AppLayout에 Hook을 연결하고 NoteEditor가 Query Note 대신 Draft와 입력 callback을 받도록 바꿨다. readOnly는 Draft가 없을 때만 적용하고 제목 maxLength=200/빈 값/표시용 제목 없음을 연결했다. 기존 Emotion/툴바/생성·삭제 연결은 유지했다.
6. AppHeader/SyncStatus를 실제 clean/dirty/loading/error 상태로 바꾸고 NoteEditor/Sidebar에 메모리 전용·소실/경고 한계 안내를 넣었다. Query/API/백엔드 코드는 변경하지 않았다.
7. 최초 편집 스크립트 실행은 frontend 작업 경로에서 frontend/ 접두 경로를 사용해 FileNotFoundError가 났다. 파일을 수정하지 못한 호출이므로 이후 build를 새 UI 검증으로 집계하지 않았다. 저장소 root에서 수정 스크립트를 실행한 후 실제 새 UI build/tsc/lint를 통과했다.
8. 테스트 helper에 모델/이탈 모듈을 연결하고 noteDrafts.test.mjs에 13개 정책 테스트를 추가했다. 기존 47개를 유지해 총 60개가 통과했다. 기존 browser 두 스크립트의 readOnly/배지 assertion만 현재 editable clean Draft로 바꾸고 나머지 시나리오는 유지했다.
9. noteDrafts.cjs에 mock GET 전용 실브라우저 테스트를 작성했다. ID별 편집/최대 길이/빈 값/전환/버전별 재조회/응답 대기 중 입력/오류 복구/이탈 조건/영속 저장 없음/모바일을 검증했다. 실제 서버 쓰기를 켜는 옵션은 없다.
10. 사용자 5173 PID 37770([::1])을 유지하고 이번 Vite를 25173(PID 44704)에 별도로 실행했다. 기존 조회 및 생성·삭제 Chrome 회귀 모두 통과했다. 기존 생성·삭제의 API 쓰기는 전부 mock 처리했다.
11. 최초 Draft 브라우저 실패는 재조회 요청 자체가 시작되지 않은 하네스 문제였다. 설치된 TanStack focusManager 소스가 window visibilitychange를 구독함을 확인했다. document에 버블링 없는 합성 이벤트를 보낸 것이 원인이었고, window 알림/테스트용 Date.now staleness 전진으로 수정했다. focus boolean 중복이 원인이라는 초기 추정은 소스로 확인되지 않아 채택하지 않았다. 앱 Query 정책은 바꾸지 않았다.
12. headless Chrome의 close(runBeforeUnload:true)는 dirty 조건과 실제 클릭이 있어도 기본 경고 없이 닫혔다. 최소 beforeunload 예제도 같았다. 별도 API 없는 mock 페이지의 reload는 경고를 보여줬으므로 기능 검증은 실제 새로고침/경고 취소/원고 유지로 바꿔 통과했다. 모든 종료 경고를 보장할 수 없다는 실제 한계로 기록했다.
13. Draft Chrome 전체 테스트를 통과했다. 데스크톱 1360×900/모바일 390×844 스크린샷을 직접 확인해 기존 배치·글꼴·툴바·메모리 안내를 확인했다. 트리 선택 전환 색상은 기존 애니메이션이 끝난 뒤 촬영했다.
14. docs/design/note-drafts.md에 모델/소유 위치/컴포넌트/초기화/버전/dirty/이탈/향후 IndexedDB·expectedVersion 책임 경계를 기록했다. 이전 조회/생성 설계 문서에 후속 문서 링크를 넣었다. 로컬 전용 troubleshooting 문서/README를 해결로 갱신했다.
15. 최종 diff/ignore/파일 목록을 확인하고 이번 임시 Vite 25173만 종료했다. 사용자 5173은 유지한다. commit/push는 이번 요청 범위에 없어 수행하지 않았다.

실제 개발 DB 쓰기/백엔드 변경/Note 저장 Mutation/영속 저장은 하지 않았다.


## 파일별 변경 (첫 코드 변경 순서)

| 순서 | 파일 | 변경 내용 |
| --- | --- | --- |
| 1 | frontend/src/features/notes/noteDrafts.ts | 순수 Draft 모델/서버 수신/입력/dirty/상태 정책 |
| 2 | frontend/src/features/notes/draftNavigation.ts | beforeunload 연결과 정확한 cleanup |
| 3 | frontend/src/features/notes/useNoteDrafts.ts | 노트별 React 메모리 상태·Query snapshot 조정·이탈 보호 |
| 4 | frontend/src/app/AppLayout.tsx | Draft 소유 Hook과 선택/입력/배지 연결 |
| 5 | frontend/src/features/notes/NoteEditor.tsx | 제목·본문 편집, 200자 제한, 메모리 안내, Draft ID guard |
| 6 | frontend/src/app/AppHeader.tsx | DraftStatus 전달 |
| 7 | frontend/src/features/sync/SyncStatus.tsx | 읽기 전용 배지를 네 가지 실제 상태로 교체 |
| 8 | frontend/src/app/sidebar/Sidebar.tsx | 기존 레이아웃을 유지하며 안내 변경 |
| 9 | frontend/tests/helpers/loadModules.mjs | 모델/이탈 모듈 로드 |
| 10 | frontend/tests/noteDrafts.test.mjs | 13개 모델·dirty·버전·이탈·상태 검증 |
| 11 | frontend/tests/browser/workspaceReadonly.cjs | 과거 파일명 유지, 현재 editable clean 상태 assertion 갱신, 기존 GET 회귀 유지 |
| 12 | frontend/tests/browser/workspaceCreateDelete.cjs | 생성 성공 후 빈 editable clean Draft assertion 갱신, 기존 생성·삭제 회귀 유지 |
| 13 | frontend/tests/browser/noteDrafts.cjs | 실제 React 입력·재조회·이탈·모바일 mock 검증 |
| 14 | docs/design/note-drafts.md | 현재 모델/계약/한계/확장 지점 |
| 15 | docs/design/create-delete-ui.md | 과거 readOnly 단계와 현재 Draft 단계 구분 링크 |
| 16 | docs/design/workspace-readonly-ui.md | 현재 Draft 후속 단계 링크 |
| 17 | docs/worklogs/2026-10-25-note-drafts.md | 실제 순서/파일/검증 기록 |

로컬 전용: docs/troubleshooting/2026-10-25-frontend-note-drafts.md 및 README도 발견 시 작성하고 검증 뒤 보완했다. Git ignore/추적 제외 정책을 유지한다.

## 검증 결과와 재실행

- pnpm build(tsc -b/Vite), pnpm lint 성공.
- pnpm test 60개(기존 47+새 13), 실패/스킵 0.
- mock Chrome: noteDrafts.cjs, workspaceReadonly.cjs, workspaceCreateDelete.cjs 모두 통과. 실제 Draft 편집 테스트는 GET만 허용하며 기존 생성/이름/삭제 테스트의 쓰기는 전부 mock이다.
- beforeunload: clean false/다른 노트 dirty true/전체 원복 false 조건, listener cleanup, 실제 Chrome reload 경고 취소와 Draft 보존 확인. headless close 경고 미표시 한계는 별도 기록했다.
- 실제 개발 DB 수정 요청 없음. backend/Query 정책/API/의존성/lockfile/migration 변경 없음. backend는 이번에 수정하지 않아 재실행하지 않았다.
- 스크린샷은 테스트 fixture만 포함한 /private/tmp/seam-note-drafts-desktop.png 및 /private/tmp/seam-note-drafts-mobile.png이며 Git에 넣지 않는다. 성능 수치는 측정하지 않았다.

```sh
cd frontend
pnpm build
pnpm lint
pnpm test
# 별도 검증 서버: pnpm exec vite --host 127.0.0.1 --port 25173 --strictPort
# 저장소 root에서 기존 제공 Playwright 사용:
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/noteDrafts.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceReadonly.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceCreateDelete.cjs
```

## 후속 커밋 요청

사용자의 Draft 적용 커밋 요청에 따라 위 구현·테스트·설계·작업 이력 17개 파일을 커밋 대상으로 확인했다. diff 공백 검사를 통과했으며 트러블슈팅은 계속 Git에서 제외한다. 코드 추가 변경이 없어 앞서 통과한 build/lint/Node 60개 및 mock 브라우저 결과를 유지한다. 원격 push는 수행하지 않는다.
