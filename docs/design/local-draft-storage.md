# Dexie 로컬 원고 영속 저장

후속 오프라인 생성 단계에서 additive v4와 FOLDER_CREATE/NOTE_CREATE·생성 Ledger·부모 우선 명시적 반영을 추가했다. 최신 생성/수동 저장 흐름은 [오프라인 생성 계약](offline-creation.md)을 따른다. 아래는 해당 선행 단계의 설계·실증 기록이다.


후속 PWA 단계에서 v1/v2를 그대로 보존하고 Workspace metadata 전용 v3를 추가했다. 최신 [오프라인 복원 계약](pwa-offline.md)을 참고한다. 아래는 최초 로컬 저장 단계의 기록이다.


> 후속 단계: 현재는 v1을 보존한 Dexie v2 Outbox와 서버 멱등성 기반이 추가됐다. 아래 v1-only/Outbox 미래 경계 설명은 도입 단계의 이력이며, 현재 schema·원자성·백필 계약은 [Outbox와 멱등성](outbox-idempotency.md)을 따른다. 자동 서버 전송은 없다.

## 범위와 도입

feat/offline-local-storage를 clean main에서 분기했다. Dexie **4.4.7**을 pnpm으로 추가했다. 서버 PUT/자동 서버 동기화/Outbox/PWA/새 인증은 구현하지 않았다. URL·Axios GET·Query Key·서버 API·Flyway·기존 생성/삭제 Mutation은 유지한다.

기존 코드에는 IndexedDB DB/스키마가 없어 신규 schema v1을 도입한다. 사용자 저장소를 삭제하거나 초기화하는 기능은 없다. 동명 DB가 이미 있다면 먼저 target version을 선언하지 않은 Dexie 연결로 구조를 읽는다. 알려진 v1 구조가 아니거나 더 높은 버전이면 자동 업그레이드/다운그레이드하지 않고 오류를 표시한다. 알 수 없는 형식의 레코드도 덮어쓰지 않는다.

## DB와 레코드

- DB: `seam-note-local`
- Dexie schema version: `1`
- Store: `drafts`, primary key `&noteId`
- 본문/제목/시간/revision에 secondary index를 만들지 않는다.

```ts
interface LocalNoteDraft extends NoteDraft {
  // 기존 필드: noteId, title, content, baseVersion,
  // baseTitle, baseContent, latestServerVersion
  localRevision: number
  localSavedAt: number
  storageToken: string
  writerId: string
}
```

localRevision은 로컬 입력/수신 snapshot의 순서를 추적하는 정수이며 서버 @Version이 아니다. 로컬 복구 시 저장된 번호에서 시작하고 입력 또는 채택한 서버 snapshot이 바뀌면 증가한다. localSavedAt은 쓰기 시점의 기기 시각으로 기록하며 전역 정렬/충돌 판단에 사용하지 않는다.

storageToken은 성공한 각 DB 쓰기의 opaque UUID다. writerId는 AppLayout session마다 생성하는 식별자이며 인증 사용자/기기 소유권을 뜻하지 않는다. 원문·기준 내용·숫자 범위를 읽기/쓰기에서 검증하며 이상한 레코드는 보존하고 실패 처리한다.

향후 schema v2는 기존 `version(1)`을 유지한 채 알려진 schema에서만 비파괴적 upgrade를 추가해야 한다. Folder/Note 메타데이터·Outbox store를 추가할 때 구조 검사 허용 범위/레코드 validator/upgrade 테스트를 함께 확장한다. DB 삭제로 마이그레이션을 대체하면 안 된다.

## 책임과 상태 소유

| 파일/구성 | 책임 |
| --- | --- |
| noteDrafts.ts | 기존 순수 서버 기준/dirty/편집 정책 유지. UI 상태 타입만 확장 |
| localDraftTypes.ts | 저장 레코드/Repository 계약/충돌·손상 오류/DB·채널 이름 |
| draftDatabase.ts | Dexie schema 검사·읽기·원자적 CAS 트랜잭션 |
| localDraftRepository.ts | 첫 복구 때 Dexie runtime을 지연 로딩하는 adapter |
| draftSession.ts | 원고별 복구 barrier/입력 revision/예약/직렬 저장/실패/충돌 상태 머신 |
| useNoteDrafts.ts | AppLayout 수명에 묶인 session 한 개, React useSyncExternalStore 구독, 선택·수신 effect, flush, 이탈 listener |
| AppLayout | 기존 Draft 소유 위치 유지, UI에 상태/재시도 전달, 다른 원고의 저장 실패 알림/확인 Link |
| NoteEditor/SyncStatus | 로컬 상태·실패·재시도와 한계 안내. 입력/Emotion/툴바 유지 |

