# 2026-10-25 — 노트 URL 라우팅 작업 이력

## 실제 작업 순서

1. git 상태(깨끗함), AGENTS.md, main/App/AppLayout/useFolders/FolderTree/Sidebar/NoteEditor/Draft/Query/Mutation 및 테스트·문서 구조를 확인했다. 기존 라우터/배포 웹서버 설정은 없었다.
2. pnpm add react-router-dom으로 호환 라우터를 설치했다. 의존성/lockfile만 변경한다.
3. 로컬 전용 docs/troubleshooting/2026-10-25-frontend-note-routing.md 및 README에 URL 상태 부재·fallback·Draft 수명 위험을 기록했다.

4. app/routing/noteRoutes.ts에 UUID/path/정규화/400·404 정책을 작성했다. main에 BrowserRouter를 추가하고 App에 단일 부모 AppLayout + index/notes/:noteId/catch-all 자식 WorkspaceEditor/Outlet 구성을 작성했다.
5. useFolders의 requestedNoteId와 없는 ID의 첫 Note fallback을 제거했다. URL만 Note 선택을 소유하고 Folder 선택은 navigation key에 묶인 UI 상태로 남겼다. 루트 첫 Note replace/조상 펼침/UUID 정규화/생성 push/삭제 replace를 연결했다.
6. AppLayout이 Draft Hook과 기존 UI 상태를 계속 소유하도록 NoteEditor를 Outlet context로 전달했다. NoteEditor에는 invalid route의 재시도·삭제 비활성 제어만 추가했다. Draft 모델/Hook/Query Key/서버 API/Mutation 코드는 바꾸지 않았다.
7. FolderTree의 Note row를 Link로 바꿔 href와 수정 키 클릭을 보존했다. 폴더는 기존 row이며 roving focus/방향키/Enter/Space/스타일을 유지했다.
8. 최초 build는 noteRoutes Error class의 TS parameter property가 프로젝트 erasableSyntaxOnly와 충돌해 TS1294로 실패했다. 명시적 필드/대입으로 바꾼 뒤 build/lint/기존 Node 60개를 통과했다. tsconfig는 바꾸지 않았다.
9. 테스트 helper에 route 정책 모듈을 추가했다. 기존 browser readonly/Draft fixture의 짧은 ID를 UUID로 변환하고 기존 이름/본문/검증 의도는 유지했다. noteRoutes.test.mjs에 정책 5개를 추가해 총 65개로 늘렸다.
10. 기존 조회/생성·삭제/Draft 브라우저 스크립트를 임시 Vite 25173에서 실행해 통과했다. 사용자 5173 서버는 유지했다. 별도의 noteRouting.cjs에 root replace/Link/document 유지/직접 접속/history/Draft/404/모바일을 작성했다.
11. 새 history 테스트에서 B 클릭 직후 B 화면 확인 없이 Back을 실행했다. B의 URL과 Draft가 반영된 사용자 흐름을 먼저 기다리도록 테스트를 수정한 뒤 조상 자동 펼침을 통과했다. 이 문제로 앱 코드를 바꾸지는 않았다.
12. 직접 진입 테스트는 StrictMode/취소 요청까지 mock handler가 집계해 같은 B GET이 2번 시작될 수 있었다. 요청 수를 무조건 1회로 가정하지 않고 요청 ID가 모두 B이고 다른 원고 요청이 없는지 검증했다. 개발 StrictMode를 끄거나 Query 정책을 바꾸지 않았다.
13. Workspace 부재로 disabled된 Query에 retry를 연결하면 skipToken refetch 위험이 있음을 코드로 확인했다. 없는 ID의 재시도는 Workspace부터 갱신하고 잘못된 주소에는 retry를 표시하지 않게 했다. Workspace membership이 확인되기 전에는 새 원고 snapshot을 표시하지 않도록 했다. mock에서 처음 제외된 원고가 새 metadata에 포함되면 동일 URL로 정상 표시됨을 확인했다.
14. 상세 재조회 404와 Workspace/주소 오류를 구분했다. 기존 dirty Draft가 있는 상세 실패는 오류와 함께 입력을 유지한다. Workspace가 없는 ID라고 확인한 경우에는 Draft 메모리를 지우지 않고 편집 화면만 숨긴다. 기존 Draft 조회 실패/재시도 회귀를 유지했다.
15. 생성·삭제 mock에 성공 URL/실패 URL·Draft 유지/삭제 history replace/빈 root/삭제 URL 404/삭제 중 Back/모바일 URL 검증을 추가했다. 실제 DB 쓰기 없이 통과했다.
16. 최종 build/tsc/lint, Node 65개(실패·스킵 0), noteRouting/workspaceReadonly/workspaceCreateDelete/noteDrafts Chrome 회귀 모두 통과했다. 기존 Draft 스크립트에서 실제 Chrome 새로고침 경고 취소도 재검증했다.
17. docs/design/note-routing.md에 모델/설치 버전/수명/직접 접속/SPA fallback/한계를 기록하고 frontend README 및 기존 Draft 설계에 후속 링크를 넣었다. 실제 배포 설정은 없어서 서버 설정/배포를 수행하지 않았다.
18. 로컬 troubleshooting 문서/README를 검증 결과로 갱신하고 Git ignore 유지 및 backend/마이그레이션/저장 API 변경 없음을 확인했다. 이번 임시 Vite PID 22091(25173)만 종료하고 사용자 5173을 유지했다. commit/push는 요청 범위가 아니어서 하지 않았다.

실제 개발 DB 쓰기·백엔드 변경·Note 저장/영속 저장은 하지 않았다.


