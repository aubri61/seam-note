# React 원고 Draft

## 범위와 상태 소유

서버 원고와 독립적인 제목·본문 편집을 React 메모리 상태로 제공한다. 새 패키지나 전역 상태 라이브러리를 추가하지 않았다. 백엔드/DTO/Query 정책/API 함수/기존 생성·삭제 Mutation은 변경하지 않았다. Note 저장 PUT/PATCH, 자동 저장, IndexedDB/localStorage/sessionStorage, Outbox/오프라인 실행/자동 병합은 없다.

| 구성 요소 | 책임 |
| --- | --- |
| useFolders / useNoteQuery | 기존 트리 선택·생성 성공 자동 선택·서버 상세 조회 |
| AppLayout | 선택 ID와 ID 검증된 서버 Note를 useNoteDrafts에 전달. Draft/입력 콜백/조회 상태를 자식에 전달 |
| useNoteDrafts | AppLayout 수명 동안 노트 ID별 Draft 보유, 응답 조정, 함수형 입력 갱신, 전체 dirty에 따른 이탈 listener 등록·정리 |
| noteDrafts.ts | 독립 Draft 모델, 서버 수신/입력 갱신/dirty/상태 결정의 순수 함수 |
| draftNavigation.ts | beforeunload 연결·해제. 저장이나 라우팅 제어는 하지 않음 |
| NoteEditor | 선택 ID에 맞는 Draft만 표시하고 제목·본문 입력을 noteId와 함께 전달. Query 객체를 수정하지 않음 |
| AppHeader / SyncStatus | 현재 원고의 편집·조회 상태 표시. 저장/동기화 성공을 주장하지 않음 |
| Sidebar | 기존 트리·+ 메뉴 유지. 원고 편집이 메모리 상태임을 안내 |

Draft를 NoteEditor 내부가 아닌 AppLayout의 Hook에 두므로 A→B→A 전환, 모바일 Drawer 개폐, 반응형 레이아웃 변경으로 편집 내용이 초기화되지 않는다. TanStack Query는 서버 캐시로 그대로 유지한다. 사이드바 제목/검색은 기존 서버 메타데이터 기준이며 미저장 제목을 서버 캐시나 트리에 덮어쓰지 않는다.

## 모델

```ts
interface NoteDraft {
  noteId: string
  title: string
  content: string
  baseVersion: number
  baseTitle: string
  baseContent: string
  latestServerVersion: number
}
```

- noteId로 독립 관리한다. 서버 Note 객체와 다른 새 객체로 생성한다.
- baseVersion은 title/content를 처음 기준 삼았거나 clean 상태에서 채택한 서버 Note.version이다. 입력할 때 올리지 않는다. 추후 저장을 구현한다면 expectedVersion의 출처다.
- baseTitle/baseContent는 해당 기준 서버 내용이다. dirty는 현재 title/content와 기준 문자열을 정확히 비교한다. 공백을 trim하지 않는다. 둘 다 원래 내용으로 되돌리면 false다.
- latestServerVersion은 이 Draft에서 관측한 가장 높은 응답 버전이다. dirty 상태에서 더 높은 버전을 봐도 baseVersion과 작성 내용은 유지한다. 이는 충돌 해결/병합 완료의 의미가 아니다.
- 제목은 HTML maxLength=200과 모델 경계에서 최대 200 UTF-16 단위(Java String/HTML 길이 기준)를 제한한다. 201자 입력 갱신은 거부한다. 제목·본문 빈 문자열은 허용하며 placeholder `제목 없음`은 Draft나 API 데이터에 저장하지 않는다.

## 최초 생성·재조회 규칙

| 수신 조건 | 처리 |
| --- | --- |
| 선택 ID와 응답 ID 불일치 | Hook에 채택하지 않음. useFolders의 기존 ID guard와 NoteEditor guard도 유지 |
| 해당 ID Draft 없음 | 상세 응답 title/content/version으로 clean Draft 생성 |
| dirty Draft 있음 | 작성 내용과 기준 3개 필드 유지. 관측한 더 높은 버전만 기록 |
| clean이고 응답 version > baseVersion, version >= latestServerVersion | 새로운 서버 title/content와 version을 기준으로 갱신 |
| 더 낮은 버전/동일 기준 버전의 응답 | 내용과 기준을 유지. 동일 버전인데 내용이 다른 모순된 응답도 채택하지 않음 |

Query는 staleTime 30초 및 기존 focus/reconnect 정책을 유지한다. Hook은 ID 검증된 Query snapshot 참조가 바뀔 때 현재 컴포넌트의 React 상태를 조건부 조정해, 자식이 이전 노트/빈 Draft를 한 프레임 표시하지 않게 한다. 입력은 항상 함수형 updater로 최신 Draft에 적용한다. 서버 수신 함수도 현재 Draft의 dirty를 검사하므로 요청 시작 후 입력한 내용도 응답으로 덮어쓰지 않는다.

