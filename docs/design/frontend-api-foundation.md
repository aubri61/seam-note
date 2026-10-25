# 프론트엔드 조회 API 연동 기반

> 이 문서는 최초 기반 작업 당시 기록이다. 후속 [Axios·전체 조회 UI](workspace-readonly-ui.md)에서 HTTP 클라이언트를 Axios로 바꾸고 실제 화면을 연결했다. 현재 구현은 후속 문서를 기준으로 한다.

## 1. 기존 구조 분석과 범위

기존 작업은 `08865b3` (`feat(backend): add folder APIs and expected-version conflict checks`)으로 먼저 커밋했다. 이번 변경은 그 이후 프론트엔드 조회 기반에 한정한다.

- React + TypeScript + Vite + Emotion, pnpm. TanStack Query는 이미 dependencies에 있어 설치하지 않았다. React Arborist도 기존 의존성으로 유지했다. package.json/lockfile 변경 없음.
- main.tsx에 ThemeProvider만 있고 QueryClientProvider가 없었다. Vite에는 React plugin과 @ alias만 있었고 /api proxy가 없었다. 백엔드 소스에 CORS 설정도 없었다.
- AppLayout → useFolders의 React 상태 → Sidebar/FolderTree/NoteEditor 구조. 샘플 데이터는 features/notes/notes.ts와 useFolders 초기값에 있다.
- 기존 FolderItem/FolderTreeNode는 폴더/문서를 합친 UI 트리 모델이고 NotePreview는 카드용 샘플이다. 서버 DTO와 필드 의미가 달라 서버 타입으로 재사용하거나 삭제하지 않았다. 서버 DTO는 lib/api/types.ts 한 곳에 정의한다.
- 서버 데이터는 TanStack Query 캐시가 관리한다. 선택/펼침/검색/포커스/편집 초안은 이번 캐시에 넣거나 변경하지 않는다. Provider 추가만으로 기존 화면에서 GET이 발생하지 않는다. 신규 Hook은 아직 UI에 연결하지 않았다.

직접 읽은 계약: FolderController, NoteController, 두 도메인의 모든 요청/응답 DTO, common ErrorResponse/FieldErrorResponse, application.yml. 프론트엔드 main/AppLayout/folderModel/useFolders/notes, tsconfig, package.json, Vite/ESLint/기존 테스트 설정도 확인했다.

### 실제 백엔드 경로

| 컨트롤러 | 실제 경로 | 이번 함수 구현 |
| --- | --- | --- |
| Folder | GET /api/folders (생략/root는 root, UUID는 직접 자식) | root 조회만 이 경로 사용 |
| Folder | GET /api/folders/{id} | 구현 |
| Folder | GET /api/folders/{id}/children | 직접 자식 조회 구현 |
| Folder | GET /api/folders/{id}/notes | 원고 요약 조회 구현 |
| Folder | POST /api/folders, PATCH /api/folders/{id}, PATCH /api/folders/{id}/move, DELETE /api/folders/{id} | 함수·mutation 미구현 |
| Note | GET /api/notes/{id} | 상세 조회 구현 |
| Note | GET /api/notes | 기존 본문 포함 전체 목록. 이번에 사용하지 않음 |
| Note | POST /api/notes, PUT/PATCH /api/notes/{id}, PATCH /api/notes/{id}/move, DELETE /api/notes/{id} | 함수·mutation 미구현 |

## 2. 생성·수정 파일

| 파일 | 작업과 책임 |
| --- | --- |
| frontend/src/lib/api/types.ts | 서버 도메인/요청/오류 타입을 단일 정의 |
| frontend/src/lib/api/client.ts | GET fetch, ApiError, 공통 오류·취소 처리 |
| frontend/src/features/folders/folderApi.ts | Folder 조회 함수 3개 |
| frontend/src/features/notes/noteApi.ts | Note 조회 함수 2개 |
| frontend/src/lib/query/queryKeys.ts | 서버 캐시 키와 invalidation prefix |
| frontend/src/lib/query/queryClient.ts | SPA 단일 QueryClient와 stale/retry 기본 정책 |
| frontend/src/features/folders/folderQueries.ts | queryOptions 팩토리와 Folder Hook 3개 |
| frontend/src/features/notes/noteQueries.ts | queryOptions 팩토리와 Note Hook 2개 |
| frontend/src/main.tsx | 기존 Emotion/앱을 QueryClientProvider로 감쌈 |
| frontend/vite.config.ts | 기존 plugin/alias를 유지하면서 /api 개발 프록시 추가 |
| frontend/tests/apiFoundation.test.mjs | 실제 TS 모듈의 HTTP/오류/서버 캐시/취소 검증 12개 |
| docs/design/frontend-api-foundation.md | 현재 문서: 계약·사용 경계·검증·인계 |
| docs/troubleshooting/2026-10-25-frontend-api-foundation.md | 문제 근거·개선·검증·남은 위험 |
| docs/troubleshooting/README.md | 신규 문제 목록 추가 |
| docs/worklogs/2026-10-25-frontend-api-foundation.md | 실제 작업 순서와 파일별 변경 이력 |

