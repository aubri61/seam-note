# 2026-10-25 — Axios·통합 조회·읽기 전용 UI 작업 이력

## 범위와 기준

이전 프론트엔드 API 기반의 미커밋 변경을 보존하며 이번 첨부 요구를 구현했다. 이 문서는 실제 도구 호출 순서로 사후 정리한 이력이며 기록되지 않은 저장 시각을 추정하지 않는다. 이전 기반의 git diff 전체를 이번 변경으로 중복 집계하지 않는다. 이번에는 commit/push/배포하지 않았다.

## 실제 작업 순서

1. 첨부 지시서, AGENTS.md, git 상태를 읽었다. AppLayout/Sidebar/FolderTree/FolderSection/NoteEditor/SyncStatus/AppHeader/WorkspacePicker/DesktopSidebar/기존 NoteList, API/Query/DTO/Repository/통합 테스트/package/tsconfig를 읽었다. 기존 화면은 샘플 React 상태와 편집·DnD·이름 변경을 사용하고 있어 읽기 전용 전환이 필요하다고 판단했다.
2. 분석과 설계를 보고했다. /api/workspace/tree의 두 projection 조회, 순수 view 트리, 첫 노트 DFS, ID별 상세 Query와 읽기 전용 에디터를 선택했다. 트러블슈팅과 작업 이력 초기 문서를 생성하고 목록에 등록했다.
3. frontend에서 pnpm add axios를 실행해 axios 1.20.0 및 의존성을 설치했다. workspace dependency 경로를 조회해 기존 Playwright 런타임의 존재도 확인했다. 새 UI/트리 라이브러리는 설치하지 않았다.
4. backend FolderResponse에 projection 생성자, FolderRepository/NoteRepository에 전체 메타데이터 constructor query를 추가했다. WorkspaceTreeResponse → WorkspaceService → WorkspaceController를 생성했다. 트랜잭션은 readOnly/REPEATABLE_READ, 엔드포인트는 GET /api/workspace/tree로 정했다.
5. client.ts의 fetch 구현을 Axios 단일 인스턴스로 교체했다. 기존 getJson/ApiError 계약은 유지했다. WorkspaceTreeResponse TS 타입과 workspaceKeys를 추가하고 workspaceApi/workspaceQueries를 생성했다.
6. workspaceTree.ts에 순수 view 변환/정렬/관계 방어/첫 Note/조상/표시 행 함수를 작성했다. notePresentation.ts에 선택 ID와 상세 응답 ID 비교 guard를 작성했다.
7. useFolders를 샘플 편집 훅에서 server Query + 선택/검색/펼침 UI 상태 훅으로 바꿨다. FolderTree는 기존 행/색/높이/들여쓰기/스크롤 스타일을 재사용한 네이티브 버튼 목록으로 변경했다. 기존 folderModel 유틸리티·테스트는 보존했다.
8. Sidebar를 metadata 상태/새 트리에 연결하고 생성 버튼은 비활성화했다. AppLayout에서 생성·수정 콜백을 제거하고 상세 Query 상태를 에디터에 전달했다. 기존 반응형 focus/Drawer 구조는 유지했다. NoteEditor를 읽기 전용으로 바꾸고 SyncStatus/AppHeader의 가짜 저장 표시는 읽기 전용으로 교체했다.
9. WorkspaceApiTests를 작성했다. 첫 frontend 빌드 명령은 루트에서 실행해 package.json 부재로 실패했다. 올바른 frontend 디렉터리에서 build/lint를 실행해 성공했다. 일회용 PostgreSQL 17 컨테이너 seam-note-workspace-verification(25439, seam_note_workspace_test)을 생성했다.
10. 기존 API 기반 테스트의 fetch mock을 Axios adapter mock으로 변경했다. Workspace/cancel/cache/늦은 A·선택 B 검증을 추가했다. backend test bootJar를 격리 DB에서 실행해 15개 성공을 확인했다.
11. TS 변환 테스트 helper를 별도 모듈로 추출하고 workspaceTree.test.mjs를 생성했다. 빈/정렬/중첩/동일 sortOrder/순환/부모 누락/중복 ID/5,000단 중첩/검색을 검증했다. Node 테스트 총 34개 성공을 확인했다.
12. 기존 Playwright 패키지는 있었지만 기본 bundled Chromium 바이너리는 없었다. 브라우저를 설치하지 않고 이미 설치된 Chrome channel을 사용했다. 임시 Vite를 25173으로 실행하고 browser/workspaceReadonly.cjs를 작성했다.
13. 실행 중인 개발 backend의 새 통합 API를 GET으로 확인해 200/Folder 1개/Note 4개/content 제외를 확인했다. ID/본문은 출력하지 않았다. backend/DB를 직접 시작·종료·수정하지 않았다.
14. 첫 브라우저 테스트는 에디터를 찾지 못했다. 별도 합성 응답 디버그에서 route '**/api/**'가 /src/lib/api/client.ts에도 매칭되어 JS 대신 JSON을 반환하는 MIME 오류임을 확인했다. API pathname prefix에만 매칭하도록 하네스를 수정했다. 이는 앱 렌더 코드 결함으로 기록하지 않았다.
15. WorkspaceApiTests의 고정 schema는 다음 실행의 빈 상태 검증에 남은 데이터를 섞을 수 있음을 검토로 발견했다(실제 실패는 미관측). 매 JVM 임의 schema를 DynamicPropertySource로 설정하도록 보강했다. 동일 격리 DB에서 backend test bootJar를 다시 실행해 15개 성공했다.
16. 다음 브라우저 테스트에서 다른 노트 선택 후 원래 자동 펼침 하위 폴더가 닫혀 이전 노트 버튼을 찾지 못했다. useFolders.select에서 현재 openFolders와 새 조상을 함께 저장하도록 수정했다. 데스크톱 최초 sidebar open/모바일 최초 drawer closed도 구분했다. 전체 브라우저 시나리오가 통과했다.
17. 모바일 드로어 선택/닫기와 실제 Vite→backend GET 검증을 추가했다. 실제 선택 ID와 에디터 title/content를 별도 상세 GET과 비교해 일치 확인했다. 합성 데이터 스크린샷을 열어 기존 테마/280px 폭/에디터 배치를 확인했다.
18. UI 디자인 보존을 위해 기존 새 문서 FAB를 삭제하는 대신 원래 스타일의 비활성 버튼으로 되돌렸다. 읽기 전용 disabled 설명을 추가했다. 브라우저 테스트에 disabled 확인과 선택 강조 확인, 배경 transition이 끝난 스크린샷을 추가했다.
19. frontend build/lint/test를 최종 실행해 34개 성공했다. 최종 브라우저 검증은 최초 선택·전환 경쟁·캐시·에러/빈 상태·재시도·모바일·실제 GET 연결 모두 성공했다. 실서버에는 GET만 사용했다.
20. 설계/트러블슈팅/파일별 이력을 작성하고 과거 기반 문서에는 현재 Axios·실제 UI 구현 문서로 이어지는 안내를 붙였다. 후속 접근성 보강을 거쳐 임시 환경을 정리하고 최종 정적 검사를 수행했다.

