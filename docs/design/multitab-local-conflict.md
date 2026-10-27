# 멀티탭 저장 기준 변경과 실제 본문 충돌 구분

## 적용 상태

2026-10-27 사용자가 개발 환경에 적용하라고 명시적으로 요청한 뒤 **검증한 패치를 실제 프로젝트 소스에 적용했다**. 적용 전 `git apply --check`, 적용 후11개 대상 파일의 SHA-256이 검증 후보와 일치함을 확인했다. 기존 다른 미커밋 작업은 보존했다. 적용 후 실제 프로젝트에서 Node141개, build/TypeScript, lint를 재실행해 통과했다. 검토 패치와 원본/후보 해시는 verification의 candidate.patch / candidate-manifest JSON에 보존한다. 최초 격리 검증과 이후 실제 적용 결과를 구분한다.

## 문제 정의와 확인 범위

**멀티탭에서 저장 기준이 바뀐 상황을 본문 충돌과 구분하지 못하는 로컬 충돌 처리**다. 안전을 위한 CAS 거부 자체와 불필요한 충돌 판정을 분리해야 한다. 사용자 화면만으로 실제 두 탭의 본문이 같았는지까지 단정하지 않는다.

제품 소스 변경 전 Chromium 두 탭·실제 Dexie IndexedDB·격리 Spring/PostgreSQL로 다음 5개를 재현했다. `multiTabConflictLab.cjs`는 제품 DraftSession과 repository를 직접 호출하며, 진단 HTML만 별도 제공한다. 서버 ACK는 실제 PUT/ledger를 거친다. 가짜 CAS 구현을 사용하지 않는다.

| 구분 | 변경 전 실증 | 의미 |
| --- | --- | --- |
| 정상적인 CAS 거부 | 같은 token을 읽은 두 탭이 다른 본문을 동시에 저장하면 1개 commit, 1개 거부 | 이미 저장된 원고를 오래된 탭이 덮어쓰지 못하게 한 정상 보호 |
| 불필요한 metadata 충돌 | 같은 본문인데 A의 ACK 후 B가 conflict | baseVersion 0→1, localRevision 2→3, token 변경만으로 오류 처리 |
| 실제 내용 충돌 | A/B가 서로 다른 본문을 편집하면 B 입력과 A 저장 본문이 다름 | 자동 덮어쓰기·병합 금지, 메모리 입력 별도 보관 필요 |
| 편집 없는 관찰 탭 | B revision=savedRevision인데 A의 새 저장 본문을 받지 못함 | 마지막 commit 이후 입력이 없으면 최신 로컬 내용을 따라갈 수 있음 |
| 알림 누락 | ACK 알림 없이 B가 저장하면 repository.write의 token/revision 조건 거부 | BroadcastChannel은 힌트이고 IDB transaction CAS가 최종 방어 |

앞 2개 변경 전 로그는 `multitab-before.json`에서 본문 해시·버전·token을 비교할 수 있다. 같은 본문 ACK 케이스의 B는 실제 쓰기 전에 `checkHead()`에서 conflict가 되므로 **모든 오류를 write transaction CAS 실패라고 부르면 부정확하다**. 알림을 끈 별도 케이스에서 실제 write CAS 거부도 확인했다. 재현 시 Recovery Barrier는 완료됐고 HTTP409는 발생하지 않았다.

## 원인과 기존 책임

- `draftSession.ts / sameDraft`: title/content뿐 아니라 baseVersion/baseTitle/baseContent/latestServerVersion을 비교한다. 메타데이터 동일성 검사용으로는 맞지만 본문 충돌 판정에 그대로 사용하면 ACK-only 변경도 다른 원고로 취급한다.
- `checkHead`: token이 바뀌면 sameDraft가 아닌 모든 상태를 conflict로 처리한다. 편집 없는 관찰 탭과 로컬 미commit 입력을 구분할 checkpoint가 없고 conflict 상태의 재확인도 제한적이다.
- `draftDatabase.ts / read`: Draft와 Outbox를 같은 readonly transaction으로 확인한다. 기존 read projection은 불확실한 서버 작업 존재 여부만 제공한다.
- `draftDatabase.ts / write`: 현재 token과 expectedToken 불일치 또는 요청 localRevision이 저장 revision 이하이면 LocalDraftConflict다. Draft+Outbox transaction 전체를 rollback한다. 이 조건은 변경하지 않는다.
- `acceptServerAck / repository.acknowledge`: ACK도 token/revision·불변 operation snapshot을 검증한다. 서버 응답 성공과 로컬 ACK 성공은 다른 사건이다.
- `connect`: 이미 `seam-note-local-drafts-v1` BroadcastChannel 및 visibility/pagehide 확인이 있다. liveQuery나 두 번째 채널을 추가하지 않는다. 알림에는 본문을 싣지 않는다.
- 서버 expectedVersion409는 다른 서버 수정과의 충돌이다. IDB token/revision은 브라우저 안의 로컬 쓰기 소유권을 보호한다. Recovery Barrier는 최초 로컬 복구 전 서버 GET으로 초기화하지 못하게 하는 별도 장치다.