## 파일별 변경

| 파일 | 내용 |
| --- | --- |
| frontend/package.json, frontend/pnpm-lock.yaml | react-router-dom/react-router 7.18.4 및 전이 의존성 추가 |
| frontend/src/app/routing/noteRoutes.ts | URL 생성/UUID 정규화/route error 정책 |
| frontend/src/main.tsx | 기존 Provider 안에 BrowserRouter |
| frontend/src/App.tsx | 지속 부모 레이아웃/자식 route/WorkspaceEditor |
| frontend/src/features/folders/useFolders.ts | URL 단일 선택, root/canonical replace, 생성·삭제 이동, 폴더 UI/조상/에러 분리 |
| frontend/src/app/AppLayout.tsx | 부모 Draft 유지/Outlet props/오류별 재시도 연결 |
| frontend/src/features/notes/NoteEditor.tsx | 오류 route의 retry/delete 제어. 기존 입력·스타일 유지 |
| frontend/src/features/folders/FolderTree.tsx | Link Note row, 기존 키보드/생성 Folder UI 보존 |
| frontend/tests/helpers/loadModules.mjs | 실제 route 정책 TS 모듈 로드 |
| frontend/tests/noteRoutes.test.mjs | home/UUID/invalid/unknown/404·path 5개 |
| frontend/tests/browser/noteRouting.cjs | 실제 URL/history/직접 접속/Draft/404/모바일 mock 검증 |
| frontend/tests/browser/workspaceReadonly.cjs | UUID fixture와 404 문구 갱신, 기존 조회 시나리오 유지 |
| frontend/tests/browser/noteDrafts.cjs | UUID fixture 매핑만 갱신. 기존 편집/버전/이탈 검증 유지 |
| frontend/tests/browser/workspaceCreateDelete.cjs | 생성/삭제 URL/history/실패 Draft/삭제 URL 직접 접속/대기 중 Back 검증 |
| docs/design/note-routing.md | 최종 설계·계약·운영 fallback/한계 |
| frontend/README.md | 라우팅 사용/배포 요구사항 |
| docs/design/note-drafts.md | 현재 URL 단계에서도 부모 Draft 유지됨을 링크 |
| docs/worklogs/2026-10-25-note-routing.md | 실제 순서·변경 파일·검증 |

로컬 전용 docs/troubleshooting/2026-10-25-frontend-note-routing.md와 README는 계속 Git에서 제외한다.

## 검증 결과와 재실행

- 환경: Node v20.20.0/pnpm 10.32.1/Vite 8.3.5, 기존 제공 Playwright + 설치된 Chrome(headless). 새 테스트 라이브러리 없음.
- pnpm build(tsc/Vite), pnpm lint, pnpm test 65개 모두 성공(기존 60+신규 5).
- 브라우저 4종 성공: noteRouting, workspaceReadonly, workspaceCreateDelete, noteDrafts. 라우팅/Draft/조회 테스트는 mock GET만, 기존 생성/이름/삭제 시나리오의 쓰기는 mock만 허용했다.
- URL 이동이 full document reload가 아님을 init-script document marker로 검증했다. root/delete replace는 history 길이로 확인했다. 느린 응답/직접 진입 병렬 조회 및 Back/Forward dirty 보존을 검증했다.
- 잘못된 UUID는 상세 API 없이 오류, 없는 UUID/Workspace 제외/삭제 URL은 404와 원래 URL 유지. 부재 metadata 재시도 후 같은 URL로 정상화도 검증했다.
- 390×844 모바일 screenshot을 확인했다. 개발 Vite deep link document/새로고침은 HTTP 200 HTML로 앱을 로드한다. 운영 서버 fallback/SSR/HTTP document 404는 미검증·미구현이다.
- backend/DB migration/API/Query Key/Draft 모델·Hook 변경 없음. backend 테스트는 이번에 다시 실행하지 않았다.

```sh
cd frontend
pnpm build
pnpm lint
pnpm test
# 별도 검증 서버: pnpm exec vite --host 127.0.0.1 --port 25173 --strictPort
# 저장소 root, 기존 제공 Playwright 경로 지정:
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/noteRouting.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceReadonly.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceCreateDelete.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/noteDrafts.cjs
```

## 유지한 한계

주소는 Note ID만 전달하며 Draft 공유/영속화는 하지 않는다. 새로고침/새 탭/강제 종료에서 메모리 원고 복원은 보장하지 않는다. 경고 표시도 브라우저 정책에 의존한다. 운영 SPA fallback은 배포 환경에서 별도 적용해야 한다. 과거 삭제 URL history를 제거하거나 삭제된 dirty Draft를 자동 폐기하지 않는다. 향후 IndexedDB는 기존 noteId와 AppLayout Hook 소유 경계에 연결해야 하며 URL 전환을 초기화 신호로 쓰면 안 된다.

## 후속 커밋·푸시 요청

사용자의 전체 변경 커밋·푸시 및 PR 제목/본문 정리 요청에 따라 origin을 fetch하고 기본 브랜치가 main임을 확인했다. 현재 feat/note-create의 미커밋 라우팅 구현·테스트·문서를 커밋 대상으로 확인했다. 이전 커밋의 API/생성·삭제/Draft까지 main 대비 PR 범위에 포함한다. 코드 추가 변경이 없어 앞서 성공한 build/lint/Node 65개 및 mock 브라우저 4종 결과를 사용한다. 트러블슈팅 Git 제외를 유지하고 일반 push만 수행하며, PR 생성은 사용자가 진행한다.