21. 네이티브 flat row에서 기존 tree 계층·키보드 접근성을 잃지 않도록 FolderTree에 tree/treeitem·aria-level·aria-selected·roving tab stop과 화살표/Home/End 탐색을 추가했다. 브라우저에 단일 tab stop/부모·자식 포커스/level 3 확인을 추가하고 build/lint/34개 및 브라우저 전체를 다시 통과했다.
22. 임시 Vite PID 14458에 SIGTERM을 보내고 이번 PostgreSQL 컨테이너만 제거했다. 기존 개발 backend/DB는 그대로 뒀다. 문서 링크/파일 존재/변경 목록 및 git diff --check, 마이그레이션 무변경을 확인했다.

## 파일별 변경 내역

| 파일 | 작업 | 변경 내용·이유 |
| --- | --- | --- |
| backend/src/main/java/com/seamnote/backend/folder/dto/FolderResponse.java | 수정 | 기존 엔티티 생성자를 보존하고 전체 조회 constructor projection용 생성자 추가 |
| backend/src/main/java/com/seamnote/backend/folder/repository/FolderRepository.java | 수정 | workspaceFolders DTO projection 추가. 부모 ID/순서/버전/시각만 직접 SELECT |
| backend/src/main/java/com/seamnote/backend/note/repository/NoteRepository.java | 수정 | workspaceSummaries projection 추가. content를 SELECT하지 않고 전체 요약 조회 |
| backend/src/main/java/com/seamnote/backend/workspace/dto/WorkspaceTreeResponse.java | 신규 | FolderResponse[]/NoteSummaryResponse[] 응답. 서로 다른 배열 유지 |
| backend/src/main/java/com/seamnote/backend/workspace/service/WorkspaceService.java | 신규 | 두 projection을 읽기 전용 repeatable-read snapshot으로 조회. 현재 전역/향후 인증 필터 경계 주석 |
| backend/src/main/java/com/seamnote/backend/workspace/controller/WorkspaceController.java | 신규 | GET /api/workspace/tree 추가, 기존 controller 유지 |
| backend/src/test/java/com/seamnote/backend/WorkspaceApiTests.java | 신규·보강 | 빈 공간/전체 ID 및 관계/정확한 필드/content 제외/SQL 2개 검증. 임의 test schema로 재실행 격리 |
| frontend/package.json | 수정 | 사용자 요구 Axios 의존성 추가 |
| frontend/pnpm-lock.yaml | 수정 | pnpm이 기록한 Axios 및 transitive 의존성 |
| frontend/src/lib/api/client.ts | 이전 기반 파일 수정 | fetch 제거, apiClient /api Axios 인스턴스. getJson/ApiError 호환, HTTP/network/cancel 분리, response.data 반환 |
| frontend/src/lib/api/types.ts | 이전 기반 파일 수정 | WorkspaceTreeResponse 추가, 기존 Folder/NoteSummary 타입 재사용 |
| frontend/src/lib/query/queryKeys.ts | 이전 기반 파일 수정 | workspace all/tree 키 추가 |
| frontend/src/features/workspace/workspaceApi.ts | 신규 | getWorkspaceTree GET 함수와 signal 전달 |
| frontend/src/features/workspace/workspaceQueries.ts | 신규 | 단일 metadata Query/Hook, Infinity stale/focus·reconnect refetch 비활성 |
| frontend/src/features/workspace/workspaceTree.ts | 신규 | 원본 비변경 view 노드, 종류별 key, 안정 정렬, 순환/고아/중복 방어, 첫 Note·조상·표시/제목 검색 반복문 |
| frontend/src/features/notes/notePresentation.ts | 신규 | 선택 ID와 상세 ID가 같을 때만 에디터용 Note 반환 |
| frontend/src/features/folders/useFolders.ts | 수정 | 샘플 배열과 로컬 create/update/move 제거. metadata/detail Query와 로컬 선택/검색/펼침으로 연결. 발견된 펼침 유지 문제 보강 |
| frontend/src/features/folders/FolderTree.tsx | 수정 | 기존 스타일에 native treeitem 버튼 연결, 펼침/접기/선택 강조와 계층·키보드 탐색. Arborist 편집/DnD 연결 제거 |
| frontend/src/app/sidebar/Sidebar.tsx | 수정 | metadata 로딩/오류/재시도/빈 상태와 새 트리 연결. 생성 비활성·읽기 전용 안내 |
| frontend/src/app/AppLayout.tsx | 수정 | 실제 selected detail/로딩/오류 연결, 모바일 focus 유지, 기존 생성·수정 콜백 제거 |
| frontend/src/features/notes/NoteEditor.tsx | 수정 | Note 상세/선택 ID guard, readOnly 제목·본문, 로딩/오류/빈 상태·재시도, 기존 FAB 비활성 보존 |
| frontend/src/features/sync/SyncStatus.tsx | 수정 | 가짜 로컬 저장/동기화 성공 대신 실제 읽기 전용 badge |
| frontend/src/app/AppHeader.tsx | 수정 | 저장 상태 타입/기본값 제거 후 읽기 전용 badge 연결 |
| frontend/tests/apiFoundation.test.mjs | 이전 기반 테스트 수정 | Axios adapter 성공/HTTP/network/cancel, workspace 캐시와 빠른 상세 전환 테스트로 교체 |
| frontend/tests/helpers/loadModules.mjs | 신규(기존 테스트에서 추출) | 실제 TS 모듈 변환/alias 해석/임시 파일 정리를 테스트 간 공유 |
| frontend/tests/workspaceTree.test.mjs | 신규 | 정렬/최초 선택·중첩/빈/손상 관계/깊은 경로/검색 테스트 8개 |
| frontend/tests/browser/workspaceReadonly.cjs | 신규 | 기존 Chrome/제공 Playwright로 GET-only 실제 UI 흐름과 선택·본문 일치 검증 |
| docs/design/workspace-readonly-ui.md | 신규 | 계약·구조·데이터흐름·테스트·미구현·트레이드오프·재실행 방법 |
| docs/design/frontend-api-foundation.md | 이전 기반 문서 보완 | 과거 fetch/미연결 기록임을 표시하고 현재 구현 문서 링크 추가 |
| docs/design/folder-api.md | 수정 | 기존 CRUD 계약을 유지하며 새 통합 API 문서 링크 추가 |
| docs/troubleshooting/2026-10-25-workspace-readonly-ui.md | 신규·갱신 | 발견 근거/브라우저 실패 원인/펼침 버그/개선 및 검증 기록 |
| docs/troubleshooting/README.md | 수정 | 새 shared 문제 등록 후 검증 상태 해결로 갱신 |
| docs/worklogs/2026-10-25-axios-workspace-ui.md | 신규·갱신 | 이 실제 순서와 파일별 변경 이력 |

