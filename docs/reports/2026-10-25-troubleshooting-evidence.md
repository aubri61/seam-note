# Seam Note — 트러블슈팅 이력 감사와 경쟁 상태 실측

조사일: 2026-10-25. 기능 수정 없이 Git/문서/소스/테스트를 조사하고, 독립 연구 하네스로 실제 Chrome·IndexedDB를 실행했다. 합성 원고만 사용했다. 이 문서는 면접용으로 **발생한 버그와 예방 설계의 주장을 구분**하기 위한 근거다.

## 1. 먼저 확인한 결론과 엄격한 분류

| 사례 | 분류 | 실제 확인한 것 | 표현하면 안 되는 주장 |
| --- | --- | --- | --- |
| A. GET이 로컬 Draft를 덮는 복구 경쟁 | **코드 분석으로 위험을 식별하고 사전 예방함** | IndexedDB 도입부터 barrier가 있다. 160회 도착 순서 실험에서 로컬 원고 보존. 가상 수신 대입 모델의 오류만 별도 재현 | 실제 사용자 원고가 GET에 의해 손실돼 장애를 복구했다 |
| B. 저장 중첩/역전·멀티탭 경쟁 | **실제로 재현한 위험을 방어함** | 현재 생산 모듈을 실제2개 page에서 실행해 동일 token/revision 경쟁20회 및 stale 요청40회 거부 확인. 단일 탭 쓰기 역전은 도입 시 사전 예방했으며 가상 naive 비교만 실패 | 기존 제품에 무조건 put이 있었고 그 때문에 실제 데이터 손실이 발생했다; IndexedDB가 생성된 rw transaction 순서를 임의 역전한다 |
| C. Query/Draft 혼재로 편집 손실 | **코드 분석으로 위험을 식별하고 사전 예방함** | 실제 API 연결 단계는 읽기 전용이었다. 편집 도입 커밋부터 별도 Draft/dirty 보호가 있다. 독립 상태·재조회 회귀 검증 | Query 객체를 직접 편집하던 실제 API 연결 버그를 고쳐 원고 유실을 복구했다 |
| D. 사이드바 제목 불일치 | **실제 버그를 발견하고 수정함** | 실제 과거 소스9789b32를 실행해10/10 불일치 재현. 현재 작업본10/10 일치. 이전 요청에서 수정된 상태를 이번에는 측정만 함 | 제목 편집이 서버에 저장되거나 동기화됐다는 의미로 Query까지 변경했다 |

B의 분류는 '멀티탭의 실제 stale write 시도와 CAS 거부가 재현됨'을 가리킨다. **단일 탭의 실제 과거 데이터 손실 이력은 없다.** 이를 구분하지 않는 면접 설명이라면 B도 '단일 탭 위험은 사전 예방'이라고 명시해야 한다. 현재 코드의 방어가 통과한 것 자체를 수정 전 버그가 있었다는 증거로 삼지 않았다.

## 2. Git과 작업 기록 대조

- `97d2f0f4f91f62551e21cef016e19618e7e2377a`: 실제 Workspace API 연결. 당시 `NoteEditor.tsx:118,125,142`는 ID 검증 후 Query Note를 표시하고 제목/본문이 `readOnly`였다. 이 단계에는 사용자가 서버 응답과 경쟁하는 편집 기능이 없었다.
- `58c765850e30e33fd111edb2248aa73f84409ed4`: 메모리 Draft 도입. `useNoteDrafts.ts:10–34`에서 독립 state와 함수형 updater, `noteDrafts.ts:25–40`에서 dirty/단조 version 정책을 처음부터 도입했다. 같은 커밋의 FolderTree는 여전히 nodeLabel(server NoteSummary)을 렌더링했다.
- `9789b32e2fc5be16d977d53d9fb89e94b6bc6e8b`: URL 라우팅과 Draft 수명 보존. 이번 D 비교에서 실제 archive로 실행한 과거 소스다.
- HEAD `5fff38007bff4c1bcb8b65252dca999598ccea3e`: 위 브랜치 merge. 현재 `feat/offline-local-storage`의 IndexedDB/제목 수정은 **미커밋 작업본**이다. 존재하지 않는 'IndexedDB 수정 커밋'을 인용하지 않았다. `git diff`는 tracked 변경만 포함하므로 신규 local-drafts 파일은 실제 파일과 SHA-256도 확인했다.
- [Draft 작업 이력](../worklogs/2026-10-25-note-drafts.md), [로컬 저장 이력](../worklogs/2026-10-25-local-draft-storage.md), [제목 수정 이력](../worklogs/2026-10-25-sidebar-draft-title.md)을 대조했다. 로컬 troubleshooting의 A/B/C 설명도 '관측된 원고 손실이 아니라 코드 기반 예상 위험'이라고 기록돼 있다. D는 실제 표시 불일치를 기록했다.

각 결과 JSON의 manifest는 HEAD/branch/미커밋 여부/현재 관련5개 소스의 SHA-256을 가진다. 커밋은 없지만 어떤 코드에서 실행했는지는 해시로 식별할 수 있다. 이 조사에서 제품 소스/서버 API/스키마를 변경하지 않았다.

