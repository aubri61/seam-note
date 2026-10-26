# PWA 앱 셸과 오프라인 원고 복원

## 범위

인터넷 없이 동일 브라우저·프로필·origin에서 앱을 새로 실행하고, 기존에 IndexedDB에 commit된 원고를 열어 편집·재저장한다. 서버 전송은 기존 `서버에 저장` 클릭만 수행한다. 온라인 복귀/서비스 워커/입력은 자동 PUT하지 않는다.

## 앱 셸·설치

Vite8.3.5와 peer 호환인 vite-plugin-pwa2.0.0, Workbox7.4.1을 사용한다. manifest는 `id/start_url/scope=/`, standalone, 한국어, 기존 ivory 색상이다. 기존 Note SVG 경로/색상으로 설치용192/512px PNG와 maskable safe area를 구성했다. 기존 사이드바 로고는 유지한다.

- Workbox generateSW가 production HTML/JS/CSS/정적 이미지/SVG를 precache한다. 최종 빌드13개 항목, 약1538KiB다. lazy Dexie chunk도 포함하므로 오프라인 첫 복구가 가능하다.
- `/`와 `/notes/:noteId`의 document navigation은 precache index.html로 fallback한다.
- `/api`와 `/api/*`는 navigation fallback에서 제외하며 runtimeCaching은 빈 배열이다. 서버 JSON·본문·Outbox를 Cache Storage에 넣지 않는다.
- development SW는 disabled다. localhost5173 HMR 앱은 SW를 새로 등록하지 않는다. 실제 검증은 production build를 별도 HTTP 서버로 제공했다.
- 운영은 HTTPS(로컬 실습은 localhost/loopback)와 정상 manifest MIME, `/notes/*` SPA fallback이 필요하다. `/api/*`와 없는 정적 파일에 HTML을 반환하지 않는다. sw.js/index.html은 재검증 가능한 캐시 정책, 해시 asset은 immutable 정책을 권장한다.

## IndexedDB v3

기존 DB `seam-note-local`의 v1/v2 선언·upgrade는 변경하지 않는다. v3는 additive table 하나만 추가한다.

```ts
version(3).stores({
  drafts: '&noteId',
  outbox: '&operationId, noteId, status',
  workspace: '&key',
})
```

```ts
interface WorkspaceRecord {
  key: 'current'
  data: WorkspaceTreeResponse // Folder + NoteSummary, content 없음
  cachedAt: number
  requestedAt: number
}
```

v2→v3는 Draft/Outbox를 변형하거나 백필하지 않는다. 기존 v1→v2의 dirty 작업 백필은 그대로 거친다. schema preflight는 알려진 v1/v2/v3만 허용하고 알 수 없는 schema/레코드는 덮어쓰지 않는다. `readTitles`는 cursor로 각 레코드를 검증하고 title map만 반환한다. 전체 원고 배열을 별도로 만들지 않는다(대규모 메모리 수치는 미측정).

Draft+Outbox CAS transaction의 scope는 그대로 `[drafts,outbox]`이며 workspace 저장은 별도의 metadata transaction이다. 서로의 부분 기록을 만들지 않는다. 전체 사용자 데이터를 삭제하는 upgrade는 없다.

## GET 우선순위와 복구

`workspaceQueries → loadWorkspace → getWorkspaceTree → saveWorkspace` 순서다.

1. 온라인에서는 실제 Workspace GET을 우선한다. 배열/핵심 필드를 검증하고 허용된 Folder/NoteSummary 필드만 local snapshot에 기록한다. 서버가 추가로 content를 반환해도 저장하지 않는다.
2. server 성공 응답은 Query 서버 snapshot으로 사용한다. IndexedDB 캐시 저장 실패 시 live 데이터는 표시하되 오프라인 목록 저장 실패를 알린다.
3. 오프라인 또는 네트워크/일시적 GET실패/비정상 성공 형식이면 마지막 유효 snapshot을 복원한다. Query의 `localSnapshot`은 서버 DTO 필드가 아닌 표시용 출처 정보다. 401/403 등4xx는 조용히 로컬 목록으로 대체하지 않는다.
4. 실패를 빈 배열로 저장하지 않는다. 서버가 성공적으로 빈 Workspace를 반환했을 때만 빈 snapshot을 저장한다. 로컬 목록이 없으면 명확히 이용 불가 오류를 표시한다.
5. 오래된 요청의 snapshot이 이미 더 최근에 시작한 요청의 기록을 대체하지 않도록 requestedAt을 비교한다. 이는 서버 전체 snapshot version/다중 탭의 전역 일관성을 제공하는 프로토콜은 아니다. 오프라인 목록은 마지막 관측 목록이며 오래될 수 있다.
6. Query는 `networkMode:'always'`로 로컬 fallback을 실행한다. 캐시 출처 목록은 stale 상태로 유지하고 reconnect 시 GET을 재개한다. 앱 시작에서 onlineManager를 navigator 상태로 초기화해 문서 생성 전부터 오프라인인 cold launch도 reconnect를 인식한다.

Note Query도 offline에서 pause하지 않고 명시적 OFFLINE_NOTE 결과를 만든다. 서버 NoteResponse를 로컬 Draft로 위장하지 않는다. `useNoteDrafts`는 별도로 noteId별 local record를 복구하고, Draft가 있으면 오프라인 조회 오류가 입력을 막지 않는다. 본문이 없으면 이용 불가를 알리고 readOnly로 둔다. 온라인 복귀 시 detail GET을 재개하며 기존 Recovery Barrier/dirty 및 frozen 보호가 그대로 적용된다.

