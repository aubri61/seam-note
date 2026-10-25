# 2026-10-25 — 폴더/빈 원고 생성·원고 삭제 작업 이력

## 기준과 범위

이전 작업의 미커밋 변경을 유지한 채 이번 세 기능만 구현했다. 현재 git diff 전체를 이번 변경으로 집계하지 않는다. 아래 순서는 실제 실행 순서이며 개별 저장 시각은 추정하지 않는다. 이번 단계에서 commit/push/배포는 하지 않았다.

## 실제 작업 순서

1. git 상태와 실제 FolderController/NoteController/생성 DTO/WorkspaceTreeResponse, Axios client/TS 타입/Query Key/workspace Query, useFolders/Sidebar/AppLayout/NoteEditor, 기존 테스트 helper와 README를 읽었다.
2. 명시적 생성 폴더 상태 부재, Infinity cache와 삭제 상세 cache의 위험을 보고했다. 트러블슈팅과 초기 작업 이력 문서를 작성하고 목록에 개선 중으로 등록했다.
3. client.ts의 Axios 요청/오류 변환을 공통 request로 정리하고 postJson/deleteResource를 추가했다. 기존 GET의 ApiError 계약과 성공 JSON 검증은 유지하며 DELETE 204는 body 검증 없이 반환하도록 했다. folderApi/noteApi에 실제 POST/DELETE 함수를 추가했다.
4. workspaceActions.ts에 전체 정렬 순서의 Folder 선택지/경로와 삭제 후 다음·이전 Note 결정을 작성했다. workspaceMutations.ts에 useMutation·옵션 팩토리 3종을 작성했다. 서버 성공 뒤 cache patch/seed/remove 및 invalidation을 수행한다.
5. networkMode:always/retry:false로 쓰기 자동 재시도/온라인 복귀 시 대기를 피했다. metadata GET은 쓰기 성공 뒤 별도로 시작하며 그 실패를 쓰기 실패로 바꾸지 않도록 분리했다.
6. useFolders에 별도 selectedFolderId, 성공한 생성의 자동 선택/조상 펼침, 삭제 후 선택, 동기 요청 guard를 추가했다. FolderTree의 직접 Folder 활성화와 연결했다. 최초 자동 Note 선택으로 생성 폴더를 임의 결정하지 않았다.
7. WorkspaceActionDialog.tsx를 기존 Radix/Emotion으로 작성했다. 이름/위치 입력, 복구 불가 삭제 확인, 취소 기본 포커스, pending/error/retry 안내를 제공했다. Sidebar/AppLayout/NoteEditor의 버튼과 연결했다. 생성 요청 전에는 가짜 노드를 만들지 않는다.
8. 최초 frontend build에서 기존 Icon 모듈에 trash가 없어 TS 타입 오류가 났다. 기존 SVG 방식의 trash 경로만 추가했다. 삭제 뒤 다른 분기의 Note를 선택할 때 조상 폴더도 펼치도록 보강했다.
9. 모바일 Folder 생성의 중첩 Dialog와 Note 생성 후 Drawer 닫기/에디터 복귀를 연결했다. 에디터 제목/본문은 계속 readOnly이며 안내에서 생성·삭제의 서버 반영과 본문 편집 미지원을 구분했다.
10. Node workspaceMutations.test.mjs를 작성하고 TS 테스트 helper에 새 모듈을 추가했다. 최초 build/lint/43개(기존 34 + 새 9)가 통과했다.
11. 모든 /api 요청을 intercept하는 workspaceCreateDelete.cjs를 작성했다. 이전 조회 브라우저 스크립트는 이제 활성화된 새 문서 버튼 assertion만 갱신했다. 기존 사용자 5173과 별개로 임시 Vite를 25173에 실행하고 PostgreSQL 17 일회용 컨테이너 seam-note-create-delete-verification(25439, seam_note_actions_test)을 생성했다.
12. 첫 브라우저 실패는 모달이 정상적으로 배경을 aria-hide해서 배경 에디터의 role 조회가 실패한 하네스 문제였다. 배경 상태 확인을 CSS locator로 수정했다. 앱의 선택 상태 손실로 판단하지 않았다.
13. 최초 backend test bootJar는 UP-TO-DATE여서 새 DB 실행이 아니었다. --rerun-tasks를 추가해 격리 DB에서 기존 15개 테스트/bootJar를 실제 실행했고 모두 통과했다. 백엔드 소스와 migration은 이번에 수정하지 않았다.
14. mock 브라우저에서 명시적 위치, root/child Folder, 빈 Note 자동 선택·readOnly, 생성 실패, 삭제 취소/실패/성공/마지막 Note, duplicate click/submit, 응답 유실, 모바일 전환이 통과했다.
15. 삭제 중 이전 GET 취소/늦은 응답의 상세 cache 복원 차단, 응답 유실 후 같은 UUID 409를 Node 테스트에 추가했다. 총 45개가 됐다.
16. 재제출 때 새 UUID를 만들면 결과가 불명확한 POST 뒤 중복 엔티티를 만들 수 있음을 코드 검토로 확인했다. 같은 생성 Dialog 동안 UUID를 유지하고, 직접 새 문서 실패 뒤 Dialog가 열릴 때도 실패 요청 ID를 이어받도록 보강했다. 브라우저 mock에 서버의 duplicate 409를 반영하고 실제 같은 ID 재제출/노드 1개/자동 성공 선택 없음까지 확인했다.
17. frontend build/lint/45개 테스트와 새 생성·삭제/기존 조회 브라우저 두 스크립트를 재실행해 모두 통과했다. 실제 API 쓰기를 켜지 않고 mock만 사용했다.
18. 완전히 빈 공간에서 폴더 선택 불가 안내를 추가했다. 첫 root Folder와 첫 빈 Note를 만드는 브라우저 시나리오를 추가한 뒤 build/lint와 해당 브라우저 전체를 통과했다. Node 로직 변경이 없어 이미 통과한 45개를 불필요하게 반복하지 않았다.
19. 현재 metadata invalidation 주석과 읽기 전용 badge tooltip을 새 기능에 맞게 정리했다. 설계·계약·한계·전체 파일 목록/이력을 작성하고 이전 조회 단계 문서에 후속 링크를 추가했다.
20. 임시 Vite PID 70050(25173)을 종료하고 이번 PostgreSQL 컨테이너만 제거했다. 사용자 프론트 PID 37770은 [::1]:5173에서 계속 실행 중임을 확인했다. 문서 링크·파일 존재·diff 공백 및 백엔드 테스트 XML을 최종 확인했다.