## 3. 근거 코드와 테스트 위치

| 사례 | 실제 함수/위치 | 확인되는 책임 | 회귀 근거 |
| --- | --- | --- | --- |
| A | [draftSession.ts](../../frontend/src/features/local-drafts/draftSession.ts) `recover:102–130`, `receive:132–137`, `applyServer:138–146` | 로컬 read 완료 전 서버 snapshot 보류, 읽기 오류를 없음으로 처리하지 않음 | [localDraftStorage.test.mjs](../../frontend/tests/localDraftStorage.test.mjs)57,70,162,172행; [실제 IDB 브라우저](../../frontend/tests/browser/localDraftStorage.cjs) delay/read 관련 시나리오; 이번 measure.cjs `recovery` |
| A/C | [noteDrafts.ts](../../frontend/src/features/notes/noteDrafts.ts) `receiveServerNote:25–40`, `editDraft:43–50` | dirty면 title/content/base 유지, clean만 더 높은 서버 버전 채택 | [noteDrafts.test.mjs](../../frontend/tests/noteDrafts.test.mjs)22,49,57,69,91행; 이번 `state` |
| B | [draftSession.ts](../../frontend/src/features/local-drafts/draftSession.ts) `schedule:156–166`, `flush:167–186` | 예약, 단일 in-flight write, 최신 revision 후속 저장, 해당 snapshot만 ack | localDraftStorage.test.mjs79,94,106,183행; 이번 `writes`,`reversal`,`tabs` |
| B | [draftDatabase.ts](../../frontend/src/features/local-drafts/draftDatabase.ts) `write:49–65` | 같은 rw transaction에서 token/revision 비교 + put + 전체commit 확인 | localDraftStorage.cjs259행부터 두 탭, 이후 atomic CAS/stale revision/abort; 이번 tabs의추가guards |
| C | [useNoteDrafts.ts](../../frontend/src/features/notes/useNoteDrafts.ts)9–37행, [AppLayout.tsx](../../frontend/src/app/AppLayout.tsx)47,160행 | 부모 수명의 session, useSyncExternalStore, selectedId 검증, 편집/Query 분리 | noteDrafts.cjs의 late/dirty/clean/in-flight 재조회, noteRouting.cjs의Back/Forward, 이번state |
| C | [notePresentation.ts](../../frontend/src/features/notes/notePresentation.ts)4행, [NoteEditor.tsx](../../frontend/src/features/notes/NoteEditor.tsx)124,135,153행 | 다른 ID의 응답 차단, controlled input이 해당Draft만 수정 | noteDrafts.test.mjs91행, noteDrafts.cjs의늦은C→B |
| D | useNoteDrafts.ts12–15행, AppLayout.tsx128행, [Sidebar.tsx](../../frontend/src/app/sidebar/Sidebar.tsx)의draftTitles 전달, [FolderTree.tsx](../../frontend/src/features/folders/FolderTree.tsx)85,92,113행 | ID별 React 제목을 렌더링 시만 우선, 빈 제목 nullish 처리 | [sidebarDraftTitles.cjs](../../frontend/tests/browser/sidebarDraftTitles.cjs)50–103행, 모바일108행부터; 이번history |

코드 위치는 위 manifest의 작업본 기준이다. 최종 코드가 변경되면 함수명과 해시를 함께 확인해야 한다.

## 4. 측정 환경·방법

Apple M1 Pro / RAM32GiB / macOS26.6.2(Darwin25.6.0) arm64 / Node20.20.0 / 설치된 headless Chrome155.0.8059.86. 개발 Vite8.3.5, React19.3.1, TanStack Query5.104.5, Dexie4.4.7. viewport1280×720. CPU/디스크를 독점하거나 throttling하지 않았다. production bundle 성능 실험이 아니다.

현재와 과거 소스는 연구용25173/25174 서버로 제공했다. 실제 사용자5173 프로세스를 중지하거나 설정을 편집하지 않았다. 모든 최종 실험 API는 GET mock으로 한정했다. 격리 Chrome context는 각각 새 origin storage를 가지며 실제 IndexedDB를 사용한다. 과거 스냅샷은 현재 의존성 설치물을 재사용하므로 당시 환경의 완전한 binary 복원은 아니다.

[실행 코드](../measurements/2026-10-25-draft-concurrency/measure.cjs), [측정 정의·재현 방법](../measurements/2026-10-25-draft-concurrency/README.md), 원시결과 recovery/writes/tabs/reversal/state/history.json을 함께 보관한다. 결과에는 UUID/version/SHA-256/시간/횟수만 있고 원고 본문·제목은 없다. 모든 본문은 합성fixture다.

Recovery와 writes는 phase 내부 최대4개 격리 context를 병렬 실행하고 phase끼리는 순차 실행했다. 이탈/종료/기기 재시작/스토리지 회수는 이 수치의 범위 밖이다. percentile은nearest-rank이며 시나리오별n=10의p95/p99는 관측최대라 운영tail/SLA로 일반화하지 않는다.

## 5. A — GET과 로컬 복구

### 1) 실제 위험과 근본 원인