## 임시 복사본의 최소 변경안

`/private/tmp/seam-note-multitab-fix/frontend`에서 기존 Outbox/ACK 구조를 유지해 구현했다.

1. WorkingEntry에 **마지막 성공한 로컬 commit의 NoteDraft checkpoint**를 메모리로만 보관한다. read/write/ACK 성공 시 갱신한다. UI 최신 입력과 마지막 저장 내용은 다른 시점일 수 있다. sticky edited 플래그나 서버 dirty만으로 미commit 입력 여부를 판정하지 않는다.
2. 다른 탭 이벤트에서 IDB를 다시 읽는다. 읽는 동안 자기 쓰기/ACK/token이 바뀌면 그 결과를 적용하지 않는다. 자기 쓰기/ACK 중 도착한 확인 요청은 종료 후 확인하도록 보류한다.
3. 현재 제목·본문이 최신 IDB와 같으면 verified base/token/revision을 받아들인다. 미확정 작업을 삭제하지 않으며 serverProtected를 유지한다.
4. 현재 제목·본문이 마지막 commit checkpoint와 같으면 추가 메모리 입력이 없으므로 최신 IDB 내용을 반영한다. 예전에 편집한 탭도 마지막 commit 후 입력이 없으면 해당한다.
5. 현재 입력이 다르지만 IDB 제목·본문이 checkpoint와 같다면 metadata-only 후보이다. **동일 readonly transaction에서 Outbox가 없거나, 단 하나의 미전송 pending 작업이 저장 Draft의 title/content/baseVersion/localRevision과 일치함을 확인한 경우에만** 현재 입력을 새 base 위에 보존한다. 미확정 inFlight/conflict 또는 미확정 생성은 이 경로를 허용하지 않는다. 이 읽기 전용 projection은 DB에 저장하지 않는다.
6. 재조정 후에도 다음 쓰기는 관찰한 token과 더 큰 revision으로 **원래 transaction CAS**를 거친다. 그 사이 다른 탭이 다시 쓰면 다시 거부된다. 알림을 놓친 write CAS 실패는 1회 재확인하며 불확실하면 멈춘다. 저장소 token을 임의 발급해 통과시키지 않는다.
7. 양쪽 입력이 다르거나 checkpoint가 없거나 record가 사라졌거나 base가 뒤로 가면 자동 재조정하지 않는다. 현재 메모리와 기존 IDB/Outbox를 보존한다. 삭제를 “새 원고이므로 다시 생성 가능”으로 해석하지 않는다.
8. 상태를 `다른 탭과 로컬 충돌`로 구분하고 이유·새로고침/종료 전 유실 위험·재확인 절차를 알린다. 현재 입력 복사와 txt 다운로드를 제공한다. 다운로드 요청이 곧 파일 영속 보관 성공이라고 표현하지 않으며 사용자가 결과를 확인하게 한다. 입력이 바뀌면 이전 복사 완료 안내를 재사용하지 않는다.
9. 전체 동기화의 로컬 실패 목록에서 CAS 원인을 구분하고, 독립 원고는 계속 처리한다. 서버409 VERSION_CONFLICT·서버404 NOTE_NOT_FOUND 처리와 구별한다. unresolved 작업을 자동 반복하거나 새 ID로 교체하지 않는다.

이 정책은 **서로 다른 두 본문의 자동 병합이 아니다**. 자동으로 받아들일 수 없는 경우 사용자는 먼저 현재 입력을 복사/파일로 보관하고 다른 탭의 내용을 확인해야 한다. 어느 본문을 채택할지 선택하는 파괴적 동작이나 새 원고 복제 workflow는 이번 최소안에 넣지 않았다.

## 잠금과 미확정 ACK 경계

기존 global `seam-note:creation-sync` 및 원고별 manual-sync Web Lock은 서버 전송 경쟁을 제한한다. 로컬 Draft repository.write는 해당 global lock을 획득하지 않는다. 실제 PUT을 대기시켜도 다른 탭의 로컬 commit이 완료되는 것을 확인했다.

그 로컬 commit 때문에 A의 ACK fence가 달라지면 서버는 성공했어도 로컬 ACK가 거부될 수 있다. 이 경우 inFlight operationId/snapshot을 유지하고 사용자가 같은 키로 결과를 재확인하게 한다. 이를 자동으로 삭제하거나 “서버 저장·ACK 완료”라고 표시하지 않는다. 이 경계의 완전 자동 복구는 이번 범위가 아니다. 두 탭의 **아직 commit되지 않은 메모리**는 공유되지 않는다.

## 실행 결과와 보장 범위

