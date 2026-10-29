# Offline-first 자동 동기화

## 범위와 데이터 소유권

기존 SyncCoordinator/creationSync/manualSync/ACK/CAS를 그대로 사용한다. 새 구현은 언제 호출할지를 결정하는 scheduler와 조회 orchestration이다. IndexedDB schema와 서버 API/Flyway는 변경하지 않는다. 현재 인증·사용자별 저장소가 없으므로 이 origin이 접근하는 단일 서버 Workspace와 `seam-note-tiptap-v1`의 큐 전체가 대상이다. 다른 사용자와 데이터가 격리된 공개 서비스라고 해석하면 안 된다.

로그인 도입 시 계정/서버 scope별 IndexedDB 이름·Query key·WebLock·BroadcastChannel·scheduler를 나눠야 한다. 로그아웃/계정 전환은 예약 취소→진행 중 요청 결과 확정/불확실 상태 보존→기존 계정 큐 봉인→Query/Session 교체→새 scope 복구 완료 순서가 필요하다. 미확정 operationId를 새 계정에서 재전송해서는 안 된다. 클라이언트 namespace 분리는 서버의 인증/소유권 검사를 대체하지 않는다. 이번에 OAuth를 구현하지 않는다.

## 실행 흐름

1. `workspaceStorage.initialize`는 IDB schema/큐/Draft snapshot을 먼저 읽는다. 선택 노트 detail query도 로컬 Draft read를 HTTP GET보다 먼저 수행한다. UI의 초기 GET과 React Session 복구가 병행되더라도 기존 Recovery Barrier가 먼저 도착한 GET으로 원고를 초기화하지 않는다.
2. useWorkspaceSync는 Dexie liveQuery에서 커밋된 큐를 관찰하고 startup을 예약한다. 선택/작업이 있는 노트만 session.select/retry/readyForSync로 복구 및 안전한 head 재확인하고 메모리를 flush한다. 큐 없는 전체 Workspace 본문을 다운로드하지 않는다.
3. 성공한 실제 Workspace GET으로 서버 접근을 확인한다. loadWorkspace의 오프라인 fallback을 서버 성공으로 취급하지 않는다. 서버 성공 후 로컬 cache 저장 실패도 자동 전송 차단 대상이다.
4. 선택 노트 detail만 확인한다. dirty/미확정 Draft는 기존 Session 규칙으로 보존한다. clean Draft는 더 높은 서버 버전으로 갱신 가능하다.
5. 기존 syncWorkspace를 한 번 실행한다. 전역 생성/삭제/동기화 WebLock이 다른 탭의 서버 전송을 직렬화하고 노트별 WebLock/CAS가 추가 보호한다. 로컬 입력/IDB 저장은 글로벌 서버 잠금을 기다리지 않는다.
6. 성공 응답은 기존 ACK transaction으로 처리한다. 전송 중 추가 입력은 별도 revision/후속 Outbox를 유지한다. onNote로 성공 detail cache를 갱신하고 ACK가 있을 때 Workspace를 다시 조회한다.
7. 새로운 operationId가 생기면 한 번 더 예약한다. 같은 inFlight의 status 변화/ACK timestamp만으로 반복 실행하지 않는다. 빈 큐는 commit 예약을 취소한다. 수동 버튼도 같은 scheduler/엔진을 사용한다.

## 트리거와 시간 정책

| 트리거 | 동작 |
| --- | --- |
| 앱 시작 | IDB 초기화 뒤150ms coalescing 후 실행 |
| 로컬 commit | 마지막 queue 변경 뒤4초. 실제 입력 중에는 quiet window도 연장 |
| focus/visible | 이벤트를 합치고 자동 run 시작 간격 최소3초 |
| online | 실제 API GET으로 확인. 기존 불확실 요청은 같은 ID/payload |
| 노트 선택 | Query가 해당 ID를 staleTime0으로 조회. scheduler가 pending 작업도 점검 |
| 수동 버튼/⌘S·Ctrl+S | quiet/throttle을 건너뛰고 즉시 예약, 실행 중에는 한 번의 후속 실행으로 합침 |
| 네트워크 재시도 |5/15/30초, 최초 포함 최대4회. 소진 후 타이머 없음. 새 실제 이벤트는60초 cooldown 뒤 또는 수동/online으로 재개 |

