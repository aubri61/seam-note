# 노트 URL 라우팅

> 후속 단계: 현재 Draft는 Dexie/IndexedDB에도 저장한다. 메모리 전용·이탈 정책에 대한 아래 설명은 해당 단계의 이력이며, 현재 복구/로컬 저장/멀티탭 계약은 [로컬 원고 저장](local-draft-storage.md)을 따른다.

## 도입과 URL 계약

기존 라우터가 없어 pnpm으로 react-router-dom **7.18.4**를 설치했다(동일 버전 react-router 포함). 설치 패키지의 peer는 React/React DOM >=18, Node engine은 >=20이며 현재 React 19/Node v20.20.0에서 build와 테스트를 통과했다. 기존 QueryClientProvider/Emotion ThemeProvider와 QueryClient 인스턴스는 유지하고 그 안에 BrowserRouter를 한 번 추가했다.

| URL | 처리 |
| --- | --- |
| `/` | Workspace 조회 후 기존 정렬/깊이 우선 순회의 첫 Note로 replace. Note가 없으면 그대로 빈 화면 |
| `/notes/:noteId` | UUID의 Note 상세/편집. 다른 원고 fallback 없음 |
| 나머지 URL | 기존 레이아웃 안에 페이지 404 표시 |

UUID는 8-4-4-4-12 hex 텍스트로 검증한다. PostgreSQL/Java UUID와 같이 특정 UUID 버전/variant만 제한하지 않는다. 대문자는 소문자로 정규화하고 URL을 replace한다. 잘못된 UUID는 오류를 표시하고 상세 Query를 skip한다. path 생성은 notePath()에서 segment를 encode한다. 폴더 URL은 추가하지 않았다.

## 선택과 컴포넌트 수명

- main.tsx: BrowserRouter 제공. Query/Theme/StrictMode 구조 유지.
- App.tsx: `/` 부모 Route의 element는 AppLayout 하나다. index, notes/:noteId, catch-all 자식이 같은 WorkspaceEditor를 사용한다.
- AppLayout: useFolders와 useNoteDrafts 및 UI 상태를 소유한다. Editor props를 Outlet context로 전달한다. noteId key를 주거나 노트별로 AppLayout을 교체하지 않는다.
- WorkspaceEditor: Outlet context를 받아 NoteEditor를 표시한다. Draft 소유자가 아니다.
- useFolders: useMatch/useLocation으로 URL을 해석해 selectedNoteId를 파생한다. requestedNoteId 상태/없는 ID의 첫 Note fallback을 제거했다. Note Query key는 기존 noteKeys.detail(noteId)다.
- FolderTree: Note row를 실제 Link로 표시한다. href, 새 탭/수정 키 동작을 보존하며 일반 클릭은 기존 UI callback 후 Router navigation을 사용한다. 폴더 row는 기존 선택/펼침이다. 링크/폴더의 방향키·Enter·Space 탐색과 기존 Emotion 스타일을 유지한다.

별도 React 노트 선택 상태를 URL과 맞추는 이중 동기화는 없다. 폴더 선택은 생성 위치를 위한 UI 상태로만 보유하고 location.key가 바뀌면 지운다. URL 전환 시 새 Note의 조상을 다시 펼치며 다른 폴더의 기존 펼침 상태는 유지한다. 폴더를 클릭해도 현재 Note URL/에디터는 바뀌지 않는다.

## 직접 접속·조회 오류

유효한 URL은 Workspace와 해당 Note 상세를 병렬로 조회할 수 있다. Workspace membership 확인 전에는 새 서버 snapshot으로 Draft를 만들거나 원고를 표시하지 않는다. 현재 Workspace 메타데이터에 없는 Note는 다른 Note를 선택하지 않고 명확한 404를 표시한다. 메타데이터에 있더라도 상세 API가 404면 404 안내를 표시한다.

- 잘못된 UUID/미지원 경로: 유효하지 않은 상세 Query를 실행하거나 재시도하지 않는다.
- Workspace에서 없는 UUID: 재시도 버튼은 Workspace부터 다시 조회한다. 새 메타데이터에 Note가 포함되면 해당 ID의 상세 Query가 활성화된다. skipToken Query를 강제로 refetch하지 않는다.
- 상세 재조회 오류: 기존 dirty Draft가 있으면 삭제하지 않고 오류와 함께 편집을 유지한다. 서버의 404가 로컬 원고 폐기를 의미하지 않는다. Workspace가 해당 ID의 부재를 확인한 경우 편집 화면은 숨겨 잘못된 Workspace 원고를 표시하지 않는다.
- 잘못된/없는 경로에서 삭제 버튼은 비활성화한다. 오류 UI는 기존 레이아웃 안에서 표시한다.

Workspace 메타데이터의 Infinity cache/명시적 무효화 정책과 상세 30초/focus 재조회 정책은 유지했다. 다른 탭에서 추가·삭제된 Note와 현재 캐시가 어긋날 수 있다. 없는 ID의 재시도는 최신 Workspace를 확인하며, 메모리 캐시를 서버의 영구 진실로 간주하지 않는다. UI 404와 정적 SPA document 응답의 HTTP 200은 구분해야 한다.

## Draft 보존

