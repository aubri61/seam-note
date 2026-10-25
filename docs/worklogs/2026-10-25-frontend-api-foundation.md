# 2026-10-25 — 프론트엔드 조회 API 기반 작업 이력

## 범위와 커밋 경계

사용자 요청: 기존 작업을 먼저 커밋하고, 프론트엔드 타입·GET 함수·TanStack Query 기반까지만 구현한다. UI 상호작용과 핵심 상태 관리는 사용자가 구현한다.

기존 변경은 `08865b3`으로 커밋했다. 백엔드 개편·테스트·문서·AGENTS.md와 기존 미추적 문제 기록을 포함한 34개 파일이었다. 커밋 직후 git 상태가 깨끗한 것을 확인했다. 아래 변경은 이 커밋 이후의 별도 작업이며 아직 커밋하지 않았다. push/배포는 하지 않았다.

## 실제 수행 순서

1. git 상태/diff 공백 검사/최근 커밋을 확인하고, frontend package/main/Vite/파일 구조를 읽었다. 사용자 지시에 따라 기존 AGENTS.md/backend/src/main/backend/src/test/docs를 stage하고 위 커밋을 생성했다.
2. FolderController/NoteController와 Folder/Note의 모든 Request·Response DTO, 공통 ErrorResponse/FieldErrorResponse를 읽었다. Folder API 경로와 Note expectedVersion 포함 계약을 확인했다.
3. folderModel/useFolders/notes와 기존 테스트/tsconfig/ESLint/README를 읽고 React 상태 기반 샘플 UI임을 확인했다. Query Provider·fetch·CORS 검색으로 기존 설정 부재를 확인했다. application.yml의 18765 포트와 설치된 Query 패키지 선언도 확인했다. 의존성은 추가하지 않았다.
4. lib/api/types.ts → client.ts → Folder/Note API → Query Key/Client → Folder/Note Query options 및 Hook 순서로 생성했다. 실제 GET 경로만 구현했다.
5. main.tsx를 QueryClientProvider로 감싸고 Vite server.proxy에 /api를 추가했다. Emotion·@ alias·기존 앱은 유지했다.
6. 신규 프론트엔드 트러블슈팅 문서를 작성하고 README 목록에 개선 중 항목을 추가했다. 기존 샘플/UI 모델은 서버 DTO와 의미가 달라 그대로 남겼다.
7. 새 테스트를 쓰는 첫 명령은 작업 디렉터리가 frontend인데 경로를 frontend/tests로 중복 지정해 파일 생성에 실패했다. 이어진 build/lint/기존 13개 테스트는 성공했다. 이 시점에 신규 테스트가 통과했다고 간주하지 않았다.
8. 루트 기준 올바른 경로에 apiFoundation.test.mjs를 생성했다. 기존 TypeScript/Node test 도구만으로 실제 소스를 변환하고 fetch mock/QueryClient/QueryObserver로 HTTP 계약·취소·캐시·skip/retry를 검증했다. pnpm test로 당시 총 24개 통과했다.
9. 기존 백엔드의 root GET을 조회해 200과 DTO 필드를 확인했다. 실제 원고 값은 출력하지 않았다. 연결 중인 backend를 시작/종료하거나 DB 쓰기를 하지 않았다.
10. 자체 코드 검토에서 응답 본문 전송 실패가 fetch catch 바깥으로 빠질 수 있음을 확인했다. client.ts의 같은 try/catch 안에서 response.text까지 읽도록 보강했다. null/primitive 성공도 INVALID_RESPONSE로 처리했다. 본문 전송 실패 테스트를 추가하고 잘못된 성공 JSON 케이스를 확장했다.
11. 임시 Vite 서버를 127.0.0.1:25173으로 실행했다. 해당 /api proxy를 통해 실제 root/자식/Folder/원고 요약/Note 상세 GET 5종 모두 200을 확인했다. 응답 key 집합도 DTO와 비교했다. 데이터의 제목/본문/ID를 기록하지 않았다.
12. pnpm build && pnpm lint && pnpm test를 실행했다. tsc/Vite build, ESLint, 25개 테스트(기존 13/신규 12)가 모두 통과했다.
13. 설계·인계 문서와 이 작업 이력을 작성하고 트러블슈팅을 결과에 맞춰 갱신했다. 임시 Vite 서버(PID 68720, port 25173)만 종료했다. 파일 목록/문서 링크/git diff --check와 Java DTO getter/setter 대비 TS 필드 목록을 확인했다. 기존 backend는 그대로 유지했다.

## 파일별 변경 내용

파일 목록 15개와 책임은 [설계 문서 2절](../design/frontend-api-foundation.md)에 정리했다. 구현 묶음에서의 핵심 변경은 다음과 같다.

- types.ts: 서버 DTO의 string UUID/Instant, nullable parentId, version/order, 필수 expectedVersion, 오류 배열 정의. NoteSummary는 Note에서 Pick해 중복 정의 방지.
- client.ts: GET만 지원, 서버 code/message/errors 및 status/원문 보존, proxy/network/취소/비정상 성공 구분. 본문 전송 실패까지 보강.
- folderApi.ts/noteApi.ts: 실제 컨트롤러 경로 5개, signal 전달, URL ID encode.
- queryKeys.ts: 폴더 root/자식/상세와 원고 요약/상세 캐시 분리, 넓은 무효화 prefix 제공.
- queryClient.ts: SPA에서 안정적인 단일 인스턴스, stale 30초, 일시 오류만 재시도 1회.
- folderQueries.ts/noteQueries.ts: 재사용 가능한 queryOptions와 Hook 각 3/2개, ID 미지정 skipToken과 fetch signal 연계. UI 상태 없음.
- main.tsx: 기존 앱/테마 바깥 Provider 추가. JSX 화면/스타일 변경 없음.
- vite.config.ts: 기존 alias/plugin 유지, 실제 backend port로 개발 /api proxy.
- apiFoundation.test.mjs: 계약·오류·취소·캐시의 새 테스트 12개. 테스트 임시 디렉터리는 종료 시 제거.
- 설계/트러블슈팅/README/작업 이력: 현재 계약, 발견 근거, 검증 명령/결과, UI 구현 인계 및 실제 순서 기록.

## 변경하지 않은 범위와 검증 한계

기존 UI·더미 데이터·folderModel/useFolders/NoteEditor/AppLayout, package.json/lockfile, backend 전체는 이 커밋 이후 수정하지 않았다. 새 문서 생성/선택/자동 저장/mutation/IndexedDB/Outbox/동기화는 구현하지 않았다. 실제 서버 검증은 GET만 수행했다. 오류 응답 400/404/409 및 연결 실패는 mock 테스트로 확인했다. 브라우저 E2E·운영 reverse proxy·성능 지표는 미검증이다.

최종 결과와 주의사항은 [설계 및 인계](../design/frontend-api-foundation.md), [트러블슈팅](../troubleshooting/2026-10-25-frontend-api-foundation.md) 참조.