로컬 목록에 노트가 없다는 이유만으로 서버404라고 단정하지 않는다. 유효한 URL에 로컬 Draft가 있으면 복구할 수 있다. 서버에서 성공적으로 받은 최신 목록/상세404는 기존 route 오류 정책을 유지한다. 트리에 없는 노트가 캐시에 자동 추가되는 것은 아니다.

사이드바는 복구한 noteId별 Draft title map을 우선하고 현재 세션 편집 값을 그 위에 덮는다. Query의 서버 NoteSummary를 편집 값으로 변경하지 않는다.

## 지원 범위

| 상태 | 지원 |
| --- | --- |
| 온라인에서 앱 파일 캐시 완료 + 같은 origin 재실행 | 앱 셸 실행 |
| 로컬 Workspace snapshot 있음 | 마지막 폴더/원고 목록 복원 |
| 선택한 노트의 Draft local commit 있음 | 본문 복구·편집·Draft+Outbox 저장 |
| 미열람/본문 local commit 없음 | 목록은 보이지만 본문은 오프라인 이용 불가 |
| URL 노트가 오래된 로컬 목록에 없음 | 존재하는 local Draft 복구 가능, 트리 목록 자동 생성은 안 함 |
| 처음 방문부터 오프라인/캐시 회수 | 앱 실행 보장 안 됨 |
| create/delete/rename | 온라인 및 정상 서버 목록에서만 사용 |
| 서버 저장 | 온라인·상세/복구 정상일 때 명시적 버튼만 사용 |
| 온라인 복귀 | GET 재조회와 Outbox 유지, 자동 PUT 없음 |

로컬 저장 완료는 서버 저장 완료가 아니다. 종료 전 commit하지 못한 입력·브라우저 저장소 삭제/회수·프로필 분리/시크릿 종료의 한계는 유지한다. 모든 원고의 본문을 백그라운드 다운로드하거나 오프라인 생성·삭제·충돌 병합을 추가하지 않았다.

## 업데이트 정책

`registerType:'prompt'`, `skipWaiting:false`, `clientsClaim:false`다. 새 SW는 waiting으로 두며 skipWaiting 메시지/자동 reload/updateSW 호출을 하지 않는다. 열린 앱에 새 버전 준비 안내를 표시한다. 사용자는 로컬 저장 상태를 확인하고 **모든 Seam Note 창을 닫은 뒤** 다시 열어 업데이트한다. 설치된 앱 창과 브라우저 탭 모두 해당한다.

다른 창을 강제로 전환시키거나 메모리 입력이 commit됐다고 가정하지 않는다. 마지막 창이 닫힐 때까지 구 앱이 유지되고 새 실행은 최신 precache를 사용한다. 앱을 오래 열어 두면 업데이트도 오래 대기하는 tradeoff다. 개발→production 전환이나 schema upgrade 시 구버전 앱의 열려 있는 DB 연결은 versionchange에 따라 닫힐 수 있으므로 구 코드로 무리하게 계속 저장하지 않는다.

## 재현/실습

저장소 루트에서:

```sh
pnpm --dir frontend build
pnpm --dir frontend exec vite preview --host localhost --port 4173 --strictPort
```

기존 API18765가 실행 중이면 preview도 기존 `/api` proxy를 상속한다. Chrome에서 `http://localhost:4173`을 온라인으로 열어 설치 메뉴를 사용한다. 앱 파일 준비 안내를 확인하고 사용할 원고를 각각 열어 로컬 commit을 기다린다. 그 뒤 모든 창을 닫고 네트워크를 차단한 뒤 같은 URL 또는 `/notes/{uuid}`로 다시 실행한다. 입력 후 로컬 저장 완료를 확인하고 재실행한다. 온라인 복귀 후에는 사용자가 서버에 저장 버튼을 눌러야 한다.

**origin이 다르면 IndexedDB와 SW도 다르다.** localhost5173의 미동기화 원고는 localhost4173/127.0.0.1/다른 포트로 자동 이동하지 않는다. 기존 원고를 삭제하거나 복사하지 않았다. 개발5173을 끄거나 덮어쓰지 않았고 실습은 새 origin의 서버 조회 원고로 준비해야 한다. 같은 실제 배포 origin을 유지하면 앱 업데이트 후 기존 데이터가 복원된다.

독립 실증:

```sh
SEAM_NOTE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node frontend/tests/browser/pwaOffline.cjs
```

설치된 Chrome, 기존 pnpm 의존성/Node가 필요하다. 두 production 빌드/Node HTTP 합성 API/임시 Chrome profile을 만들고 실제 네트워크를 차단한다. 개발 DB를 사용하지 않는다. Chrome installability 오류0을 검증했으며 OS 설치 창을 자동 조작하거나 Safari 설치를 검증한 것은 아니다.

## 결과

[production PWA 실증10개](../verification/2026-10-26-pwa-results.json), [실제 Spring/PG 수동 저장 회귀](../verification/2026-10-26-pwa-manual-save-results.json), [파일별 작업 순서·전체 검증](../worklogs/2026-10-26-pwa-offline.md)을 참고한다.

공식 설정 참고: [Vite PWA prompt 정책](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html), [기본 구성](https://vite-pwa-org.netlify.app/guide/). 실제 peer 호환은 pnpm registry와 설치 package metadata로 확인했다. Safari/iOS, 실제 OS 설치 UX, 운영 CDN 배포는 미검증이다.