## 검증 명령과 산출물

- frontend: pnpm build, pnpm lint, pnpm test. 최종 34개(13 Axios/Query + 13 기존 모델 + 8 트리) 성공.
- backend: TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_workspace_test ./backend/gradlew -p backend test bootJar --offline. 최종 15개, failures/errors/skipped 0. 테스트 결과는 backend/build/test-results/test, 실행 jar는 backend/build/libs.
- browser: SEAM_NOTE_PLAYWRIGHT_MODULE로 제공 런타임 경로 지정, SEAM_NOTE_LIVE_GET=1 node frontend/tests/browser/workspaceReadonly.cjs. 앱 의존성에 Playwright를 추가하지 않음.
- 합성 UI 스크린샷: /private/tmp/seam-note-workspace.png. debug 스크립트/이미지는 /private/tmp/seam-debug-ui.cjs 및 seam-debug-ui.png. 실제 사용자 원고는 캡처하지 않았다.
- 임시 변환 테스트 모듈은 테스트 종료 시 삭제한다. 사용한 일회용 PostgreSQL 컨테이너와 임시 Vite는 작업 후 제거/종료했다. 기존 개발 backend/DB는 종료하지 않는다.

## 유지한 코드와 미구현

Note 엔티티/@Version/expectedVersion 수정 계약, 기존 CRUD, 기존 Flyway 파일, Vite proxy/port, Provider/QueryClient와 기존 GET 함수·Hook, 테마·Drawer·기존 folderModel 테스트를 유지했다. 현재 화면에 쓰이지 않는 예전 NoteList/notes.ts 샘플은 임의 삭제하지 않았다. 기존 Arborist 의존성은 유지하되 활성 트리에서 사용하지 않는다.

새 DB 마이그레이션/인증/생성/저장/이동/정렬/오프라인/Outbox/충돌 UX는 구현하지 않았다. 글로벌 metadata 범위, 대량 데이터의 초기 페이로드/비가상화 렌더링, 캐시 refresh 정책은 [설계 문서](../design/workspace-readonly-ui.md)에 한계를 기록했다.

## 후속 — 5173 연결 문의 (2026-10-25)

사용자 문의 후 lsof로 현재 frontend cwd와 [::1]:5173 바인딩을 확인했다. localhost/IPv6 GET 200 및 API 200, IPv4 127.0.0.1 연결 거부를 비교했다. 코드/서버를 수정하지 않고 localhost 접속 주소를 안내하고 기존 프론트 API 트러블슈팅 문서에 원인·재현 결과를 추가했다. 테스트 당시 임시 25173은 종료했지만 사용자의 현재 5173 서버는 실행 중임을 구분했다.
