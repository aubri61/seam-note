# Axios·전체 메타데이터 조회·읽기 전용 집필 화면

> 원고 편집 후속 단계: 현재 제목·본문은 React 메모리 Draft로 편집한다. 아래 읽기 전용 설명은 이 문서 작성 단계의 동작이다. 현재 상태·재조회·이탈 규칙은 [React 원고 Draft](note-drafts.md)를 따른다.

> 이 문서는 조회 UI 단계 기록이다. 후속 [생성·삭제 연결](create-delete-ui.md)에서 Folder/빈 Note 생성과 Note 삭제를 추가했다. 본문은 계속 읽기 전용이다.

## 1. 범위와 기존 구조 분석

이전 조회 API 기반 작업의 미커밋 변경을 유지하며 이어서 구현했다. 기존 UI는 useFolders의 샘플 배열과 수정·드래그·이름 변경 콜백을 사용했다. FolderTree는 이미 React Arborist를 쓰고 있었으며 별도로 설치하지 않았다. 서버는 Folder/Note 분리, LAZY 관계, sortOrder/version과 내용 수정 expectedVersion 계약을 제공하고 있었다.

이번에는 실제 목록·본문 조회와 선택만 구현한다. 기존 테마·280px 사이드바·반응형 Drawer·에디터 여백과 툴바를 유지한다. 추가 버튼은 비활성 상태로 남기고 제목·본문은 readOnly다. 실제 저장 없는 성공/저장중 배지는 '읽기 전용'으로 바꿨다.

## 2. Axios 전환

pnpm add axios로 axios 1.20.0을 설치하고 frontend package.json/lockfile에 기록했다. lib/api/client.ts의 apiClient는 baseURL /api, Accept application/json인 단일 Axios 인스턴스다. getJson<T> 이름을 유지해 기존 folderApi/noteApi와 Query Hook의 외부 계약을 재사용한다. 반환은 Axios response.data다. fetch 구현이나 병렬 HTTP 클라이언트, 불필요한 interceptor는 남기지 않았다. Vite /api proxy와 backend port 18765는 유지했다.

- signal을 Query → API 함수 → apiClient.get까지 전달한다.
- HTTP 실패는 기존 ApiError(status/code/message/errors/responseBody/cause)로 변환한다. 서버 code/message/errors를 보존한다.
- 응답 없는 Axios 네트워크/전송 실패는 NETWORK_ERROR/status 0, 비표준 HTTP 오류는 HTTP_ERROR다.
- Axios CanceledError는 ApiError로 바꾸지 않는다. Query는 오래된 요청을 취소할 수 있다.
- JSON 객체/배열이 아닌 성공 응답은 INVALID_RESPONSE다. 전체 DTO runtime schema validation 라이브러리는 추가하지 않았다.

## 3. 통합 조회 API 계약

`GET /api/workspace/tree` → HTTP 200, WorkspaceTreeResponse.

```json
{
  "folders": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "parentId": null,
      "name": "소설 A",
      "sortOrder": 0,
      "version": 0,
      "createdAt": "2026-10-25T00:00:00Z",
      "updatedAt": "2026-10-25T00:00:00Z"
    }
  ],
  "notes": [
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "folderId": "00000000-0000-4000-8000-000000000001",
      "title": "1화",
      "sortOrder": 0,
      "version": 0,
      "updatedAt": "2026-10-25T00:00:00Z"
    }
  ]
}
```

위 JSON은 계약 설명용 합성 예시다. 빈 공간은 `{ "folders": [], "notes": [] }`. folders는 기존 FolderResponse, notes는 기존 NoteSummaryResponse를 재사용한다. **content는 응답에도 SELECT에도 없다.** 기존 전체 Note GET은 호환성을 위해 유지하며 이 화면에서는 사용하지 않는다.

FolderResponse에는 projection용 생성자만 추가했다. FolderRepository.workspaceFolders와 NoteRepository.workspaceSummaries가 엔티티/연관관계를 로드하지 않고 DTO constructor projection으로 읽는다. WorkspaceService는 readOnly + REPEATABLE_READ 트랜잭션으로 두 배열을 같은 스냅샷에서 가져온다. 기본 READ_COMMITTED의 두 조회 사이에 이동/삭제가 들어와 관계가 어긋나는 가능성을 줄이기 위한 선택이다. 쓰기 잠금은 사용하지 않는다.