## 이번 단계의 파일별 변경

| 파일 | 구분 | 변경 내용 |
| --- | --- | --- |
| frontend/src/lib/api/client.ts | 기존 수정 | 공통 Axios request/오류 처리, postJson, body 없는 deleteResource. GET 호환 유지 |
| frontend/src/features/folders/folderApi.ts | 기존 수정 | createFolder POST /api/folders |
| frontend/src/features/notes/noteApi.ts | 기존 수정 | createNote POST /api/notes, deleteNote DELETE /api/notes/{id} |
| frontend/src/features/workspace/workspaceMutations.ts | 신규 | Mutation 옵션·Hook 3종, 성공 기준 cache 반영/무효화/삭제 상세 취소·제거, retry:false/networkMode:always |
| frontend/src/features/workspace/workspaceActions.ts | 신규 | 정렬된 Folder 선택지/조상 경로, 삭제 후 다음·이전·빈 선택 결정 |
| frontend/src/features/workspace/WorkspaceActionDialog.tsx | 신규 | Folder/Note 위치 폼, 영구 삭제 확인, pending/error, 폼 UUID 유지와 결과 불명확 안내 |
| frontend/src/features/workspace/workspaceQueries.ts | 주석 수정 | Infinity cache가 성공 Mutation 뒤 명시적으로 무효화됨을 주석에 반영 |
| frontend/src/features/folders/useFolders.ts | 기존 수정 | 명시적 생성 위치, 생성 성공 자동 선택/펼침, 삭제 선택 복구, 동기 중복 guard, 성공/실패/busy 반환 |
| frontend/src/features/folders/FolderTree.tsx | 기존 수정 | Folder 활성화 callback과 생성 대상 data 속성. Note 조회 선택과 구분 |
| frontend/src/app/sidebar/Sidebar.tsx | 기존 수정 | 새 Folder/Note 버튼, 생성 위치 표시, 상태·refresh 실패 안내, 새 선택 props 전달 |
| frontend/src/app/AppLayout.tsx | 기존 수정 | 액션 Dialog 상태/버튼 연결, 실패 팝업, 모바일 생성 후 에디터 복귀, metadata refetch 오류와 상세 오류 구분 |
| frontend/src/features/notes/NoteEditor.tsx | 기존 수정 | FAB 생성 연결, 툴바 삭제 버튼, pending 비활성, 실제 서버 생성·삭제/본문 readOnly 안내 |
| frontend/src/features/sync/SyncStatus.tsx | 문구/주석 수정 | badge는 본문 readOnly를 설명하며 생성·삭제는 별도라는 tooltip으로 갱신 |
| frontend/src/components/Icon.tsx | 기존 수정 | 같은 SVG stroke 스타일의 trash 아이콘 추가 |
| frontend/tests/helpers/loadModules.mjs | 기존 수정 | 실제 TS Actions/Mutation 모듈을 테스트에 로드 |
| frontend/tests/workspaceMutations.test.mjs | 신규 | Mutation/HTTP/cache/재시도/취소/선택/중복 UUID 한계 11개 |
| frontend/tests/browser/workspaceCreateDelete.cjs | 신규 | API를 모두 mock 처리한 생성·삭제·취소·실패·중복·빈 공간·모바일 검증 |
| frontend/tests/browser/workspaceReadonly.cjs | 기존 테스트 조정 | 새 문서 버튼 활성 assertion 반영. 기존 조회 시나리오 유지 |
| docs/design/create-delete-ui.md | 신규 | 현재 계약·선택·Mutation/cache·응답 유실 한계·검증·재실행 방법 |
| docs/design/workspace-readonly-ui.md | 기존 문서 보완 | 조회 단계 기록임을 표시하고 생성·삭제 단계 링크 추가 |
| docs/troubleshooting/2026-10-25-create-delete-selection-cache.md | 신규·갱신 | 발견 근거, 구현/하네스·타입 오류와 해결, 검증/한계 |
| docs/troubleshooting/README.md | 기존 수정 | 새 문제 링크 및 해결 상태 |
| docs/worklogs/2026-10-25-create-delete-ui.md | 신규·갱신 | 실제 순서와 파일별 이력 |