Draft 모델/Hook/이탈 보호는 변경하지 않았다. 부모 AppLayout이 모든 라우트에서 유지되어 A 편집 → B Link → Back/Forward → A, 클릭으로 A 재선택 모두 같은 noteId별 메모리 Draft를 사용한다. 서버 응답 ID guard/dirty Draft 거부/버전 단조 정책을 유지한다. 기존 상세 cache/Query를 편집 저장소로 사용하지 않는다.

주소는 서버 Note ID만 나타낸다. URL 공유/복사/새 탭은 미저장 Draft 내용을 공유하지 않는다. 내부 SPA 이동에는 beforeunload가 발생하지 않으며 Draft는 그대로다. 실제 새로고침/탭 종료에는 기존 any-dirty beforeunload가 경고를 요청한다. 새로고침 후 Draft 복원, 경고의 모든 브라우저/강제 종료 보장은 없다.

IndexedDB를 붙일 때 URL 선택과 영속 Draft 복구를 분리한 채 동일 noteId 키와 부모 Hook 경계를 활용할 수 있다. 라우트 진입이 기존 dirty Draft 초기화를 의미해서는 안 된다. 이번에는 영속 저장/서버 저장/Outbox를 추가하지 않았다.

## 생성·삭제

- Note 생성 성공: 기존 성공 cache seed/tree 갱신/조상 펼침 뒤 navigate(notePath(id))로 이동한다. 실패는 URL/Draft를 바꾸지 않는다.
- 열린 Note 삭제 성공: 기존 전체 정렬 순서의 다음 Note, 없으면 이전 Note로 replace 이동한다. 남은 Note가 없으면 `/`로 replace한다. 상세 cache 제거/metadata invalidate는 기존 Mutation을 유지한다.
- 삭제 실패: 현재 URL, 목록, Draft를 유지한다.
- 삭제 요청 대기 중 Back으로 다른 Note를 열었다면 그 새 URL을 성공 callback으로 덮어쓰지 않는다.
- 삭제 Note의 과거 URL이 history에 있거나 직접 접속되면 404다. history 전체를 수정해 과거 링크를 없애지 않는다.
- 기존 물리 삭제 확인과 Draft 수명 정책은 확장하지 않았다. 삭제된 Note의 dirty Draft가 메모리에 남을 수 있으며 자동 폐기하지 않는다.

## 직접 접속과 배포 SPA fallback

현재 Vite 개발 서버는 기존 `/api` proxy(127.0.0.1:18765)를 유지한다. `/notes/{uuid}` 직접 document 요청/새로고침이 index.html을 반환하고 앱이 라우트를 해석함을 mock Chrome에서 확인했다. Vite 설정을 바꾸지 않았다.

저장소에는 실제 운영 정적 웹서버/배포 설정이 없어 배포 서버를 변경하거나 검증하지 않았다. 배포 시 반드시 다음을 설정해야 한다.

1. 정적 파일이 아닌 프론트 경로(`/notes/...` 포함)는 index.html로 rewrite/fallback한다. 외부 redirect로 `/`로 보내면 원래 Note URL이 사라지므로 사용하지 않는다.
2. `/api/*`는 백엔드로 전달하고 API의 400/404/409를 HTML fallback으로 바꾸지 않는다.
3. 없는 JS/CSS 등 정적 자산은 실제 404를 반환한다.

예를 들어 Nginx에서는 아래와 같은 정책이 필요하다(실제 서버 설정에 적용한 것이 아니며 upstream/docroot는 배포 환경에서 지정해야 한다).

```nginx
location /api/ {
    proxy_pass http://backend_upstream;
}
location /assets/ {
    try_files $uri =404;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

정적 호스팅 서비스라면 같은 의미의 SPA rewrite를 설정한다. 현재는 origin root(`/`) 배포 기준이며 하위 디렉터리 배포의 Vite base/BrowserRouter basename 조합은 별도 범위다. SSR 기반 document HTTP 404/SEO는 구현하지 않았다.

## 검증

- pnpm build(tsc/Vite), pnpm lint, pnpm test: 기존 60개+라우트 정책 5개 = 65개 통과.
- noteRouting.cjs: root replace/history 길이, Link href/전체 document 유지, 직접 진입/병렬 조회/새로고침, 대문자 UUID, Back/Forward dirty Draft, 조상 펼침, 늦은 응답, 잘못된 UUID/없는 Note/Workspace 제외/재시도, 빈 root/무한 이동 없음, 모바일 URL/Back, beforeunload 조건.
- workspaceCreateDelete.cjs: 생성 성공 URL, 삭제 replace/빈 root, 실패 URL·Draft 유지, 삭제 URL 직접 접속 404, 삭제 중 Back 유지, 모바일 생성 URL. 쓰기는 전부 mock.
- noteDrafts.cjs 및 workspaceReadonly.cjs: 기존 편집/재조회/실제 Chrome reload 경고 취소/조회·키보드·반응형 회귀 유지. 실제 API GET/쓰기 테스트는 실행하지 않았다.
- 기존 브라우저 fixture의 Note ID를 UUID로 바꿨다. 테스트용 A/B/C 별칭은 본문/변수에 유지해 기존 검증 의도를 보존한다.

재실행 방법과 전체 변경 파일·실행 순서는 [작업 이력](../worklogs/2026-10-25-note-routing.md)에 있다. 로컬 전용 트러블슈팅은 docs/troubleshooting/2026-10-25-frontend-note-routing.md이며 Git ignore 정책을 유지한다.