현재는 사용자/Workspace 필터가 없는 **전역 조회**다. 향후 인증 컨텍스트를 WorkspaceService 경계에서 확인하고 두 projection 모두 동일한 owner/workspace 조건을 넣어야 한다. 이 경고를 인증이 구현된 것으로 해석하면 안 된다. 새 엔티티·컬럼·마이그레이션을 추가하지 않았고 기존 CRUD/조회 endpoint를 변경하지 않았다.

## 4. Query 캐시와 데이터 흐름

- metadata: workspaceKeys.tree() = ['workspace', 'tree']; getWorkspaceTree/workspaceTreeQuery/useWorkspaceTreeQuery.
- detail: 기존 noteKeys.detail(id) = ['notes', 'detail', id], useNoteQuery 재사용.
- useFolders 한 곳에서 metadata Hook을 소비하고 Sidebar에 결과를 전달한다. 펼침/접기·검색은 로컬 변환만 수행하며 자식 API를 호출하지 않는다.
- metadata staleTime Infinity, focus/reconnect refetch 비활성. 앱 생명주기의 논리적 첫 로드에 캐시를 재사용한다. 오류 자동 재시도는 기존 QueryClient 정책(네트워크/5xx 한 번)을 따르며 수동 재시도가 가능하다.
- React 개발 StrictMode의 mount→cleanup→mount에서는 signal 취소 후 재요청이 보일 수 있다. 이는 별도의 컴포넌트별 캐시나 lazy loading을 만든 것이 아니다. HTTP 요청 횟수를 무조건 한 번으로 보장하는 계약은 아니다.
- 현재 읽기 전용 화면의 메타데이터는 자동 갱신하지 않으므로 다른 클라이언트 변경을 반영하려면 페이지 재진입/새로고침 또는 향후 명시적 invalidate/refresh 정책이 필요하다. 노트 상세는 기존 30초 stale 캐시 정책을 따른다.

## 5. 트리 구조와 방어 정책

WorkspaceTreeResponse의 배열/DTO는 변경하지 않는다. buildWorkspaceTree는 view wrapper를 새로 만든다.

- WorkspaceFolderNode: kind folder, 원본 Folder, children.
- WorkspaceNoteNode: kind note, 원본 NoteSummary. children 없음.
- key는 folder:{id}/note:{id}로 분리한다. 서버 Folder와 Note의 ID 공간이 별개여서 같은 UUID라도 UI key는 충돌하지 않는다.
- 형제 정렬: Folder 먼저 → 각 유형 sortOrder → id 문자열 비교. locale에 의존하지 않는 안정적 보조 정렬이다.
- 부모 누락 Folder는 view에서 root로 승격, 순환은 cycle 중 최소 ID의 부모 연결 하나를 view에서 끊는다. 서버 DTO/DB는 변경하지 않는다.
- 없는 Folder에 속한 Note는 잘못된 root 원고를 만들지 않고 표시에서 제외한다. 중복 ID는 같은 유형에서 첫 항목만 사용한다. 관계 보정/제외가 있으면 경고를 표시한다.
- 생성·순환 검사·첫 원고 탐색·조상·표시 행은 반복문이다. 5,000단 중첩 테스트에서 호출 스택 오류 없이 동작했다. 실제 대규모 UI 렌더 성능 측정은 별도다.
- 검색은 불러온 Folder 이름/Note 제목만 대상으로 하고 일치 항목과 조상을 표시한다. 원고 본문 검색이나 추가 API 요청은 하지 않는다.

기존 folderModel의 FolderItem/로컬 이동 유틸리티와 모델 테스트는 보존했다. 실제 UI의 useFolders 샘플 초기값/생성·수정·이동은 제거했고 서버 DTO view를 사용한다. 미연결 NoteList/notes.ts의 예전 카드 샘플은 실행 경로 밖에 남아 있으며 이 화면에 표시하지 않는다.