서버 상태와 로컬 Draft는 독립적인 비동기 출처다. GET이 먼저 왔다고 즉시 clean Draft를 만들고 저장하면 아직 읽지 않은 로컬 dirty 원고를 대체할 수 있다. 로컬 복구가 먼저여도 뒤늦은 GET을 무조건 대입하면 화면이 서버 snapshot으로 돌아간다. 과거에는 IndexedDB 자체가 없었으므로 이 복구 경쟁에 의한 과거 제품 장애는 확인되지 않았다.

### 2) 선택한 방어 — 왜 트러블이 나지 않았는가

선택 ID별 `entry.reading` promise가 Recovery Barrier다. `receive()`는 서버 snapshot을 보관하지만 `ready` 전에는 적용하지 않는다. `recover()`가 로컬 사본·기준 version·token을 먼저 확립한 뒤 `applyServer()`를 호출한다.

순서 제어만으로 끝내지 않았다. `receiveServerNote()`는 dirty인 원고의 제목·본문·baseVersion을 유지하고 최신 관측 서버 version만 기록한다. clean일 때만 더 높은 서버 snapshot을 채택한다. 따라서 '나중에 온 응답 우선'이나 '로컬은 항상 최신' 같은 가정 없이 두 출처를 조정한다.

로컬 read 실패도 '데이터 없음'과 구분한다. 서버 snapshot으로 메모리 편집은 허용할 수 있지만 blind write는 막는다. 재시도에서 서로 다른 dirty 로컬/메모리 사본이 드러나면 어느 쪽도 자동 폐기하지 않고 충돌로 멈춘다. StrictMode의 반복 선택은 진행 중인 read를 공유해 빈 초기화를 저장하지 않는다. 이것이 서버 선도·로컬 선도 모두에서 원고가 보존된 이유다.

### 3) 측정 환경과 실제 수치

서버 지연 0/100/500/1000ms × 로컬 첫 read 지연 0/100/500/1000ms × 각 10회 = **160회**다. 로컬 사본은 baseVersion 2의 dirty 원고 20,000자, 서버 snapshot은 version 1이다.

- 현재 React textarea와 DB 최종 해시: fixture와 **160/160회 일치, 보존율 100%**.
- 최종 화면 덮어쓰기: **0회**. 최종 화면의 출처는 160회 모두 로컬이다.
- 복구 실험 중 저장 시도: **0회**. 오래된 GET 때문에 로컬 사본을 다시 쓰지 않았다.
- 같은 callback 도착 순서에 마지막 데이터를 대입하는 **가상 비교 변수**: 로컬 선택 77/160회, 서버 선택 83/160회.
- t0 상대 로컬 read 완료 p50/p95/p99: **609.9 / 1394.0 / 1662.9ms**.
- t0 상대 Axios 응답 완료 p50/p95/p99: **745.2 / 1429.2 / 1672.3ms**.

[16조합별 표와 실제 read 구간 시간](../measurements/2026-10-25-draft-concurrency/summary.md), [실행별 원시 결과](../measurements/2026-10-25-draft-concurrency/recovery.json)를 제공한다. t0는 fixture seed와 계측용 모듈 import 뒤, app main import 직전이다. 위 시각은 앱 로딩·mount를 포함하며 순수 디스크 I/O 지연이 아니다. UI는 양쪽 완료 후 50ms에 관찰했다. read 완료는 repository 반환 시점으로, 실제 paint 시간은 측정하지 않았다.

가상 모델은 과거 제품 코드도, 별도 React 비교 UI도, DB를 덮은 구현도 아니다. 따라서 83회를 '실제 프로젝트의 원고 손실'이나 제품 오류율 개선률로 사용할 수 없다.

### 4) 대안과 트레이드오프

| 대안 | 선택하지 않은 이유 / 현재 방식의 비용 |
| --- | --- |
| 로컬 복구 후에만 GET 시작 | 순서는 단순하지만 네트워크와 I/O가 직렬화된다. 현재는 병렬 시작 후 적용 순서를 제어한다. |
| 수정 시각이 큰 사본 선택 | 장치 시계·로컬 저장 시각과 서버 version은 비교 가능한 동일 척도가 아니다. |
| 모든 진입에서 사용자에게 사본 선택 요청 | 보수적이지만 정상 진입의 UX 비용이 높다. 현재는 dirty 보존/clean 갱신 규칙을 적용한다. |
| 복구 전부터 빈 입력 허용 | 기존 사본을 읽기 전에 만든 새 편집과의 추가 충돌이 생긴다. 현재는 복구 대기만큼 편집 시작이 늦어지는 비용을 수용했다. |

### 5) 테스트가 보장하는 것과 보장하지 않는 것

지정한 도착 순서·fixture에서 최종 원고를 보존한 회귀 근거다. 모든 기기·브라우저·실패 모드에 대한 무오류 증명은 아니다. 주 실험의 서버 버전은 기준보다 낮다. 더 높은 서버 version에서 dirty/clean이 어떻게 동작하는지는 C의 별도 실험과 기존 테스트로 검증했다. 최종 화면 검사이므로 모든 중간 프레임의 무깜박임이나 저장소 회수 후 복구까지 보장하지 않는다.

### 6) 포트폴리오용 3줄