- 격리 환경: Vite 후보25176, Spring18766, PostgreSQL25442 / `seam_note_manual_lab`. 설치 Chrome persistent profile을 시나리오별 새로 생성했다. 개발 DB15439/API18765 및 사용자 Chrome 프로필을 테스트에 사용하지 않았다.
- 변경 전 재현5개, 최종 후보 멀티탭 실증9개 통과. 같은 본문 ACK, clean observer, 알림 누락 CAS 후 안전 재조정, 다른 본문 충돌, 동시 local write, ACK 중 미commit 입력, 서버 lock 중 다른 탭 local commit, 로컬 record 삭제 시 memory 보존, 실제 전체 동기화의 충돌 원고 제외/독립 원고 ACK를 포함한다.
- 최종 후보 Node141개 통과(기존129+추가12), pnpm build/TypeScript 및 lint 통과. production 번들에 500kB 초과 경고가 있다. 성능 저하 수치를 측정하거나 개선률을 주장하지 않는다.
- `localDraftStorage.cjs`: 실제 UI+IDB 회귀 통과. BroadcastChannel 유/무의 서로 다른 본문 충돌에서 복사한 내용·다운로드 파일의 합성 입력 일치, 이탈 경고, 재확인 후 기존 저장 본문 보존을 추가 검증했다. 브라우저 재실행/느린쓰기/복구실패/transaction rollback도 기존 suite에서 확인했다.
- `manualSaveUx.cjs` 통과. production PWA10개 통과: 이전 DB 데이터 보존, cold launch/직접 URL/오프라인 편집·재실행, 수동 ACK, 503시 데이터 유지, worker update 대기/종료 후 적용.
- 실제 Spring/PostgreSQL production Workspace18개 회귀 통과. 409/404·부모 실패·응답 유실·같은 키 재시도·ACK rollback·두 탭 전송 경쟁·추가 입력·생성 후속 작업·로컬 실패 원고 제외·PWA 재실행을 포함한다. 이18개 실행 뒤 local CAS 오류 분류 분기만 추가했고, 최종141개 단위 테스트와9개 실제 멀티탭 테스트에서 최종 후보를 확인했다.18개 전부를 그 마지막 분기 추가 뒤 재실행했다고 주장하지 않는다.
- 전체 동기화 하네스 초기 실행에서 예상 ACK3/실제2, 다음 실행에서 local commit timeout이 있었다. 대기 조건이 URL과 이전 input의 readonly만 확인하던 약점이 있어 실제 editor data-note-id까지 기다리고 입력 전 ID를 assert하도록 보강한 최종 실행은18개 통과했다. **초기 두 실패의 원인이 제품인지 하네스인지 확정하지 못했으므로 해결된 제품 버그로 주장하지 않는다.** 최초 실패도 검증 JSON/log에 남긴다.
- Safari 미검증. 모든 브라우저 경고·clipboard 권한·OS 강제 종료를 보장하지 않는다. 새로고침 후 복구되는 것은 마지막 IDB commit이며 conflict 상태의 메모리 입력은 복사/파일 보관하지 않으면 사라질 수 있다.

## 재현과 패치 검토

1. `python3 scripts/manual-sync-lab.py --serve`로 기존 격리 lab을 실행하고 출력 fixture JSON을 사용한다. 실험 종료 시 lab 소유 프로세스만 종료한다.
2. 변경 전: `SEAM_NOTE_LAB_FIXTURE=<fixture.json> SEAM_NOTE_PLAYWRIGHT_MODULE=<playwright 경로> node frontend/tests/browser/multiTabConflictLab.cjs`.
3. 후보 frontend의 Vite를 별도 origin으로 실행하고 `SEAM_NOTE_API_TARGET`을 격리 Spring으로 설정한다. 실행 중인 개발 프론트와 분리하고 Vite cacheDir도 별도 지정한다.
4. 후보 검증: 위 fixture/Playwright 환경변수와 `SEAM_NOTE_MULTITAB_ORIGIN`, `SEAM_NOTE_MULTITAB_SOURCE_ROOT`를 설정해 `multiTabConflictAfter.cjs` 실행. 보고서는 candidate-after JSON에 기록한다.
5. 실제 적용 전 원고 입력의 메모리 유실 위험을 알리고 대기했다. 이후 사용자가 개발 환경에 적용하라고 명시적으로 요청해 패치 검사·적용·해시 확인을 수행했다. 사용자 요청을 입력 보관 완료의 증거라고 기록하지 않는다. 기존 다른 미커밋 변경은 보존했고 commit/push하지 않았다.

관련 결과: verification의 multitab-before / candidate-after / candidate-manifest / validation / workspace-regression / pwa-regression JSON. 사용자 실제 제목·본문은 기록하지 않았다. 합성 원고도 비교에는 해시·UUID·버전만 남겼다.

## 실제 소스 적용 후 최종 확인

사용자 적용 요청 후11개 파일이 검증 후보 해시와 일치함을 확인했다. 실제 프로젝트에서 pnpm test141개/build/TypeScript/lint를 재실행해 통과했다. 별도 Vite origin/cache·격리 Chrome·mock API로 localDraftStorage(두 탭 충돌, 입력 복사/txt 보관, 이탈 경고 포함)와 manualSaveUx 두 suite도 통과했다. 개발 DB에 테스트 요청을 보내거나 IndexedDB를 초기화하지 않았다. 실행 근거는 `docs/verification/2026-10-27-multitab-applied.json`에 있다. commit/push하지 않았다.