session은 전역 Draft singleton이 아니다. Hook의 React state initializer가 소유하고 AppLayout이 언마운트될 때 수명을 마친다. URL 전환은 기존 부모를 유지하며 노트별 entry를 바꾼다. Repository/DB connection만 공유한다. 새 상태 관리 라이브러리는 없다.

## React → IndexedDB 저장

1. 입력 즉시 기존 editDraft 함수로 React에 노출되는 메모리 snapshot을 바꾸고 local revision을 증가시킨다.
2. 마지막 변경 뒤 400ms 예약한다. 지속 입력은 최초 미저장 변경으로부터 약 2초 내 저장을 **시도**한다.
3. 노트 전환의 Hook cleanup은 이전 ID를 즉시 flush 요청한다. 숨김/pagehide도 best-effort flush를 요청한다.
4. 같은 원고는 한 번에 하나의 쓰기만 진행한다. 쓰기 중 새 입력은 최신 snapshot으로 모으고 기존 쓰기 완료 뒤 필요한 후속 쓰기를 수행한다.
5. DB 트랜잭션이 완료되면 그 snapshot의 revision만 ack한다. 이후 입력이 있으면 현재 revision과 다르므로 저장 완료로 표시하지 않는다.
6. 쓰기 실패는 memory/기존 DB를 유지하고 자동 반복을 중단한다. 수동 retry는 현재 최신 snapshot을 대상으로 한다.

2초는 저장 완료 SLA가 아니다. 이전 I/O/트랜잭션이 느리면 후속 시도도 기다린다. flush는 요청/직렬 후속 예약이며 최신 입력 전체의 commit을 호출 promise만으로 판단하지 않는다. UI는 revision과 savedRevision/phase를 함께 사용한다. 원고별 상태가 독립적이므로 A 저장 중 B를 편집해도 섞이지 않는다.

## 저장 경쟁·멀티탭

Repository write는 하나의 `rw drafts` 트랜잭션 안에서 다음을 수행한다.

1. 현재 noteId 레코드를 읽고 형식을 검증한다.
2. 현재 storageToken이 호출자가 마지막으로 확인한 expectedToken과 같은지 비교한다. 신규 레코드는 양쪽 모두 없어야 한다.
3. 새 localRevision이 현재 저장 revision보다 큰지 검사한다.
4. 새 token/writer/time과 전체 Draft를 put한다. 전체 transaction promise가 commit된 뒤 반환한다.

두 탭이 같은 revision을 독립적으로 만들더라도 token 비교는 직렬 트랜잭션 안에서 수행되므로 한 쪽만 기존 기준으로 저장할 수 있다. 더 늦게 도착했다는 이유로 다른 탭의 원고를 덮지 않는다. 충돌 시 현재 메모리 입력과 기존 DB를 모두 유지하고 저장을 중단한다.

BroadcastChannel(`seam-note-local-drafts-v1`)은 commit 뒤 ID/writer만 알린다. 본문을 메시지/로그로 전송하지 않는다. 수신 탭은 DB head를 다시 읽어 확인한다. 같은 내용·기준까지 완전히 동일한 snapshot이면 안전하게 ack할 수 있지만 다른 내용이면 충돌 표시/저장 중단이다. 지연된 알림만 보고 무조건 덮거나 충돌로 판단하지 않는다.

채널 미지원/차단 환경은 focus/visibility의 head 확인과 매 write의 CAS를 마지막 방어선으로 사용한다. 알림은 완전한 분산 잠금이나 병합 기능이 아니다. 알림이 없어도 stale write는 DB에서 거절한다. 충돌 retry는 같은 snapshot이 실제 저장된 경우만 ack하며 다른 원고를 자동 채택/병합/강제 저장하지 않는다. 사용자는 현재 텍스트를 복사해 보관하고 다른 탭을 확인해야 한다. 충돌 사본의 별도 영속 보관/비교·선택 UX는 후속 범위다.

## 복구와 서버 우선순위

선택 ID마다 로컬 read를 시작하고 같은 ID의 진행 중 read는 중복하지 않는다. 서버 응답은 먼저 도착해도 read 완료 전에는 대기시킨다. 복구 전 입력은 readOnly이며 빈 원고를 만들어 자동 저장하지 않는다.