> IndexedDB 도입 시 서버 GET과 로컬 복구의 경쟁을 사전에 식별하고, 조회 병렬성은 유지하면서 적용 순서를 제어하는 Recovery Barrier를 설계했습니다.\
> 실제 Chrome IndexedDB에서 16개 지연 조합을 각각 10회 실행해 dirty 로컬 원고를 160/160회 보존했습니다.\
> 예방 설계임을 명시하고, 가상 대입 모델의 실패와 실제 제품의 검증 결과를 구분했습니다.

### 7) 예상 면접 꼬리 질문 5개

1. **await 하나면 해결되지 않나?** 하나의 완료만 기다려서는 다른 callback의 독립적인 초기화를 막지 못한다. ID별 복구 상태와 서버 적용 정책이 함께 필요하다.
2. **GET을 취소하면 충분한가?** 취소는 자원 절약이다. 이미 도착했거나 캐시된 응답의 정합성까지 보장하지 않으므로 ID/dirty/version 검증이 최종 방어다.
3. **read 실패와 데이터 없음은 왜 다른가?** 실패한 저장소에 기존 원고가 있을 수 있다. 없음으로 간주하고 put하면 검증하지 않은 사본을 덮게 된다.
4. **StrictMode effect 재실행은 어떻게 처리했나?** 생성자에는 I/O가 없고 진행 중인 read를 공유한다. 구독·채널은 cleanup하되 선택 전환으로 session을 폐기하지 않는다.
5. **서버 version이 더 높다면?** dirty 내용과 기준은 유지하고 관측 version만 갱신한다. clean일 때만 기준을 옮기며 실제 서버 저장에는 후속 expectedVersion/409 계약이 필요하다.

## 6. B — 직렬 쓰기, revision과 token CAS

### 1) 실제로 재현한 위험과 근본 원인

서로 다른 탭이 같은 기준에서 독립 편집하면 두 writer가 같은 localRevision을 만들 수 있다. 이번 실험에서는 실제 두 page가 같은 token·revision 7을 읽고 각각 revision 8을 만든 뒤 저장을 요청했다. 한 요청이 commit되고 다른 요청이 CAS로 거부되는 현상을 20회 확인했다. 실제 사용자 원고의 유실을 관측한 것은 아니다.

단일 탭의 저장 역전 위험은 도입 시 사전 예방한 것이다. 기존 제품에 무조건 put이 있었던 것은 아니다. **IndexedDB의 readwrite transaction 자체가 임의로 역전된다는 설명은 부정확하다.** 같은 store를 scope로 하는 readwrite transaction은 직렬 접근한다. 다만 transaction 앞의 비동기 작업 때문에 old 입력의 transaction이 new 입력보다 늦게 만들어지면, 무조건 put은 업무상 오래된 입력을 마지막에 저장할 수 있다. 원자성과 '최신 편집' 판단은 별개다.

### 2) 선택한 방어 — 왜 트러블이 나지 않았는가

노트별 `entry.writing`으로 한 번에 한 요청만 진행한다. 입력은 즉시 메모리에 반영하고 localRevision을 증가시킨다. 400ms debounce·최대 2초 예약·전환 flush로 저장을 모으며, 쓰기 중 추가 입력은 최신 snapshot으로 후속 저장한다. 성공 시 해당 snapshot의 revision만 ack한다. 최신 입력과 revision이 다르면 중간 commit을 '전체 저장 완료'로 표시하지 않는다.

다른 탭의 localRevision은 같아질 수 있어 숫자만으로 소유권을 판단하지 않는다. 마지막으로 읽은 opaque storageToken을 expectedToken으로 전달하고, **하나의 rw transaction 안에서 read → token 비교 → revision 증가 검사 → put**을 수행한다. 다음 transaction은 첫 transaction이 바꾼 token을 읽으므로 stale 요청을 거절한다. 큰 revision이라도 token이 낡으면 거절하고, token이 맞아도 revision이 현재 이하면 거절한다.

BroadcastChannel은 변경 사실을 일찍 알리는 수단이고 transaction CAS가 최종 안전장치다. 두 탭 수치 실험은 production session/repository를 실제 두 page에서 실행하되 `connect()`를 호출하지 않아 채널의 선제 차단 없이 CAS 자체를 검증했다. full UI의 채널 지원/차단은 기존 브라우저 회귀로 별도 검증했다.

소스의 fallback listener는 `visibilitychange`/`pagehide`다. **별도 window focus listener는 없다.** 이전 문서의 'focus 확인'을 전용 focus 이벤트 구현으로 인용해서는 안 된다.

### 3) 측정 환경과 실제 수치

전체 길이 20,000 UTF-16 code units인 textarea 값을 바꾸는 input 이벤트를 사용했다. native setter와 bubbling input 이벤트로 React onChange를 실행했다. 사람이 입력한 trusted key 이벤트는 아니다. write 지연은 실제 transaction **밖**에서 주입했다.