## 3. API 함수와 오류 처리

| 함수 | 반환 타입 | 실제 GET 경로 |
| --- | --- | --- |
| getRootFolders(options?) | Promise<Folder[]> | /api/folders?parentId=root |
| getChildFolders(parentId, options?) | Promise<Folder[]> | /api/folders/{id}/children |
| getFolder(id, options?) | Promise<Folder> | /api/folders/{id} |
| getFolderNoteSummaries(folderId, options?) | Promise<NoteSummary[]> | /api/folders/{id}/notes |
| getNote(id, options?) | Promise<Note> | /api/notes/{id} |

options는 RequestOptions `{signal?: AbortSignal}`다. ID는 URL segment로 encode한다. GET 전용이며 요청 body나 데이터 쓰기를 수행하지 않는다.

HTTP 실패는 ApiError로 reject한다. `status`, 서버 `code/message/errors`, 원본 `responseBody`를 보존한다. JSON이 아닌 proxy 오류는 HTTP_ERROR와 읽을 수 있는 상태 메시지, 연결/본문 전송 실패는 NETWORK_ERROR/status 0, JSON이 아닌 성공이나 null/primitive 성공은 INVALID_RESPONSE다. AbortError/Signal 취소는 API 오류로 바꾸지 않는다. 성공 JSON의 모든 DTO 필드를 runtime schema로 검증하는 라이브러리는 추가하지 않았고 TypeScript 응답 타입으로 다룬다.

## 4. TypeScript 타입과 계약

- UUID/Instant: string alias. 날짜를 Date로 변환하거나 표시용 문자열로 바꾸지 않는다.
- Folder: id, nullable parentId, name, sortOrder, version, createdAt, updatedAt.
- Note: id, folderId, title, content, sortOrder, version, createdAt, updatedAt.
- NoteSummary: Note에서 id/folderId/title/sortOrder/version/updatedAt만 Pick. content/createdAt 없음.
- CreateFolderRequest: id?/parentId?는 null 허용, name 필수.
- UpdateFolderRequest: name 필수.
- MoveFolderRequest: targetParentId 필수 property, null은 root 이동. 생략과 구분.
- CreateNoteRequest: id?는 null 허용, folderId/title/content 필수.
- UpdateNoteRequest: title/content/expectedVersion 모두 필수. 빈 제목·본문 허용, 제목 최대 200자, expectedVersion은 서버가 검증하는 0 이상 정수.
- MoveNoteRequest: targetFolderId 필수.
- ApiFieldError: field/message. ApiErrorResponse: code/message/errors 배열.
- RequestOptions와 ApiError 클래스는 client.ts에서 내보낸다.

요청 타입은 향후 mutation용 계약만 제공하며 이번에 생성/수정/이동 기능을 구현하지 않았다. name 비공백/최대 200자와 숫자 범위 같은 runtime 검증은 서버 계약이며 TypeScript가 문자열 길이나 음수를 차단하지는 않는다. Java Long 필드는 현재 JSON number 계약에 따라 number로 표현했다. Number.MAX_SAFE_INTEGER를 넘는 정밀도가 필요하면 백엔드와 문자열 숫자 계약을 함께 결정해야 한다.

## 5. Query Key·Hook 설계

| 데이터 | Query Key | Hook |
| --- | --- | --- |
| root Folder | ['folders', 'roots'] | useRootFoldersQuery() |
| 직접 자식 Folder | ['folders', 'children', parentId] | useChildFoldersQuery(parentId) |
| Folder 상세 | ['folders', 'detail', id] | useFolderQuery(id) |
| 폴더 원고 요약 | ['notes', 'list', 'folder', folderId] | useFolderNotesQuery(folderId) |
| 원고 상세 | ['notes', 'detail', id] | useNoteQuery(id) |

folderKeys.all은 ['folders'], noteKeys.all은 ['notes'], noteKeys.lists()는 ['notes','list']다. 미래 mutation에서는 영향을 받은 부모 목록·요약·상세를 선택적으로 invalidate해야 한다. 이번에는 mutation/invalidation 동작을 UI에 붙이지 않았다.