- 로컬 없음: 서버 Note로 clean Draft를 만들고 기준과 함께 로컬 저장을 예약한다.
- 로컬 dirty: 로컬 제목·본문·baseVersion/기준 내용을 우선한다. 서버의 더 높은 관측 버전만 반영할 수 있다.
- 로컬 clean: 기존 단조 버전 규칙에 따라 더 높은 안전한 서버 snapshot만 채택하고 기준 본문/version을 함께 갱신한다.
- 낮은/같은 기준 버전 응답으로 로컬 내용/기준을 되돌리지 않는다.
- read 완료 후 선택이 다른 ID여도 결과는 해당 ID entry에만 들어가며 현재 편집기에 잘못 표시되지 않는다.
- 서버 조회가 실패해도 읽을 수 있는 로컬 원고는 복구한다. URL의 noteId가 선택 기준인 정책은 유지한다.

초기 로컬 읽기 실패는 '로컬 데이터 없음'으로 간주하지 않는다. 서버 snapshot으로 메모리 편집은 가능하지만 저장은 차단하고 오류를 표시한다. retry로 읽기에 성공한 뒤 기존 로컬과 메모리 모두 다른 dirty 원고라면 어느 쪽도 폐기하지 않고 충돌로 중단한다. 로컬이 없거나 사용자 변경 없는 사본인 등 안전한 경우에만 메모리 원고를 저장한다.

StrictMode constructor에는 DB I/O/listener를 넣지 않았다. 구독/effect cleanup은 listener/channel을 정리하고 진행 read는 원고별 promise를 공유한다. cleanup/re-run이 복구를 빈 상태로 되돌리거나 기존 Draft를 초기화하지 않는다.

## 사이드바 제목 표시

useNoteDrafts는 session의 React snapshot에서 noteId별 `draftTitles`를 파생한다. AppLayout → Sidebar → FolderTree로 전달하며 각 원고의 표시 제목과 tooltip에 `draftTitles[noteId] ?? NoteSummary.title`을 적용한다. 빈 결과는 표시에서만 `제목 없음`으로 바꾸고 원본 빈 문자열은 유지한다.

제목 입력의 React 반영 즉시 표시하므로 400ms 예약/IndexedDB commit을 기다리지 않는다. IndexedDB에서 선택 원고가 복구되는 동일 snapshot 갱신도 반영한다. 이미 메모리에 있는 다른 노트 제목은 전환 후에도 유지한다. 아직 선택·복구하지 않은 원고는 서버 요약을 표시한다. 전체 로컬 DB 선조회는 추가하지 않았다.

Query 캐시/서버 NoteSummary/트리 노드는 수정하지 않으며 입력으로 invalidate/refetch하지 않는다. 기존 sortOrder·폴더 관계·선택·URL 및 **서버 메타데이터 기준 검색 정책**은 유지한다. 검색은 현재 표시된 로컬 제목과 다를 수 있으며 로컬 제목 검색은 별도 후속 범위다. 추가 dirty 배지는 도입하지 않았고 기존 로컬 저장/서버 미동기화 상태 안내를 유지한다.

## dirty와 로컬 저장 상태

서버 dirty는 title/content와 baseTitle/baseContent의 비교다. IndexedDB commit은 dirty를 false로 만들지 않으며 baseVersion도 올리지 않는다.

- 로컬 원고 복구 중
- 편집 중 / 로컬 저장 대기
- 로컬 저장 중
- 로컬 저장됨 · 서버 미동기화
- 변경사항 없음 (서버 기준과 같고 최신 로컬 commit 확인)
- 로컬 저장 실패 (충돌 포함, 상세 사유/수동 retry 표시)

기존 서버 로딩/조회 실패도 구분한다. 저장/복구 실패는 배지와 해당 원고의 inline 오류로 표시한다. 다른 원고를 보는 동안 실패하면 AppLayout에 확인 Link를 표시해 묻히지 않게 한다. 서버 저장 완료/동기화 완료라고 표시하지 않는다.

## 이탈·저장소 한계

어느 ID든 최신 revision이 아직 로컬에 반영되지 않았거나 실패/충돌이면 beforeunload 경고를 요청한다. 기존 DB의 dirty 내용을 서버 원문으로 원복한 경우에도 그 원복이 commit될 때까지 보호한다. 서버에서 다시 받을 수 있는 최초 clean 사본만 있는 경우 불필요한 이탈 경고는 생략할 수 있다. 서버 dirty여도 최신 snapshot의 로컬 commit이 확인되면 일반 새로고침으로 복구할 수 있어 경고를 해제한다.

beforeunload listener는 한 Hook에서 조건부 등록하고 정리한다. 종료 이벤트의 비동기 commit은 보장하지 않는다. debounce/쓰기 완료 전 종료·강제 종료는 최신 입력 일부를 잃을 수 있다. 브라우저는 사용자 상호작용/종료 방식에 따라 경고를 생략할 수 있다.