## 6. 최초 선택 기준과 폴더 펼침

정렬된 전체 트리를 깊이 우선 preorder로 순회해 처음 만난 Note를 선택한다. DB 생성 순서나 notes 배열 첫 요소를 사용하지 않는다. 폴더 우선이므로 부모의 직접 Note보다 하위 Folder 안의 Note를 먼저 방문할 수 있다. 선택 노트의 조상을 자동으로 펼치고 title/content를 별도 상세 GET으로 읽는다.

명시적으로 선택한 노트가 있으면 유지하고, 메타데이터에서 그 노트가 사라졌다면 첫 원고로 fallback한다. 노트가 없으면 선택은 null이다. 마지막 편집 노트 복원/로컬 영속 선택은 구현하지 않았다.

폴더 클릭은 펼침/접기이고 노트 클릭과 구분한다. 펼침 상태는 별도 React 상태다. 브라우저 테스트에서 노트 변경 시 초기 자동 펼침 상태가 사라지는 문제를 발견해 새 노트를 선택할 때 현재 펼침 상태와 새 조상을 함께 보존하도록 수정했다. 데스크톱은 최초 사이드바를 열고, 모바일은 기존 Drawer 열기/선택 후 닫기를 사용한다.

## 7. 노트 클릭과 늦은 응답 방지

클릭 → requestedNoteId → 선택 ID별 useNoteQuery → Axios(signal) → NoteResponse → 읽기 전용 에디터.

상세 응답을 useEffect로 공용 원고 state에 복사하지 않는다. Query Key가 ID별 캐시를 분리하며 placeholderData로 이전 내용을 유지하지 않는다. selectedNoteDetail과 NoteEditor에서 응답 id가 선택 id와 같은지 재확인한다. A가 늦게 완료되어도 B 화면으로 전달되지 않는다. 새 노트 로딩 중에는 이전 제목/본문을 비우고 로딩 상태를 표시한다. 유효한 캐시가 있으면 해당 ID의 내용은 즉시 표시할 수 있다.

## 8. 로딩·오류·빈 상태·접근성

- metadata loading/error/retry를 Sidebar에 표시한다. 상세 오류가 나도 트리는 유지해 다른 원고를 선택할 수 있다.
- 첫 상세가 404여도 다른 원고 선택으로 복구 가능하다. 첫 원고 대신 임의의 다른 원고를 자동 재선택하지 않는다.
- Folder 없음, Folder만 존재, 노트 없음, 검색 결과 없음은 별도 빈 상태다.
- 네이티브 button에 tree/treeitem·aria-level·roving tab stop을 제공한다. Tab/Enter/Space 활성화 및 ArrowUp/Down/Left/Right/Home/End 탐색, 폴더 aria-expanded, 현재 노트 aria-current/aria-selected, 로딩 role=status/aria-busy, 오류 role=alert를 제공한다. 드래그/이름 변경 키 조합은 연결하지 않는다.
- 읽기 전용 제목/본문, 비활성 생성 버튼, '읽기 전용' 배지/안내를 제공한다. 가짜 저장 완료/로컬 저장 중 표시는 제거했다.

## 9. 테스트·빌드·실제 GET 결과