자동 scheduler는1개 timer만 사용하고 동시에1개 run만 허용한다. 별도 생성 전용 useAutoCreationSync를 AppLayout에서 제거했다. 기존 로컬400ms debounce와 서버4초 debounce는 분리한다. GET/PUT 모두15초 timeout을 적용한다.

Query 자체의 focus/reconnect 재조회를 꺼 scheduler와 중복되지 않게 한다. 선택된 노트는 항상 GET을 확인하되 startup/selection만 합쳐진 scheduler run은2초 이내 같은 detail 조회를 재사용한다. focus/online/manual이 포함되면 항상 실제 서버를 확인한다. startup은2초 이내 Workspace 조회를 재사용하며, 수동 pull은 선택 detail을 강제로 확인한다. 비활성 캐시 전체에 noteKeys.all invalidation을 하지 않는다.

## 실패 정책

- VERSION_CONFLICT/NOTE_NOT_FOUND/멱등성 충돌: 기존 persisted conflict/불확정 작업을 보존. Diff/삭제 복구 UI 재사용, 자동 overwrite/UUID 재생성 없음.
- 로컬 CAS/복구/ACK 실패: 해당 노트 전송을 확정하지 않으며 독립 작업은 기존 Coordinator가 계속 처리한다. 동일 body/metadata의 재조정만 기존 Session.retry가 허용한다.
- 0/5xx/408/429: bounded retry. 성공 여부 불명확한 payload/key를 바꾸지 않는다.
- 401/403: 자동 실행을 멈추고 권한 확인 안내. 수동 재시도 또는 online 신호로만 다시 실행한다.
- 기타 영구/검증 실패: operationId를 해당 mounted scheduler의 자동 전송에서 제외한다. 수동 요청만 이를 해제한다. IDB 작업은 삭제/변경하지 않는다. 재실행하면1회 재평가될 수 있으나 timer 무한 반복은 없다.
- 선택 전환으로 취소된 Query: 데이터 오류/권한 오류로 취급하지 않고 다음 선택/commit 예약을 유지한다.
- 오프라인: 입력 및 IDB commit 지속. timer 전송 중단. online 신호 때 GET부터 확인한다.

## UI와 PWA

로컬 badge는 계속 로컬 저장 상태를 나타낸다. 옆의 작은 서버 상태 문구는 동기화 중/대기/완료/오류/확인 필요를 구분한다. 완료는 큐와 메모리 변경이 모두 없고 마지막 실행이 성공했을 때만 표시한다. Dirty Draft에 대응하는 작업이 수동 삭제된 경우에도 완료로 표시하지 않고 본문을 보존한 채 확인을 요청한다. 기존 수동 버튼과 offline 표시, Diff는 유지한다. local Draft가 있으면 백그라운드 GET의 로딩 문구로 editor 레이아웃을 바꾸지 않는다. Tiptap 인스턴스/문서가 같으면 setContent하지 않으므로 커서와 undo stack을 불필요하게 초기화하지 않는다.

SW는 app shell만 제공하며 원고/Outbox를 CacheStorage에 중복 저장하지 않는다. 강제 종료 뒤 inFlight는 기존 key/snapshot으로 재시도하고 ACK와 후속 B 생성은 동일 IDB transaction이다. 자동 실행은 이 경계를 바꾸지 않는다.

## Chrome에서 직접 확인

