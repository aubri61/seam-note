# 사이드바 원고 선택 복구와 개발 전용 ACK 지연 실험

## 파일별 실제 작업 순서

1. Git 상태가 깨끗함을 확인하고 FolderTree/useFolders/Link 이벤트, manualSync/SyncCoordinator/sendNoteSnapshot 검증, 기존 격리 lab 및 crash 검증 코드를 조사했다.
2. 새 PostgreSQL/Spring/Vite(UI25179/API18768/DB25444)를 만들었다. 합성 GET-only Chrome에서 원고 링크 클릭 후 URL·본문이 그대로 남는 실제 버그를 재현했다. 원인은 Link.preventDefault 후 select()가 navigate를 호출하지 않는 것이었다. 메뉴 버튼 분리를 위한 이전 작업에서 기본 Link 이동에 의존하던 선택 계약이 누락됐다.
3. useFolders.ts의 select에 navigate(notePath(id)) 1줄을 추가했다. Draft/CAS/Outbox/DB/API는 변경하지 않았다.
4. src/dev/manualSyncDelay.ts와 ManualSyncDelayPanel.tsx를 추가했다. DEV/지정 UUID 전용이며 sessionStorage 1회 ACK 지연 예약, 실제10초 대기·UI/콘솔 상태만 담당한다. AppLayout에서 조건부 lazy import했다.
5. manualSync.ts에서 검증된 send 반환 뒤 acceptServerAck 이전에만 DEV gate로 beforeAck를 호출한다. IndexedDB transaction 안에 대기를 삽입하지 않았다.
6. scripts/sync-delay-proxy.mjs를 추가했다. 지정 UUID의 다음 성공 PUT 결과를 실제 Spring에서 모두 받은 뒤10초 버퍼링한다. 테스트 프록시 설정은 manual-sync-lab.py --delay에서만 설치한다. 기존 Vite 설정/실제 API 대상은 바꾸지 않았다.
7. manual-sync-lab.py에 --delay/--open-browser를 추가했다. 새 UUID 원고를 version2로 준비하고, 필요 시 전용 Chrome 프로필 창을 띄운다. 프로그램 종료는 자신이 시작한 프로세스와 새 cluster만 정리한다.
8. sidebarNoteSelection.cjs에서 desktop/mobile 일반 클릭·Enter·뒤로/앞으로·미저장 Draft 보존·load1회·쓰기0을 검증했다.
9. manualSyncDelayLive.cjs를 추가해 실제 패널/동기화 버튼/서버 지연 및 beforeAck 대기로만 실험했다. 지연을 테스트 route로 흉내내거나 정상 B를 삭제하지 않았다. 임시 영속 프로필, Browser.close/SIGKILL, 동일key/payload/ledger 및 최종Outbox를 검증했다.
10. 기존 noteMenus와 noteRouting, inFlightCrashRecovery를 실행했다. noteRouting의 과거 DOM 가정(treeitem의 href·툴바 삭제 버튼)을 현재 하위 Link·헤더 메뉴에 맞춰 갱신했다. 모든 기존 검증 목적은 유지했다.
11. production build에 테스트 noteId 환경변수를 넣어도 dev 모듈/문구/endpoint가 산출물에 남지 않음을 확인했다. TypeScript/build/lint/test169개를 통과했다.
12. 사용자가 직접 시험할 또 다른 새 환경(UI25183/API18772/DB25448)과 눈에 보이는 전용 Chrome을 열었다. 자동 검증 원고와 분리되어 version2 상태이며, 직접 입력은 하지 않았다. 설계·재현·접속 정보를 docs/design/manual-sync-delay-lab.md에 기록했다.
13. 기존 라우팅 및 manual-sync-ack 트러블슈팅 문서에 실제 버그/테스트 환경 문제/검증 결과를 보완했다. 개인 troubleshooting은 기존 Git ignore 그대로다. commit/push하지 않았다.

## 실제 결과

- sidebarNoteSelection:2개 묶음 통과, desktop/mobile URL 선택·키보드·Draft 복귀·document load1회, API write0.
- manualSyncDelayLive:6개 통과. A/B 각각 정상대기·정상 Browser.close·SIGKILL. 대기 중 최신 로컬 commit, 재시작 후 최신 Draft/inFlight 복구, 동일operationId/payload 재전송, 원래Ledger1행, 최신후속version 및 Outbox0. 첫 조건v2→v3→v4.
- 정상 로컬 write는 B도 원자 기록하므로 ACK 직전 B 부재가 자연 발생했다고 주장하지 않는다. ACK가 기존 pending후속 B의 expectedVersion과 key를 재조정한 것을 확인했다. 재실행 후 한 번의 클릭에 B까지 처리되는 유한 후속 pass도 기존 정책대로 허용한다.
- 기존 inFlightCrashRecovery:4개 통과. B 부재 fault injection 및 ACK 삽입오류 전체rollback 포함. 제품 ACK 저장 로직은 변경하지 않았다.
- noteMenus:desktop/mobile2묶음 통과. 기존 noteRouting:루트 replace·Link/무새로고침·직접/병렬/재조회·Back/Forward Draft·접힘설정·지연응답·UUID/404·빈화면·모바일·beforeunload 전체 통과. 메뉴 재검증 결과는 2026-10-28-note-menus-selection-regression.json에 별도 보존했다.
- pnpm build/TypeScript, pnpm lint, pnpm test169/169 통과. `VITE_SYNC_DELAY_NOTE_ID=... pnpm build`에서도 dev 도구 문자열/경로 검출0.

## 발견된 테스트 환경 문제

- 최초 mock의 **/api/** 패턴이 /src/lib/api/client.ts까지 가로채 빈 MIME 모듈 오류를 유발했다. pathname.startsWith('/api/')로 수정 후 실제 버그를 재현했다.
- 새 패널 TS callback에서 nullable noteId를 넘기는 오류는 !noteId guard로 수정했다.
- 기존 noteRouting 테스트는 DOM이 예전 Link-row/툴바 삭제였다고 가정해 실패했다. 현재 semantic Link와 헤더 메뉴의 disabled 검증으로 보완했다.
- 새 sidebar 테스트는 URL이 바뀐 직후 이전 화면 body를 읽어 일시 실패했다. React 화면 반영 완료를 기다리도록 하네스만 수정했다. 제품 Draft 손실로 분류하지 않는다.

## 남은 범위

이번10초 실험은 Vite DEV이며 PWA SW 강제종료 시나리오 자체는 아니다. 실제 전원 차단/브라우저 저장소 회수는 미검증이다. 정적 production 산출물에는 지연 도구가 없다. 인증·자동 NOTE_UPDATE 전송·저장 schema를 추가하지 않았다. 원시 결과는 docs/verification/2026-10-28-{sidebar-selection,manual-delay-live,delay-crash-regression}.json이다.
