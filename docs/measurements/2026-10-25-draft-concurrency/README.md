# Draft 경쟁 상태 실증 측정

측정 코드: measure.cjs (제품 코드 수정 없음). 결과 JSON에는 합성 원고 ID/version/SHA-256만 저장한다. 제목·본문을 결과나 로그에 출력하지 않는다. 데이터 저장소는 매 시나리오 새 Chrome context이며 종료 시 context만 폐기한다. API 요청은 GET만 허용하고 모두 mock 처리한다.

## 실행

현재 작업 디렉터리와 과거 9789b32 archive를 각각 별도 Vite 포트에서 실행한다. 과거 snapshot은 /private/tmp 아래 git archive로 추출하고 의존성만 기존 node_modules에서 재사용한다. **두 Vite의 cacheDir은 서로 다르게 지정한다.** 제품 vite.config.ts를 편집하지 않고 별도 임시 config에서 cacheDir만 지정했다. 실제 OS/Chrome/source hashes/HEAD는 각 JSON manifest에 있다. current는 미커밋 IndexedDB+제목 표시 작업본이다.

```sh
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs recovery
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs writes
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs tabs
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs reversal
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs history
```

SEAM_NOTE_PLAYWRIGHT_MODULE/SEAM_NOTE_UI_URL/SEAM_NOTE_HISTORY_URL로 설치된 Playwright와 두 전용 서버 주소를 지정할 수 있다. 기본값은 작업 환경의 기존 Playwright 및 127.0.0.1:25173/25174다. 새 브라우저/패키지를 설치하지 않았다.

## 집계 정의

- recovery: 4×4 지연 조합 각10회, 총160회 실제 AppLayout/useNoteDrafts/React DOM + 실제 IndexedDB. 복구 read의 첫 번째 호출에만 test delay를 주입한다. 서버 GET 지연은 mock handler에서 적용하며 Axios response interceptor 시점을 응답 완료로 기록한다. t0는 test fixture DB seed/모듈 import 뒤, app main import 직전 performance.now다. localFinished는 repository read promise 반환 직전이며 서버 snapshot에 덮이지 않는 최종 textarea 값은 양쪽 완료 후50ms 뒤 검사한다. 앱 모듈 로드/React mount/네트워크·CDP 비용을 포함하는 상대 시각이며 순수 디스크 지연이 아니다. 딜레이0도 실제 지연0을 뜻하지 않는다.
- recovery의 naiveFinalHash는 같은 도착 callback으로 '마지막 수신 데이터 그대로 대입'하는 **가상 단순 상태 변수**의 최종 해시다. 과거 구현/React 비교 UI/DB write가 아니다. 실제 화면 결과는 current finalHash다. 모델의 결과를 실제 운영 버그나 성능 개선율로 해석하지 않는다.
- writes: 실제 NoteEditor textarea의 native value setter + bubbling input 이벤트를 사용한다. 테스트 이벤트는 사람이 타이핑한 trusted key event가 아니다. 매 입력의 전체 길이는20,000 UTF-16 code units이며 마지막10자만 순번으로 변경한다. 입력 listener의 performance.now를 기록하고, 실제 repository transaction promise resolve 시각을 commit ack로 측정한다. 인위적 지연은 transaction **밖**, repo.write 진입 후 실제 DB 호출 전에 있다. 해시는 transaction 완료 뒤 계산한다.
- writes:35×5ms/0ms write delay,35×80ms/600ms,100×5ms/0ms,100×25ms/800ms, 각각10회. recovery/writes는 각 실행 내부 동시 context 최대4개이며 서로 다른 phase는 최종 계측에서 순차 실행한다. CPU/디스크 독점·throttling은 하지 않는다. 실제 입력 간격 배열도 저장한다.
- attempts=repo.write wrapper 진입 수; commits=실제 repository transaction promise 성공 수; cas=LocalDraftConflict; failures=그 외 write reject. 실패 총수는 cas+failures. maxActive는 wrapper 진입~transaction 반환/계측 종료의 동시 미완료 요청 수다.
- latency=마지막 input 이벤트에서 해당 최종 해시를 저장한 transaction promise resolve까지의 시간. 중간 snapshot commit은 제외한다. commit trace에는 revision/시간/해시만 있다. 브라우저 complete ack이지 fsync/정전 영구보존 증거는 아니다.
- percentile=nearest rank (`ceil(p*n)-1`). 입력당 latency가 아니라 **실험1회당 마지막 입력 latency1개**다. 시나리오별n=10이므로p95/p99는 관측 최대값이며 운영 tail을 추정하지 않는다. 보존율은 마지막 입력 전체 해시가 DB 최종 해시와 같은 실행 비율이다.
- tabs: 같은 context의 서로 다른 실제2개 page, 같은 note/token/revision에서 각각 수정·flush. session.connect를 호출하지 않아 BroadcastChannel 조기 차단 없이 최종 transaction CAS를 직접 검증한다. 탭별 memoryHash는 서로 다른 입력 보존, DB에는 승자1개만 영속됨을 확인한다. 각 실행 뒤 큰 revision+오래된 token, 최신 token+낮은 revision을 추가 요청해 별도로 거부를 측정한다.20회 반복. 이는 두 사용자 입력 모두 영속 보존/자동 병합 성공을 뜻하지 않는다.
- reversal: **가상 naive put**와 실제 DraftSession을20회 비교한다. 동일 입력 순서 old→20ms→latest, 첫 요청200ms/둘째0ms의 transaction 전 지연. naive는 두 transaction 생성 순서가 역전되어 최종old가 된다. 실제session은 한 미완료 쓰기 후 최신 snapshot을 후속 저장한다. IndexedDB가 생성된 동시 readwrite transaction 순서를 임의 역전한다는 주장이 아니다. 가상 구현은 실제 과거 코드가 아니다.
- history: 실제 과거9789b32와 current에서 각각10회, 동일 mock Note/제목 입력/500ms 관측 창. 서버 제목과 sidebar label 일치 여부만 비교한다. 과거에는 IndexedDB 자체가 없어A/B의 전후 성능 비교에 사용하지 않는다. 의존성 runtime은 현재 node_modules를 재사용하여 과거 소스 동작 재현이지 당시 바이너리/환경의 완전 복제는 아니다.