- frontend: pnpm build(tsc 포함), pnpm lint, pnpm test 통과. 총 34개 = Axios/Query 13 + 기존 모델 13 + 새 트리 8, 실패·스킵 0.
- backend: 격리 PostgreSQL 17의 전용 DB에서 test bootJar --offline 성공. 총 15개 = 기존 13 + Workspace 2, 실패·오류·스킵 0. Workspace 테스트는 매 JVM 새 schema를 만들어 반복 실행해도 기존 데이터와 섞이지 않는다.
- 통합 API 테스트는 빈 응답, 전체 DB ID 집합과 일치, 중첩 FK 관계, 원고 필드 정확성, content 미포함을 검증했다. Hibernate Statistics로 **준비한 SQL 정확히 2개**를 확인했다. 쿼리 지연 수치는 측정하지 않았다.
- Axios 테스트는 실제 Axios 인스턴스의 adapter를 대체해 경로/baseURL/GET, HTTP·network·cancel, 오류 계약과 cache를 검증한다. 실제 브라우저에서도 Axios 요청을 사용했다.
- 설치된 Chrome + 기존 제공 Playwright 런타임으로 합성 GET 응답의 최초 정렬 선택, 조상 펼침, 접기/펼치기 무요청, readOnly, 빠른 A→B와 늦은 A, 캐시 재선택, 첫 상세 오류 후 다른 선택, 빈/폴더만 존재, 목록 오류 재시도, 모바일 Drawer 전환을 확인했다.
- 개발 backend의 실제 GET /api/workspace/tree는 200, Folder 1개/NoteSummary 4개/content 제외였다. Vite proxy를 통한 실제 화면에서도 선택 ID와 제목·본문이 GET /api/notes/{id}와 일치했다. 실제 데이터의 ID/제목/본문을 로그·스크린샷에 남기지 않았다. UI 검증 스크린샷은 합성 데이터만 사용했다.
- 기존 개발 DB에는 GET만 보냈다. 실제 서버/DB를 재시작하거나 데이터를 생성·수정·삭제하지 않았다. 이번 일회용 PostgreSQL 컨테이너를 제거하고 임시 Vite만 종료했다.

브라우저 검증 스크립트는 frontend/tests/browser/workspaceReadonly.cjs다. 앱에 Playwright를 설치하지 않았다. 기존 런타임을 지정해 실행한다.

```sh
# frontend에서 Vite 실행: pnpm exec vite --host 127.0.0.1 --port 25173 --strictPort
# 저장소 루트에서(기존 Playwright 런타임 경로 지정)
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceReadonly.cjs
# 실행 중인 backend의 실제 GET 검증도 포함하려면 SEAM_NOTE_LIVE_GET=1 추가
```

## 10. 미구현 기능과 다음 단계

저장/expectedVersion mutation, 생성·삭제·이동·정렬·DnD, IndexedDB/Dexie/Outbox, 멱등키, 충돌 해결, 인증, 마지막 편집 복원, DB 마이그레이션은 추가하지 않았다. 다음 단계에서는 인증된 workspace 필터, 명시적 메타데이터 refresh, 편집 draft 분리와 저장 충돌 UX를 결정해야 한다. 큰 데이터에서는 메타데이터 pagination/변경분 동기화와 가상화 전략을 검토해야 한다.

## 11. 선택 이유와 트레이드오프

- 두 배열 snapshot: 서버 트리 재귀와 N+1을 피하고 UI 정렬을 순수 함수로 테스트하기 쉽다. 대신 초기 전체 메타데이터 크기가 데이터량에 비례한다.
- projection + REPEATABLE_READ: 원고 본문과 엔티티 로딩을 피하고 배열 간 스냅샷을 맞춘다. 긴 대량 조회는 DB snapshot 유지 비용이 있으므로 페이지/동기화 확장 필요.
- native flat rows: 기존 색상/40px 행/20px 들여쓰기/스크롤 영역은 재사용하면서 편집·DnD 동작을 확실히 제거했다. 기존 Arborist 의존성은 삭제/재설치하지 않았지만 활성 화면은 사용하지 않는다. 대신 가상화는 없어 대량 표시 성능은 후속 측정 대상이다.
- metadata Infinity: 이번 단일 진입 조회에는 중복/펼침 요청이 없다. 원격 변경 실시간 반영은 제공하지 않는다.
- ID별 Query + 표시 guard: 늦은 응답 경쟁과 잘못된 내용 표시를 방지하며 공용 편집 상태를 도입하지 않는다.

## 변경 파일 및 작업 순서

파일별 생성/수정 내용, 실행 오류·수정과 실제 검증 순서는 [작업 이력](../worklogs/2026-10-25-axios-workspace-ui.md)에 기록했다. 문제 근거와 남은 위험은 [트러블슈팅](../troubleshooting/2026-10-25-workspace-readonly-ui.md)을 참조한다.