## 검증과 재실행

- frontend: pnpm build(tsc -b/Vite), pnpm lint 성공. pnpm test 45개, failures/skips 0. 기존 34개는 유지했다.
- browser: 기존 Chrome/제공 Playwright를 SEAM_NOTE_PLAYWRIGHT_MODULE로 지정했다. workspaceCreateDelete.cjs 및 workspaceReadonly.cjs 성공. 생성·삭제의 모든 POST/DELETE는 mock이며 실제 서버로 전달하는 옵션이 없다. 앱에 새 테스트 라이브러리는 설치하지 않았다.
- backend: `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_actions_test ./backend/gradlew -p backend test bootJar --offline --rerun-tasks` 성공, 기존 15개 failures/errors/skipped 0. XML은 backend/build/test-results/test에 있다.
- 테스트용 PostgreSQL 컨테이너를 제거하고 25173 Vite만 종료했다. 기존 개발 DB/5173 frontend/backend는 종료하거나 쓰기 테스트하지 않는다.

## 유지한 범위·한계

본문 readOnly, 기존 GET/정렬·탐색·Query Key, 백엔드 계약과 소스/마이그레이션, 기존 dependency/lockfile을 이번 단계에서 변경하지 않았다. 내용 편집·자동 저장·expectedVersion 수정 Mutation·Folder 삭제·이동·정렬·인증·IndexedDB/Outbox/operationId 영속 처리는 추가하지 않았다. 이전 단계의 미커밋 변경은 그대로 남아 있다.

같은 폼 UUID 재사용은 서버 멱등성 구현이 아니다. 응답 유실 뒤 409는 원래 성공을 재생하지 않으며, 폼 취소/새로고침으로 ID를 잃고 새 요청을 만들면 별도 항목이 생길 수 있다. 삭제는 물리 삭제이며 서버 성공 이후 복구할 수 없다. 상세는 [설계 문서](../design/create-delete-ui.md), [트러블슈팅](../troubleshooting/2026-10-25-create-delete-selection-cache.md) 참조.

## 사용자 피드백 후 추가 UI 복원 — 실제 후속 작업 순서

이 절부터가 이번 수정이다. 위 1~20은 이전 구현 이력이며 당시의 위치 선택 Dialog는 현재 동작이 아니다. 사용자 지시대로 기존 `+` 메뉴/생성 위치를 복원했다. commit/push는 하지 않았다.