## 실행 중 발견한 환경 문제

처음 historical archive의 node_modules symlink가 Vite 생성 캐시까지 공유해 현재 서버의 Dexie optimized dependency가504 Outdated Optimize Dep로 실패했다. 해당 recovery/writes 실행은 중단했고 결과로 집계하지 않았다. 두 연구 서버를 종료하고 현재 구성의 생성 캐시를 다시 생성한 뒤 /private/tmp의 별도 cacheDir 둘로 분리하여 재시작했다. 사용자5173 프로세스/소스/제품 설정은 변경하지 않았다. 진단 중 현재앱의GET /api/workspace/tree 요청1개가 시작됐다가 브라우저 종료로 중단됐다. 데이터 변경 요청은 없고 최종 측정 API는 모두mock이다.

## 재조회와 사후 검증

`measure.cjs state`는 clean/dirty 각10회(총20회)의 실제 앱 재조회를 추가 실행한다. 초기v2 GET이 끝난 뒤 mock을v3로 바꾸고 refetch를 시작한다. dirty군은100ms 응답 대기 중 textarea 입력을 변경한다. clean은base3 채택,dirty는base2 유지/latest3 관측,양군Query는v3내용을 유지하는지 DB/DOM/Query 해시로 검사한다.

```sh
node docs/measurements/2026-10-25-draft-concurrency/measure.cjs state
node docs/measurements/2026-10-25-draft-concurrency/analyze.cjs
```

analyze는6개 결과JSON을 재집계하고UI/DB가처음 합성fixture해시와 일치하는지, 모든phase의관련제품5개소스가바뀌지않았는지검사한다. summary.json/md와실험코드·JSON의SHA-256을기록한다. 소스나측정결과가변경되면검증실패를무시하지말고새측정디렉터리에서다시실행해야한다.

실제로 사용한 별도config의구조는아래와같다. 과거config는archive안의vite.config.ts를import하고다른cacheDir을지정한다. 임시파일로저장한후각source디렉터리에서`vite --config /absolute/path/to/config.mjs --host 127.0.0.1 --port 25173 --strictPort`를실행한다(과거는25174). 소스config는변경하지않는다.

```js
import config from '/absolute/current/frontend/vite.config.ts'
export default { ...config, cacheDir: '/private/tmp/seam-note-measure-current-cache' }
```

최종 측정 이후 `pnpm test`79개와noteDrafts/sidebarDraftTitles/localDraftStorage브라우저3종을재실행했다. 로그를같은디렉터리에저장했다. 제품변경이없어이번조사에서는build/lint를재실행하지않았다.