Hook은 queryOptions 팩토리(folderQueries/noteQueries)를 공유한다. ID가 null/undefined/빈 문자열이면 skipToken을 사용해 요청하지 않는다. null 자식 Hook이 root 조회를 뜻하지 않으며 root 전용 Hook을 사용해야 한다. 비활성 Query는 isPending일 수 있으므로 선택 전 로딩 UI를 만들 때 isLoading/fetchStatus와 선택 상태를 구분해야 한다. skipToken 상태에서는 ID를 제공하기 전 수동 refetch로 요청을 활성화할 수 없다.

QueryClient는 렌더 밖에서 한 번 생성한다. staleTime 30초. NETWORK_ERROR/5xx만 최대 한 번 재시도하며 4xx/409/INVALID_RESPONSE는 재시도하지 않는다. Query signal을 실제 fetch에 전달해 오래된 조회를 취소한다. 같은 ID의 새 서버 조회가 완료되어도 사용자의 편집 초안에 자동 반영하는 기능은 만들지 않았다.

## 6. 개발 환경과 검증

브라우저는 상대 /api로 요청하고 Vite dev server가 http://127.0.0.1:18765로 전달한다. backend application.yml의 실제 포트와 일치하며 경로 rewrite는 없다. 개발 중 backend CORS를 추가할 필요가 없다. API 서버를 import/build 단계에 호출하지 않는다. 운영에는 동일 origin의 /api reverse proxy가 별도로 필요하다.

실행 결과:

- pnpm build: tsc -b 및 Vite production build 성공, 타입 오류 없음. 빌드는 API 상태를 조회하지 않는다.
- pnpm lint: 성공.
- pnpm test: 기존 모델 테스트 13 + API 기반 테스트 12 = 25개, 실패/스킵 0.
- 새 테스트는 실제 TS 모듈을 기존 TypeScript로 임시 디렉터리에 변환하고 fetch를 mock해 실행한다. 요청 경로/GET, 서버 오류 보존, proxy/성공 형식 오류, 연결 및 본문 오류, signal/취소, 키별 캐시 분리, fresh cache 재사용, ID 없는 Query 대기, retry 정책을 검증한다. 임시 테스트 파일은 정리한다.
- 실행 중인 backend에 root GET 200 확인 후, 임시 Vite port 25173을 통해 GET 5종을 확인했다. root 200(1개), 직접 자식 200(0개), Folder 상세 200, 원고 요약 200(4개), Note 상세 200. 응답 필드 집합이 실제 DTO와 일치했다. 제목·본문·ID는 보고서/로그에 출력하지 않았다.
- 실제 HTTP 검증은 모두 GET이었다. 공유 DB 쓰기, 백엔드 시작/재시작, Flyway 적용은 수행하지 않았다. 실제 400/404/409 오류는 mock 테스트에서 검증했고 브라우저 UI E2E/운영 배포/성능은 미검증이다.
- 변경 후 앱 전체를 TypeScript 빌드했으며, 백엔드가 중지된 상태를 만들기 위해 기존 서버를 임의 종료하지 않았다. 빌드 무연결 동작은 조회 모듈/Provider가 import 시 요청하지 않는 구조와 mock 연결 실패 테스트로 확인했다.

## 7. 사용자가 직접 구현할 컴포넌트·상태

1. FolderTree/Sidebar가 root·자식 Hook을 소비하는 시점, 펼침 상태, 트리 데이터 구성 및 Folder → FolderItem view mapping.
2. 선택한 Folder/Note ID, 탐색 경로, 검색, 포커스 이동 및 모바일 패널 전환 정책.
3. 원고 요약 목록 표시와 선택한 Note 상세 조회, 로딩/오류/빈 목록 UI.
4. 서버 Note와 별도의 편집 초안/dirty 상태. Query refetch가 입력 중인 원고를 덮어쓰지 않도록 동작 정의.
5. 추후 생성/이동/삭제 mutation, 정렬, 캐시 무효화, 자동 저장, expectedVersion 전달과 409 비교·병합 UX.

현재 더미 데이터의 'my-notes', 'little-things' 등은 UUID가 아니므로 그대로 Hook ID로 전달하면 서버가 400을 반환한다. 실제 API 데이터로 화면을 전환하는 단계에서 유효한 ID만 사용해야 한다. 서버의 빈 title은 UI에서 표시용 이름을 붙이고 원본 값은 보존해야 한다. 요약 응답을 상세 Note인 것처럼 에디터에 전달하면 안 된다.

## 8. 기록

[트러블슈팅](../troubleshooting/2026-10-25-frontend-api-foundation.md), [상세 작업 이력](../worklogs/2026-10-25-frontend-api-foundation.md)에 발견 근거와 수행 순서를 기록했다. UI 디자인·더미 데이터·기존 useFolders·백엔드 엔티티/API는 이번 작업에서 변경하지 않았다.