21. git status, AGENTS.md와 현재 useFolders/AppLayout/Sidebar/FolderTree/생성 Dialog, API/Mutation/타입/테스트를 읽었다. git show 0b224d5의 Sidebar/useFolders/folderModel을 비교해 원래 details 메뉴와 선택 Folder 내부/선택 Note 부모 규칙을 확인했다.
22. 실제 FolderController의 PATCH /api/folders/{id}, UpdateFolderRequest.name(@NotBlank, 최대 200)를 확인했다. 백엔드 변경 없이 원래 트리 내 이름 입력을 저장할 수 있음을 확인했다.
23. frontend/src/lib/api/client.ts에 patchJson을 추가하고 folderApi.ts에 renameFolder를 연결했다. workspaceMutations.ts에는 생성 Folder 이름 저장 Mutation(서버 성공 기준 cache 교체/detail seed/invalidate, retry:false)을 추가했다.
24. workspaceActions.ts에 kind로 구분하는 TreeSelection과 creationParent를 작성했다. useFolders.ts의 별도 쓰기 Folder 고정 상태를 트리 선택으로 바꾸고 선택 Note/활성 Note의 실제 부모를 따르게 했다. 생성 성공 자동 선택·펼침과 동기 guard는 유지하고 새 Folder 이름 입력 상태를 연결했다.
25. Sidebar.tsx의 분리된 아이콘·생성 위치 문구를 제거하고 이전 CreatePicker 스타일/details 메뉴를 복원했다. AppLayout.tsx는 메뉴/FAB가 바로 실제 POST를 실행하게 바꾸고 생성 오류/같은 UUID 재시도를 inline으로 표시했다. WorkspaceActionDialog.tsx의 추가 폼을 제거해 영구 삭제 확인만 남겼다.
26. FolderTree.tsx에 새 Folder inline 이름 입력/Enter·blur 저장/Escape 종료/비공백 검증을 복원했다. 입력을 button 안에 중첩하지 않도록 Row를 role=treeitem인 div로 바꾸고 Enter/Space 및 기존 방향키 탐색을 유지했다. Folder 선택 highlight와 roving focus도 실제 트리 선택을 따른다.
27. pnpm build/tsc, lint, 기존 Node 45개를 통과했다. workspaceMutations.test.mjs에 실제 새 생성 위치 규칙과 PATCH 실패/성공/cache 계약 2개를 추가해 총 47개 통과했다.
28. workspaceCreateDelete.cjs를 현재 드롭다운/inline 입력 계약으로 갱신했다. 모든 API mock에 PATCH를 추가하고 Note를 선택하면 이전 Folder 목적지가 해제되는 것, 실패/수동 재시도 UUID 유지, root/child, 모바일을 검증했다. 삭제 회귀는 유지했다.
29. 별도 Vite 25173에서 생성·삭제 및 기존 조회 Chrome 스크립트 모두 통과했다. 모바일 Drawer가 열렸을 때 생성 오류가 배경에 숨지 않도록 Sidebar에도 전달했고 이름 입력 오류 줄이 잘리지 않게 높이를 보완했다. build/lint와 두 브라우저 회귀를 최종 확인했다.
30. 설계 문서를 현재 계약으로 다시 작성하고, 기존 트러블슈팅에 추가 UI 회귀 원인/해결/검증을 보완했다. README의 동일 문제 링크를 갱신했다. 사용자 5173 PID 37770([::1])은 유지하고 이번 임시 Vite(25173)만 종료했다.

### 이번 후속 수정 파일 (실제 첫 변경 순서)

| 순서 | 파일 | 수정 내용 |
| --- | --- | --- |
| 1 | frontend/src/lib/api/client.ts | PATCH 공통 요청/오류 변환 |
| 2 | frontend/src/features/folders/folderApi.ts | 실제 renameFolder PATCH |
| 3 | frontend/src/features/workspace/workspaceMutations.ts | 이름 저장 성공 cache/invalidate와 Hook |
| 4 | frontend/src/features/workspace/workspaceActions.ts | 기존 위치 규칙과 TreeSelection |
| 5 | frontend/src/features/folders/useFolders.ts | 트리 선택 기준 위치/생성 성공 선택/inline 이름 상태 |
| 6 | frontend/src/app/sidebar/Sidebar.tsx | 원래 + 드롭다운 복원, 별도 버튼/위치 문구 제거, 모바일 오류 전달 |
| 7 | frontend/src/app/AppLayout.tsx | 즉시 POST 연결, 생성 폼 제거, 실패/동일 UUID 재시도 |
| 8 | frontend/src/features/workspace/WorkspaceActionDialog.tsx | 추가 폼 제거, 삭제 확인 유지 |
| 9 | frontend/src/features/folders/FolderTree.tsx | inline 이름 입력/PATCH 연결, 실제 Folder 선택 강조, 키보드 유지 |
| 10 | frontend/tests/browser/workspaceCreateDelete.cjs | 현재 생성 UX와 실제 API 계약의 mock 회귀 |
| 11 | frontend/tests/workspaceMutations.test.mjs | 위치 규칙 및 rename PATCH/cache 실패·성공 2개 추가 |
| 12 | docs/design/create-delete-ui.md | 최종 동작/계약/응답 유실·버전 한계로 갱신 |
| 13 | docs/worklogs/2026-10-25-create-delete-ui.md | 이 후속 순서/파일 기록 |
| 14 | docs/troubleshooting/2026-10-25-create-delete-selection-cache.md | UI 회귀 및 선택 목적지 원인·검증 보완 |
| 15 | docs/troubleshooting/README.md | 같은 문제 목록 제목 보완 |

검증 도구 호출 중 python 별칭 부재는 python3로, 저장소 root의 pnpm exec(패키지 없음)은 frontend 경로로 수정했다. 앱/DB 문제는 아니며 두 명령을 성공 검증으로 집계하지 않았다. 이번 백엔드·개발 DB 쓰기·원고 편집·마이그레이션 변경은 없다.