1. 코드가 적용된 개발 서버에서 원고를 열고 제목/본문을 입력한다. 약400ms 후 local badge, 마지막 local commit 뒤4초 후 서버 상태/Network PUT을 확인한다. 빠르게 계속 입력하는 동안 매 키마다 PUT하지 않는다.
2. DevTools Application→IndexedDB의 drafts/outbox를 확인한다. 전송 시 pending→inFlight, 성공 뒤 ACK와 큐 제거/후속 작업을 확인한다. 값을 수동으로 바꾸지 않는다.
3. 같은 origin 두 탭에서 하나의 노트를 열고 한쪽만 입력한다. 정상 환경에서는 Web Lock으로 하나의 PUT/ACK가 처리된다. 양쪽에서 다른 문장을 동시에 편집하면 기존 local CAS/Diff가 입력을 보호한다.
4. 다른 브라우저 프로필에서 서버 원고를 수정한 뒤 원래 프로필로 돌아온다. clean이면 최신 내용이 반영되고 dirty이면 기존 VERSION_CONFLICT 선택 UI를 사용한다. 공개 다중 사용자 환경의 격리 테스트가 아니라 같은 테스트 Workspace의 동시성 실험이다.
5. production PWA는 최초 online 방문 후 app-shell 캐시 준비를 확인하고 한 번 재접속해 SW 제어권을 얻는다. 네트워크를 끊고 같은 프로필에서 재실행/편집/재실행한다. 온라인 복귀 시 기존 key/snapshot으로 자동 반영되는지 확인한다.

개발 데이터를 건드리지 않는 자동 재현:

- `python3 scripts/manual-sync-lab.py --serve --ui-port 25221 --api-port 18821 --db-port 25521`은 새 임시 PG cluster와 synthetic note를 만든다. 출력된 fixture.json 경로를 사용한다. 기존 DB를 재사용하지 않는다.
- `pnpm --dir frontend build` 후 `SEAM_NOTE_LAB_FIXTURE=<출력경로>/fixture.json SEAM_NOTE_PLAYWRIGHT_MODULE=<Playwright 또는 기존 onlineChrome helper> node frontend/tests/browser/autoSyncLive.cjs`.
- `AUTO_CREATION_ONLY=1` 또는 `AUTO_FORMAT_ONLY=1`로 보조 그룹을 따로 실행한다. 이 환경 변수는 테스트 harness에만 있고 제품 빌드에는 없다.
- 실제 SIGKILL은 같은 fixture와 별도 `SEAM_NOTE_CRASH_REPORT`를 지정해 `inFlightCrashRecovery.cjs`로 재현한다. Playwright/Chrome 설치와 psql이 필요하다. 테스트 하네스는 lab DB명/포트를 확인하고 실제 개발 API에 쓰지 않는다.

추가 안전성 검증: `AUTO_ORPHAN_ONLY=1`은 큐만 삭제된 dirty Draft를 완료로 오인하지 않는지, `AUTO_MOBILE_ONLY=1`은390×844에서 상태 문구/Drawer가 넘치지 않는지 확인한다. 이들도 test-only 옵션이다.401/400/503 및 응답 유실은 테스트 프록시의 HTTP fault injection이며,409/404와 정상 저장은 실제 격리 Spring/PostgreSQL 응답이다.

수동으로 production PWA를 띄워보고 싶다면 lab backend를 실행한 채 빌드 후 다음을 별도 터미널에서 실행한다. 이 모드는 Node만 필요하고 브라우저 자동 조작을 하지 않는다.

```sh
AUTO_SERVE_ONLY=1 SEAM_NOTE_LAB_FIXTURE=<lab가 출력한 경로>/fixture.json node frontend/tests/browser/autoSyncLive.cjs
```

출력되는 `http://127.0.0.1:25203/notes/{lab-note-id}`를 **새 Chrome 테스트 프로필**에서 연다. Network PUT·IDB Outbox·서버 상태를 직접 볼 수 있다. 오프라인 최초실행을 확인하기 전 캐시 준비 후 테스트에서 명시적으로 한 번 재접속한다. 기존 일반 프로필이나 실제 원고 origin을 실험 대상으로 쓰지 않는다. UI proxy와 lab backend는 각 터미널에서 Ctrl-C로 중지한다.