IndexedDB는 scheme/host/port 및 브라우저 프로필별 저장소다. localhost와 127.0.0.1 또는 다른 포트는 같은 저장소가 아니다. 저장소 삭제/회수, 비공개 환경의 제한/세션 종료, 디스크 문제로 로컬 원고가 사라질 수 있다. 로컬 저장은 서버 백업/영구 보존 보장이 아니다.

navigator.storage.persist()/persisted()는 지원 여부를 검사한 사용자 동작 기반 정책으로 후속 도입할 수 있다. 이번에는 자동 permission 요청을 추가하지 않았다. persist가 허용되어도 사용자의 명시적 삭제나 모든 데이터 손실을 막는다는 뜻이 아니며 commit 성공과도 별개다.

실패 로그는 noteId와 오류 이름만 남긴다. title/content/baseContent/원본 에러 payload는 출력하지 않는다. quota/열기/권한/transaction/형식 오류를 UI에 설명하고 성공을 가장하지 않는다.

## 서버 삭제와 로컬 원고

서버 DELETE는 기존 물리 삭제다. Query invalidate/remove와 IndexedDB 삭제는 연결하지 않았고 로컬 delete/clear API를 만들지 않았다. 서버 목록에서 없어지거나 상세가 404여도 local draft는 보존한다. 해당 `/notes/:noteId`를 다시 열면 서버 404 안내와 함께 로컬 원고를 볼 수 있고 복사/로컬 편집이 가능하다. 서버에 자동 재생성하거나 PUT하지 않는다.

로컬 보관 목록·사용자 선택 삭제·수동 사본 복원 UI는 후속 범위다. 알려진 ID/URL을 잃으면 현재 트리만으로 서버에서 사라진 원고를 찾는 UI는 없다. 향후 로컬 보관함을 구현해 접근성과 보존 기간을 정해야 한다.

## Outbox/PWA 확장 경계

- 현재 atomic write 범위는 head 비교 + drafts put이다. 실제 서버 저장 의도가 생기는 단계에서는 같은 transaction에 Draft revision과 대응하는 Outbox 작업을 함께 기록해야 한다. put 성공 후 별도 트랜잭션으로 enqueue하면 이중 쓰기 불일치가 생긴다.
- Outbox에는 서버 expectedVersion으로 baseVersion을 사용해야 한다. localRevision/token은 서버 버전이나 멱등키가 아니다. 전송/ack/409/추가 입력 중 성공 기준 이동은 별도 상태 머신이 필요하다.
- Folder/Note metadata store는 알려진 DB schema upgrade로 확장한다. 현재 Query cache를 영속화하지 않았다.
- PWA는 정적 앱 shell/모듈·SPA route의 서비스워커 캐시/업데이트 정책에 추가한다. 현재 IndexedDB 저장만으로 네트워크 없이 앱을 새로 시작할 수 있다고 주장하지 않는다. 직접 URL에서 로컬 데이터는 복구할 수 있어도 앱 자산이 먼저 로드되어야 한다.

## 검증

Node: 기존 65개 + 로컬 저장/경쟁/실패 14개 = 79개 통과. build/tsc/lint 성공.

Chrome 실제 IndexedDB + GET mock: 제목만/본문만/빈 값 저장·새로고침, 실제 프로필을 닫고 다시 실행한 복원/직접 URL, A→B→A, 이전 서버 응답, 서버 먼저/로컬 read 늦음, 느린 write와 최신 입력/전환, 지속 긴 원고 입력, quota/read 실패·retry, 실패 중 새 dirty와 기존 dirty 충돌, 다른 원고 실패 알림, 알 수 없는 동명 DB 보존, 두 탭(채널 지원/차단), 동일 token 동시 tx 중 한 개만 성공, 낮은 revision 거절, tx abort rollback, 서버 삭제 뒤 로컬 보존, 이탈 조건, StrictMode를 검증한다. 주입한 실패/지연은 테스트 wrapper에서만 적용하며 DB 자체는 실제 브라우저 IndexedDB다.

기존 조회·생성·삭제·Draft·라우팅 브라우저 회귀도 유지한다. Safari/WebKit executable이 없어 검증하지 않았다. 개발 DB 쓰기는 하지 않았다. 테스트용 Chrome profile/contexts만 정리하며 사용자 프로필/로컬 원고를 삭제하지 않는다.

관련 파일별 변경·실행 순서·최종 검증/측정은 [작업 이력](../worklogs/2026-10-25-local-draft-storage.md)에 기록한다. 트러블슈팅은 Git 제외된 로컬 docs/troubleshooting/2026-10-25-frontend-local-draft-storage.md 및 README다.
