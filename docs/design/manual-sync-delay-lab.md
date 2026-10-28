# Chrome에서 직접 하는 수동 동기화 10초 지연 실험

## 실행 중인 전용 환경 (2026-10-28)

- 화면: http://127.0.0.1:25183/notes/b5379b2c-1dbb-42e8-b035-8ef50e47832c
- API: http://127.0.0.1:18772/api
- PostgreSQL: 127.0.0.1:25448 / seam_note_manual_lab
- fixture/log: /private/tmp/seam-note-manual-sync-x7wux156
- 수동 실험 전용 Chrome 프로필: /private/tmp/seam-note-manual-sync-x7wux156/chrome-manual
- 새 테스트 원고의 시작 version은2. Chrome 별도 창을 열어두었다. 기존 개발 포트5173/18765/15439, 기존 사용자 DB/프로필은 사용하지 않는다. 아래 자동 검증 결과는 별도 UI25181/API18770/DB25446 환경에서 얻었고, 이 수동 원고에는 검증용 입력을 하지 않았다.

같은 프로필로 재실행(일반 Chrome 아이콘 대신 이 명령 사용):

```sh
open -na 'Google Chrome' --args \
  --user-data-dir=/private/tmp/seam-note-manual-sync-x7wux156/chrome-manual \
  http://127.0.0.1:25183/notes/b5379b2c-1dbb-42e8-b035-8ef50e47832c
```

## 직접 재현 순서

1. 전용 Chrome 창에서 위 원고를 연다. 제목/본문에 실험 입력 A를 작성하고 로컬 저장됨을 확인한다.
2. 노란 개발 전용 패널에서 **A: 응답 전달 전 10초** 또는 **B: ACK 직전 10초**를 누른다. 이 버튼은 지연을 1회 예약하며 전송하지 않는다.
3. 기존 오른쪽 위 **동기화** 버튼을 누른다.
4. A는 `서버 처리 완료 · 응답 전달 전 대기 중`, B는 `ACK 직전 대기 중`이 표시된다. 이때 서버는 이미 A를 저장해 version3이지만, 브라우저의 A Outbox는 아직 inFlight다.
5. 10초 내 같은 노트 본문에 B를 더 입력한다. 로컬 저장됨을 확인한다. 정상 경로는 최신 Draft와 pending 후속 작업을 하나의 IndexedDB 트랜잭션에서 기록한다.
6. 정상 완료 실험: 기다리면 A가 ACK되고 후속 작업이 version3 기준으로 재조정된다. 다음 **동기화**를 누르면 B가 서버 version4로 저장된다.
7. 종료 실험: 대기 표시가 살아 있고 B가 IndexedDB에 저장된 동안 전용 Chrome만 종료한다. 정상 종료는 해당 프로필의 창을 모두 닫는다. 강제 종료는 Activity Monitor에서 이 전용 프로필의 Chrome 프로세스만 종료한다. 다른 실제 Chrome 프로필을 함께 종료하지 않는다. 전원 차단 실험은 아니다.
8. 같은 origin과 위 동일 프로필로 다시 연다. 최신 A+B 본문이 복구되는지 확인한다. 아직 전체 동기화를 누르지 않았다면 서버는 A까지만 저장되어 있고, inFlight A가 남는다.
9. **동기화**를 누른다. 같은 operationId·payload로 A를 재시도하므로 Ledger 성공 결과를 재사용하고 서버 버전이 중복 증가하지 않는다. ACK에서 최신 로컬 원고를 보존한 채 후속 expectedVersion을 재조정한다.
10. pending 후속 작업이 남으면 다시 **동기화**한다. 재실행 당시 A와 B가 모두 큐에 있는 경우 기존 Coordinator의 유한 후속 pass가 B까지 같은 클릭에서 처리할 수도 있다. 반드시 두 번 눌러야 한다고 가정하지 말고 남은 Outbox와 서버 버전을 확인한다.
11. 추가 실험 시 A/B 예약을 다시 누른다. 예약은 지연 시작 전에 소비되므로 재실행·같은key 재시도에는 자동으로 다시 걸리지 않는다.

10초가 지난 후 종료하면 이미 ACK가 끝났을 수 있다. 추가 입력이 로컬 commit되기 전에 종료하면 최신 키 입력은 이 실험의 보존 범위 밖이다. 닫기 경고가 뜨면 최신 로컬 commit을 먼저 확인한다.

## DevTools에서 확인

Application → IndexedDB → 기존 Seam Note DB의 `drafts`와 `outbox`를 확인한다. 테이블을 Refresh해서 같은 noteId만 본다. 변경/삭제는 하지 않는다.