| 입력수 × 반복 | 예약 간격 / 실측 간격 p50(ms) | write 주입 지연(ms) | 입력 합계 | attempt / commit / CAS / 비CAS 실패 | 최종 보존 | 마지막 input→commit p50 / p95 / p99(ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 35 × 10 | 5 / 20.9 | 0 | 350 | 10 / 10 / 0 / 0 | 10/10 | 407.3 / 411.1 / 411.1 |
| 35 × 10 | 80 / 88.3 | 600 | 350 | 20 / 20 / 0 / 0 | 10/10 | 1009.4 / 1012.0 / 1012.0 |
| 100 × 10 | 5 / 19.0 | 0 | 1000 | 10 / 10 / 0 / 0 | 10/10 | 126.7 / 234.8 / 234.8 |
| 100 × 10 | 25 / 32.6 | 800 | 1000 | 20 / 20 / 0 / 0 | 10/10 | 1208.6 / 1210.0 / 1210.0 |

총 **2,700 input / 60 attempt / 60 commit**, CAS·비CAS 실패 모두 0, 마지막 입력 보존 **40/40회(100%)**, maxActive는 모두 1이었다. 시나리오별 latency 표본은 10개라 p95/p99는 관측 최대값이다. commit 시각은 transaction promise 성공 시점이며 해시 계산은 그 뒤에 수행했다.

예약 간격 5ms는 매 입력 뒤 setTimeout 대기값이다. 실제 간격에는 React의 20k 문자열 처리와 task 스케줄링이 포함된다. '5ms마다 처리했다'고 주장하지 않는다. 100회 빠른 입력의 최종 commit이 400ms보다 빠른 경우는 2초 최대 대기 예약이 이미 진행 중이었기 때문이다. 기존 35입력/3시도 기록과 이번 35입력/2시도는 입력 간격과 환경이 달라 추가 개선율로 비교하지 않는다.

| 두 탭 / guard 실험 | 요청 | commit | CAS 거부 | 비CAS 실패 |
| --- | --- | --- | --- | --- |
| 두 탭 동일 기준 경쟁 20회 | 40 | 20 | 20 | 0 |
| 큰 revision + 오래된 token | 20 | 0 | 20 | 0 |
| 최신 token + 낮은 revision | 20 | 0 | 20 | 0 |
| 합계 | **80** | **20** | **60** | **0** |

두 메모리 사본은 각자의 입력 해시를 20/20회 유지했고 DB에는 매번 승자 하나만 저장됐다. 거부된 사본은 저장 완료가 아니며 새로고침하면 잃을 수 있다. 저장 '실패'를 모든 reject로 세면 60회지만 모두 의도한 CAS 거부다. 디스크·권한 등 비CAS 실패는 이 실험에서 0회였다. 승자의 명시 flush latency와 패자의 null latency는 [집계](../measurements/2026-10-25-draft-concurrency/summary.md)에 별도 제공한다.

가상 역전 비교도 20회 실행했다. old 입력 → 20ms → latest 입력, 첫 요청의 transaction 전 대기 200ms / 둘째 0ms라는 같은 조건이다. 무조건 put은 완료 revision이 [9,8]로 최신 입력 보존 0/20회, 실제 session은 [8,9]로 20/20회 보존했다. 이는 **가상 naive와 실제 현재 구현의 비교**이며 실제 과거 Before는 아니다.

### 4) 대안과 트레이드오프

- 매 입력 put은 간단하지만 큰 본문의 복제와 transaction 횟수를 늘린다. debounce는 작업을 줄이는 대신 마지막 입력의 미commit 구간을 만든다.
- Web Locks는 협력하는 탭 사이의 잠금 대안이지만 stale 기준 판단과 서버 동시성은 별도다. CAS는 저장소 head 자체를 검증한다.
- revision만 비교하면 서로 다른 writer가 같은 번호를 만들 수 있다. UUID token은 관측한 head의 동일성을 확인한다.
- LWW나 자동 병합 대신 충돌을 드러내고 중단했다. 충돌 사본의 별도 영속 보관·비교 복원 UX는 아직 없다.
- 같은 store를 rw scope로 사용하므로 다른 noteId의 transaction도 저장소에서 대기할 수 있다. 여러 원고의 동시 저장 처리량은 측정하지 않았다.

### 5) 보장과 한계

최종 입력의 해시 보존과 stale 거부를 실증했지만 두 탭의 입력 모두를 영속화하는 협업 편집 기능은 아니다. 주입한 600/800ms는 실제 디스크 지연 분포가 아니다. transaction promise 성공은 브라우저 commit ack이며 모든 정전 상황의 fsync 보장이 아니다. 종료 전 미commit 입력, 저장소 회수, 메모리 충돌 사본의 소실은 여전히 가능하다.

### 6) 포트폴리오용 3줄

> 로컬 저장 도입 때 노트별 직렬 쓰기와 revision별 commit ack를 설계해, 느린 중간 저장을 최신 편집 전체의 저장 완료로 오인하지 않도록 했습니다.\
> 2,700개 React input 이벤트를 포함한 40회 실험에서 마지막 입력을 모두 보존하고, 두 탭 경쟁 20회에서 stale 요청 20개를 CAS로 거부했습니다.\
> 독립 탭의 동일 revision 문제는 token 비교를 같은 IndexedDB transaction에 넣어 방어했으며 충돌 사본의 영속화 한계도 명시했습니다.

### 7) 예상 면접 꼬리 질문 5개

1. **transaction이면 CAS가 불필요하지 않나?** transaction은 원자성과 직렬성을 제공한다. 현재 head가 편집 기준과 같은지 판단하는 업무 검증은 CAS가 담당한다.
2. **비교와 put을 분리하면 안 되나?** 두 transaction 사이에 다른 탭이 쓸 수 있다. 이 TOCTOU를 막으려면 같은 rw 범위에서 비교와 쓰기를 수행해야 한다.
3. **token과 revision은 어떻게 다른가?** token은 관측 head의 동일성, localRevision은 편집·ack 순서다. 둘 다 서버 @Version/expectedVersion과 다른 개념이다.
4. **transaction 안에서 setTimeout을 await하면?** 요청이 없으면 transaction이 자동 commit·비활성화될 수 있다. 계측용 지연은 밖에 두고 실제 transaction은 DB 요청만 기다렸다.
5. **쓰는 동안 입력이 바뀌면 saved는 언제인가?** 성공한 revision만 ack한다. 현재 revision과 다르면 후속 쓰기를 유지하며 flush promise 반환만으로 최신 전체 저장을 단정하지 않는다.

## 7. C — Query 서버 상태와 편집 상태의 분리

### 1) 식별한 위험과 근본 원인

서버 캐시는 재조회·공유·폐기할 수 있는 snapshot이다. 사용자 미저장 입력은 다른 수명과 의미를 갖는다. Query Note를 직접 바꾸거나 응답마다 입력 state를 초기화하면 다른 subscriber가 미저장 값을 서버 사실처럼 보고, 재조회가 편집을 되돌릴 수 있다.

다만 실제 API 연결 단계는 readOnly였고, 편집 도입 커밋 58c7658부터 Draft를 분리했다. 따라서 '혼재로 원고가 손실된 실제 장애를 나중에 고쳤다'는 이력은 없다.

### 2) 선택한 방어 — 왜 트러블이 나지 않았는가

AppLayout이 부모 수명의 session을 소유하고 noteId별 Draft를 보관한다. Query Key에도 noteId를 포함하며, 수신 응답 ID와 선택 ID를 검증한다. NoteEditor도 자기 Draft의 noteId를 다시 확인한다. 이전 A 응답이 늦어도 현재 B의 입력을 초기화하지 않는다. URL 선택과 원고 내용은 별도 책임이며 noteId를 key로 부모 전체를 remount하지 않는다.

과거 Hook의 함수형 setState updater는 closure의 오래된 drafts 대신 큐의 최신 state를 받았다. 현재 session은 동기 edit → 새 Draft → 새 snapshot 발행을 수행하고 React가 `useSyncExternalStore`로 구독한다. 변경 전까지 snapshot 참조를 유지하고 변경 시 새 객체를 발행한다. 가변 내부 entry를 그대로 React 렌더링 데이터로 노출하지 않는다. 이는 외부 store 구독과 React의 동시 렌더링 사이에서 일관된 snapshot을 제공하기 위한 계약이다.

상세 Query의 staleTime 30초는 신선도 정책이지 편집 잠금이 아니다. Workspace의 Infinity도 명시적 refetch/invalidate를 막지는 않는다. structural sharing은 참조 최적화이지 dirty 보호가 아니다. 자동 재조회를 모두 막는 대신 `receiveServerNote()`가 dirty를 보호한다. POST 성공 응답을 캐시에 넣는 기존 생성 Mutation은 확정된 서버 snapshot 갱신으로, 로컬 입력을 캐시에 쓰는 것과 다르다.

### 3) 측정 환경과 실제 수치

초기 clean baseVersion 2에서 version 3의 GET을 100ms 지연해 재조회했다. dirty군은 요청을 시작한 뒤 응답을 기다리는 동안 20,000자 입력을 수정했다. 각 군 10회, 총 20회 실행했다.

| 군 | 횟수 | 최종 화면 | Query snapshot | 저장된 기준 / 관측 version | 결과 |
| --- | --- | --- | --- | --- | --- |
| clean | 10 | 새 서버 내용 | 서버 v3 | base 3 / latest 3 | 서버 갱신 10/10 채택, dirty=false |
| dirty | 10 | 요청 중 편집한 내용 | 서버 v3 | base 2 / latest 3 | 입력·기준 10/10 보존, dirty=true |

Query는 20회 모두 새 서버 내용의 해시를 유지했다. dirty군의 UI 해시는 서버 캐시 해시와 달랐으며 이것이 의도한 상태 분리다. 로컬 commit이 완료돼도 dirty는 true였고 baseVersion이 서버 관측값으로 몰래 올라가지 않았다. 원시 결과는 [state.json](../measurements/2026-10-25-draft-concurrency/state.json)에 있다.

### 4) 대안과 트레이드오프

- Query 캐시에 입력을 넣을 수도 있지만 확정 snapshot과 draft/conflict/saving을 구분하는 별도 모델이 필요하다. 현재는 서버 캐시의 의미를 단순하게 유지했다.
- NoteEditor 내부 useState는 간단하지만 전환·언마운트에 취약하다. 부모의 ID 맵은 여러 원고를 보존하는 대신 메모리를 더 사용한다.
- 전역 상태 라이브러리는 새 의존성과 소유권을 만든다. 현재는 AppLayout 수명의 session과 React 구독으로 필요한 범위를 충족했다. 탭 간 메모리는 공유되지 않으므로 CAS는 별개다.

### 5) 보장과 한계

dirty는 기준 title/content와의 문자열 비교다. 로컬 commit은 서버 dirty를 해제하지 않고 baseVersion도 올리지 않는다. 서버 저장·자동 병합은 없다. 이 검증이 큰 원고의 복제·비교 비용이나 모든 원고의 메모리 상한까지 해결했다는 뜻은 아니다. 늦은 다른 ID 응답과 A/B 전환은 기존 회귀로 확인했으며 이번 20회 수치 실험은 동일 노트 재조회에 집중했다.

### 6) 포트폴리오용 3줄

> 실제 API 연결은 읽기 전용으로 시작했고, 편집 기능 도입 시 서버 Query와 노트별 Draft를 처음부터 분리했습니다.\
> 재조회 중 입력 실험에서 dirty 10개는 입력과 기준 버전을 보존하고 clean 10개는 새 서버 버전을 채택했습니다.\
> 늦은 응답·노트 전환을 회귀로 검증했으며, 발생하지 않은 원고 유실 장애를 수정했다고 과장하지 않았습니다.

### 7) 예상 면접 꼬리 질문 5개

1. **staleTime Infinity면 충분하지 않나?** 명시적 refetch와 캐시 갱신은 가능하다. 신선도 설정은 편집 보호 정책을 대체하지 않는다.
2. **setState 직후 읽으면 최신인가?** 현재 렌더 closure는 바뀌지 않는다. 과거 구현은 함수형 updater를, 현재는 동기 session 갱신과 snapshot 구독을 사용한다.
3. **useSyncExternalStore의 주의점은?** 변경 전 snapshot 참조는 안정적이어야 하고 변경 후에는 새 immutable snapshot을 제공해야 한다. 가변 객체를 그대로 반환하면 안 된다.
4. **A의 늦은 응답은 취소로만 해결할 수 있나?** 취소는 최적화다. 결과를 다른 ID에 할당하지 않는 의미 검증이 필요하다.
5. **왜 dirty의 baseVersion을 유지하나?** expectedVersion은 실제 작성 기준을 표현해야 한다. 병합 없이 기준만 최신으로 옮기면 후속 충돌 검증을 우회하게 된다.

## 8. D — 사이드바 제목의 실제 불일치

### 1) 실제 문제와 근본 원인

58c7658부터 에디터는 React Draft 제목을 표시했지만 FolderTree는 서버 NoteSummary.title을 계속 표시했다. 상태 분리는 올바랐으나 화면별 표시 정책 연결이 빠져 서로 다른 제목이 보였다. 실제 UI 버그지만 원고 손실이나 서버 오염 버그는 아니다.

### 2) 선택한 해결 방식

useNoteDrafts가 noteId별 draftTitles를 파생하고 AppLayout → Sidebar → FolderTree로 전달한다. 텍스트와 tooltip에 `(draftTitles[id] ?? serverTitle) || '제목 없음'`을 적용한다. `??`는 빈 문자열도 유효한 로컬 값으로 취급한다. 마지막 fallback은 표시 전용이다.

React snapshot 갱신을 사용해 입력 즉시 반영하며 IndexedDB commit을 기다리지 않는다. Query 캐시에 저장된 것처럼 반영하거나 입력마다 GET을 보내지 않는다. ID별 맵이 A/B 제목을 분리하고, 복구 시 같은 snapshot 갱신이 사이드바에도 전달된다.

### 3) 실제 과거 Before/After 수치

과거 9789b32를 archive한 소스와 현재 작업본을 각각 10회 실행했다. 같은 mock Note·제목 입력·500ms 관측 창을 사용했다.

| 구현 | 에디터 입력 성공 | 사이드바 일치 | 불일치 |
| --- | --- | --- | --- |
| 실제 과거 9789b32 | 10/10 | 0/10 | **10/10** |
| 현재 작업본 | 10/10 | **10/10** | 0/10 |

이는 실제 소스의 기능 정합성 비교다. 렌더 속도 개선률은 측정하지 않았다. 과거에는 IndexedDB가 없어 A/B의 역사적 비교에 이 소스를 쓰지 않는다. 의존성은 현재 설치물을 재사용했으므로 당시 실행 환경의 완전 복원도 아니다.

기존 sidebarDraftTitles.cjs도 이번에 재실행했다. write를 1초 늦춰 DB에 이전 제목이 남은 상태에서 새 사이드바 제목을 확인한다. 600ms 입력 구간의 추가 GET 0개, Query 제목 불변, dirty 재조회·A/B·빈 제목·reload·모바일·정렬·선택·URL 유지도 검증한다.

### 4) 대안과 트레이드오프

- Query/트리 DTO 수정은 공유 서버 snapshot의 의미를 바꾸므로 렌더링 projection을 택했다.
- IndexedDB 성공 후 갱신하면 debounce와 실패에 화면이 종속된다. 화면은 현재 React Draft를 기준으로 삼았다.
- 새 전역 제목 store 대신 얕은 props 연결로 기존 소유권을 유지했다.
- 제목 검색까지 바꾸면 필터 결과와 포커스가 달라질 수 있다. 기존 검색 정책은 이번 수정에서 유지했다.

### 5) 보장과 한계

아직 선택·복구하지 않아 메모리에 없는 로컬 원고는 서버 요약 제목을 표시한다. 전체 IndexedDB 선조회는 없다. 검색도 서버 메타데이터 기준이라 보이는 제목과 검색어 매칭이 다를 수 있다. 제목 맵 재계산과 전체 트리 렌더 비용은 측정하지 않았다. '즉시'는 DB commit을 기다리지 않는다는 뜻이며 0ms paint 보장이 아니다.

### 6) 포트폴리오용 3줄

> 편집기는 React Draft를 표시하지만 사이드바는 서버 요약을 표시해 제목이 불일치하는 실제 UI 버그를 해결했습니다.\
> ID별 Draft 제목을 렌더링 시 우선 적용해 서버 캐시를 보존하고 DB 저장 전에도 제목을 반영했습니다.\
> 과거 소스의 10/10 불일치와 현재의 10/10 일치를 확인하고 A/B·빈 제목·복구·모바일 회귀를 검증했습니다.

### 7) 예상 면접 꼬리 질문 5개

1. **왜 `draftTitle || serverTitle`이면 안 되나?** 빈 문자열도 실제 편집 값이다. 존재 여부는 `??`로 판단하고 표시 fallback을 나중에 적용해야 한다.
2. **optimistic cache update는 안 되나?** 현재는 서버 저장 Mutation이 없는 로컬 편집이다. 미저장 값을 확정된 서버 상태처럼 공유하지 않도록 분리했다.
3. **본문 입력에도 사이드바가 렌더링되나?** 현재 부모 snapshot 구독으로 렌더링될 수 있다. 실제 비용을 측정한 뒤 필요하면 제목 selector·행 memo를 검토해야 한다.
4. **복구 후 모든 노트의 로컬 제목이 바로 보이나?** 선택해 복구한 노트부터 반영된다. 미선택 원고의 전량 hydration은 구현하지 않았다.
5. **검색도 로컬 제목을 따라야 하지 않나?** 별도 제품 정책이다. 후속 변경 시 필터 변화·포커스·정렬을 함께 검증해야 한다.

## 9. 수치 인용 범위와 최종 검증

총 **280개 실험 실행**을 기록했다. 복구 160 + 입력 40 + 두 탭 20 + 가상 역전 비교 20 + 재조회 20 + 실제 과거 제목 비교 20이다. 각 결과의 관련 제품 소스 SHA-256은 조사 종료 시에도 동일함을 확인했다. 제품 코드는 변경하지 않았다.

`pnpm test` 79개와 관련 브라우저 회귀 3종(noteDrafts/sidebarDraftTitles/localDraftStorage)을 재실행해 모두 통과했다. [로그와 원시 결과 디렉터리](../measurements/2026-10-25-draft-concurrency/)에 보관한다. 제품 변경이 없으므로 이번 조사에서 build/lint는 다시 실행하지 않았으며 이전 기능 작업의 성공 기록과 구분한다.

- 160/160, 40/40은 지정한 실험의 성공률이며 모든 환경에서의 데이터 무손실 보장이 아니다.
- 가상 모델과 비교한 발생률 감소나 제품 성능 개선률을 주장하지 않는다. A/B는 과거에 IndexedDB가 없어 역사적 비교가 불가능하다.
- 두 탭 거부 사본은 메모리만 유지한다. 모두 영속 보존한 것으로 표현하지 않는다.
- 강제 종료 전 미commit 입력·저장소 회수·정전·브라우저별 내구성 차이는 이 수치의 보장 범위 밖이다. Safari는 검증하지 않았다.
- 사용자 원고·개발 DB의 데이터를 변경하지 않았다. 초기 측정 서버의 공유 Vite 캐시 오류와 제외한 실행은 측정 README에 기록했다.

## 10. 기술 설명에 대조한 1차 문서

- [W3C IndexedDB 3.0](https://www.w3.org/TR/IndexedDB/): 같은 store 범위의 rw transaction 직렬 실행과 commit·내구성의 의미. 업무상 최신 snapshot 선택은 애플리케이션 정책이다.
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore): 외부 store의 구독과 immutable snapshot 계약.
- [React state update queue](https://react.dev/learn/queueing-a-series-of-state-updates): 렌더 snapshot과 함수형 updater 처리.
- [Dexie transaction](https://dexie.org/docs/Dexie/Dexie.transaction%28%29), [Best Practices](https://dexie.org/docs/Tutorial/Best-Practices): transaction promise와 내부에서 다른 비동기 API를 기다릴 때의 위험.
- [TanStack Query render optimizations](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations): structural sharing은 참조 최적화이며 편집 보호·병합 정책이 아니다. 실제 stale/refetch 정책은 프로젝트 소스로 확인했다.