dirty 상태에서 서버 v5를 보았다면 기준은 예를 들어 v2로 유지한다. 내용을 원래 v2로 되돌려 clean이 되어도 곧바로 원격 내용으로 바꾸지 않는다. 이후 다시 관측하는 안전한 v5 이상 snapshot만 채택한다. 늦게 온 v3 응답은 거부한다. 최신 서버 데이터와 충돌하는 dirty Draft의 저장/비교/선택 UX는 추후 범위이며 이번에는 자동 덮어쓰기/병합/기준 버전 상승을 하지 않는다.

기존 빈 Note 생성은 실제 POST 상세 응답을 Query에 seed하고 선택한다. 이 경로가 같은 Hook을 거쳐 title/content="", baseVersion=서버 응답 version(통상 0)의 clean Draft를 만든다. 별도 가짜 초안/노트를 생성하지 않는다.

## 화면 상태

네 가지 상태만 배지에 표시한다.

- 변경사항 없음
- 저장되지 않은 변경사항
- 원고 로딩 중
- 원고 조회 실패

조회 실패가 우선이고, 그다음 조회 진행, 그다음 dirty 여부다. 배경 재조회 중/실패라도 기존 Draft가 있으면 입력을 유지하고 계속 편집할 수 있다. 아직 Draft가 없는 로딩/실패/빈 상태에서는 입력을 읽기 전용으로 둬 다른 원고 내용을 쓰지 않는다. 제목/본문 여백·글꼴·Emotion 스타일·툴바·기존 FAB와 반응형 탐색을 유지한다.

## 이탈과 현재 한계

어느 노트든 dirty Draft가 하나 이상 있으면 beforeunload handler를 등록하고 preventDefault/returnValue로 브라우저의 기본 경고를 요청한다. 모든 변경을 원래대로 되돌리면 listener를 해제하고, 컴포넌트 언마운트에도 정리한다. 선택하지 않은 원고의 dirty도 포함한다.

내용은 현재 브라우저 메모리에만 있다. 페이지 새로고침, 탭 종료, AppLayout 언마운트, 브라우저/프로세스 강제 종료 시 소실된다. beforeunload는 저장이 아니며 사용자 상호작용 여부/브라우저 정책/모바일 종료 방식에 따라 경고를 표시하지 않을 수 있다. 문구를 임의 지정하거나 항상 경고한다고 보장하지 않는다.

기존 물리 삭제 동작은 이번에 변경하지 않았다. Draft 자동 삭제/폐기/복구 기능도 추가하지 않았다. React 상태에 남은 dirty Draft는 선택 목록에서 사라져도 이탈 경고 대상에 포함될 수 있다. 향후 삭제와 Draft 수명 정책을 별도로 정해야 한다. dirty를 자동으로 지워 데이터 손실을 숨기지 않는다.

## 추후 확장 지점

- noteDrafts.ts의 모델과 순수 전이 함수는 Query/React/HTTP 의존성이 없어 IndexedDB 레코드 직렬화/복구 경계에 연결할 수 있다. 실제 스키마/마이그레이션/저장은 이번에 구현하지 않았다.
- useNoteDrafts에서 React 상태 초기화/전이 경계를 영속화 어댑터에 연결할 수 있다. 저장 완료 표시는 실제 영속화 결과를 처리하는 후속 단계가 필요하다.
- 저장 요청은 Draft의 baseVersion을 expectedVersion으로 사용해야 한다. latestServerVersion으로 대체하면 안 된다. 서버 저장 성공/409/저장 중 추가 편집의 새 기준 결정도 후속 작업이다.
- 여러 탭/기기의 Draft 공유, 충돌 비교·수동 해결, 메모리 사용량 제한·장시간 편집 성능 측정은 이번에 구현·측정하지 않았다.

## 검증과 파일 기록

검증은 pnpm build/tsc, lint, Node의 기존 47개+Draft 13개(총 60개), mock Chrome Draft/기존 조회/생성·삭제 회귀로 수행한다. 브라우저 상세 결과와 실제 실행 순서/전체 변경 파일은 [작업 이력](../worklogs/2026-10-25-note-drafts.md)에 기록한다. 개발 DB에는 변경 요청을 보내지 않는다. 생성·삭제 회귀의 POST/PATCH/DELETE는 전부 mock이다.

트러블슈팅은 사용자 요청에 따라 Git에서 제외된 로컬 docs/troubleshooting/2026-10-25-frontend-note-drafts.md와 README에 기록한다.