- 전송 전: Draft.baseVersion2 / pending A(expectedVersion2).
- 대기 중: 서버version3 / inFlight A / Draft A+B(baseVersion2) / 보통 pending B도 이미 존재.
- ACK 후: Draft.title/content는 최신 A+B / 기준 A(version3) / B의 expectedVersion3. 미전송 B가 교체·재조정되며 operationId가 달라질 수 있다. inFlight A의 snapshot은 바뀌지 않는다.
- 최종: Draft.baseVersion4 및 최신 baseTitle/baseContent / 해당 note Outbox0.

Network → Preserve log → `/api/notes/{noteId}` PUT의 Idempotency-Key, expectedVersion을 확인한다. A 시나리오는 서버 commit 뒤에도 Network가 Pending으로10초 유지된다. B는 HTTP200이 먼저 표시되고 UI가 ACK 직전10초 기다린다. B 지연은 IndexedDB 트랜잭션을 연 상태로 기다리는 것이 아니다.

서버 확인은 GET만 사용한다:

```sh
curl http://127.0.0.1:18772/api/notes/b5379b2c-1dbb-42e8-b035-8ef50e47832c
psql -h 127.0.0.1 -p 25448 -U postgres -d seam_note_manual_lab \
  -c 'select operation_id, note_id from note_update_operations;'
```

첫 실험 이후 version은 계속 증가한다. 다음 실험도 현재 version N→N+1→N+2로 해석한다. 원고 snapshot/operationId를 임의로 고치거나 큐를 삭제하지 않는다.

## 구성과 제거

- `scripts/manual-sync-lab.py --delay`가 새 initdb/DB/테스트 UUID를 만들고 테스트 전용 설정에만 `sync-delay-proxy.mjs`를 설치한다. 기존 vite.config.ts와 backend API는 변경하지 않는다.
- A: proxy가 실제 Spring 응답 body 수신 완료를 기다린 뒤200일 때만10초 지연한다. 지정 noteId 외 PUT/GET은 지연하지 않는다. `/__sync-delay__/arm`은 예약, `/__sync-delay__/state`는 안전한 상태 로그다. 원고 본문은 상태 로그에 넣지 않는다.
- B: `manualSync.ts`에서 `dependencies.send` 반환(제품 sendNoteSnapshot의 verifySyncResponse 통과) → DEV 지정 UUID gate → `beforeAck` → `session.acceptServerAck` 순서다. 기존 ACK/CAS/Outbox 트랜잭션 구현은 그대로다.
- 패널/타이머는 `frontend/src/dev/`에 격리하고 DEV 및 VITE_SYNC_DELAY_NOTE_ID 둘 다 설정되어야 import한다. 일반 pnpm dev에서는 나오지 않는다. production build에서는 환경변수를 주입해도 지연 모듈·패널·문구·endpoint가 번들에 없음을 검사했다.
- 제거는 AppLayout의 DEV lazy 패널/렌더, manualSync의 DEV beforeAck gate, src/dev 두 파일 및 lab의 --delay 옵션/proxy 파일만 제거하면 된다. DB/schema/CAS/ACK 변경은 필요 없다.

## 다시 환경 만들기 / 서버 종료

```sh
python3 scripts/manual-sync-lab.py --delay --open-browser \
  --ui-port 25183 --api-port 18772 --db-port 25448
```

서버가 이미 실행 중이면 중복 실행하지 않는다. 새 실행마다 새 DB 디렉터리/UUID/프로필이 생기므로 출력된 새 URL을 사용한다. 해당 Python 프로세스에 Ctrl-C/SIGINT를 보내면 자신이 만든 Chrome/Vite/Spring/PG만 종료한다. `/private/tmp`는 영구 보관소가 아니다. 코드 변경 시 Vite HMR이 편집기를 remount할 수 있으므로 실험 중 소스 편집은 피한다.

## 실제 검증 결과

- `manualSyncDelayLive.cjs`: 실제 UI 지연 A/B × 정상 대기완료/대기 중 정상 Browser.close/대기 중 SIGKILL =6개 통과. 동일 프로필·origin 재실행, 지연 중 최신 로컬 commit, 동일 operationId/payload 재시도, 원래 Ledger1행, 최종 최신 본문/Outbox0 확인.
- 첫 조건 서버 v2→v3→v4. 나머지는 같은 격리 원고를 재사용해4→6,6→8,8→10,10→12,12→14.
- 기존 `inFlightCrashRecovery.cjs`4조건 재통과(정상 후속B/인위적 B 부재/ACK 삽입 실패 rollback 포함). B 부재는 정상 경로에서 관측된 버그가 아니다.
- sidebarNoteSelection desktop/mobile2개, 기존 noteMenus2개, 기존 noteRouting 전체 시나리오 통과.
- pnpm build/TypeScript, lint, Node169개 통과. production에 지연 도구가 포함되지 않은 것을 확인했다.
- 자동 테스트는 headless Chrome의 실제 프로세스/IndexedDB를 사용했다. 수동 전용 프로필은 별도의 눈에 보이는 Chrome 창이다. 전원 차단/디스크 장애/저장소 회수까지 보장하지 않는다.
