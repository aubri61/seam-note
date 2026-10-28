# 원고 충돌 Diff·안전한 버전 선택

- 시작:2026-10-27 / 완료 검증:2026-10-28
- 사용자 요청: commit/push 금지. 기존 실제 개발 DB·브라우저 저장소 사용 금지.

## 실제 작업 순서

1. DraftSession/repository/useNoteDrafts, Query/수동 전송/SyncCoordinator, conflict failureCode, Web Lock/ACK, Radix·Emotion 및 기존 문서를 조사했다. Git HEAD1bb1993 기준 미커밋 변경이 없는 것을 확인했다.
2. 합성 데이터의 별도 PostgreSQL25442/Spring18766/Vite25175를 실행했다. 실제 코드 변경 전 두 탭 local CAS와 독립 persistent profile의 실제 서버409를 재현했다. conflictResolutionLive 하네스 before 모드 및 before JSON에 버전/token/본문 해시를 남겼다.
3. 기존 local-only multitab troubleshooting 문서에 UX 부재·교체 위험을 기록하고 동일 문서를 계속 보완했다.
4. conflictModel.ts / conflictService.ts 추가: 정확한 세 유형, snapshot/head stamp, 블록 조건, 최신 서버 재검증 및 로컬·서버 lock 선택. 단순409/일반404/UUID·key 충돌을 버전 선택으로 취급하지 않는다.
5. draftDatabase.ts: conflictHead/conflictNotes/resolveConflict. 기존 Drafts의 optional conflictHistory/recoveredAs만 확장하고 old data를 유지했다. 원고·복구 사본·작업 교체 또는 새 UUID 복구를 같은 transaction으로 묶었다. v1~v4 schema/Flyway 수정 없음. 새 record 형식을 검증하고 후속 write가 history를 유지하도록 했다.
6. draftSession.ts: applyConflictChoice fence 추가. 현재 입력 revision을 검사하고 commit 성공 후에만 checkpoint/token을 채택하며, 늦은 추가 입력도 보존한다. 기존 CAS/Recovery Barrier/ACK를 교체하지 않았다.
7. lineDiff.ts/diffWorker.ts/DiffView.tsx: bounded line LCS/coarse fallback, 문자 범위 강조, Worker 계산, 최대180개 줄 DOM과 스크롤/블록 이동. 자동 병합 없음.
8. ConflictDialog.tsx: 기존 Radix/Emotion 재사용, 제목/본문/출처/버전, 전체 버전 선택, 취소, txt 복구 사본, 별도 삭제 복구 UI, 모바일 세로 배치와 키보드/focus 복귀. AppLayout/AppHeader/NoteEditor에 진입점을 연결하고 useConflictList는 타이핑/일반 저장 단계마다 큰 conflict payload를 읽지 않도록 local conflict membership만 감시한다. 테마에 Diff 색상 토큰3개를 추가했다.
9. Node conflictModel 및 DraftSession 테스트 추가, 실제 서버14개/실제 UI4개 묶음/production 길이별5개 측정 하네스를 작성했다. 기존 multiTabConflictAfter의 결과 출력 경로를 지정할 수 있게 하여 과거 검증 JSON을 덮어쓰지 않았다.
10. 기존 Outbox/Recovery fault-injection 하네스의 HTML entry 제거를 쿼리 문자열에도 견고하게 하고 Outbox-only 페이지는 완전히 inert HTML로 분리했다. HMR 없는 별도 mock Vite25176/cache를 사용해 실제 앱과 fault-injection 대상 모듈 인스턴스를 일치시켰다. PWA 회귀에 실제 오프라인 두 탭 Diff/선택/사본 보존을 추가했다.
11. 새로운 설계 문서 manuscript-conflict-resolution.md에 실제 경로, 원자성 경계, 학습용 재현, 성능 측정 방법, 포트폴리오 표현과 한계를 정리했다. 최종 테스트 수치는 아래와 verification summary에 기록한다.

## 구현 중 발견·수정한 사항

- React lint: 초기 모달 데이터 로더의 effect 내 상태 갱신 경로를 IDB Promise callback 방식으로 정리하고 컴포넌트 파일의 helper export를 제거했다. lint 규칙을 끄지 않았다.
- Escape 테스트의 count Promise 비교에 await가 없어 닫혔는데도 timeout이 발생했다. 이 하네스 오류를 제품 Escape 버그로 주장하지 않는다. 실제 programmatic Radix Dialog의 focus 복귀는 opener ref와 대체 헤더 버튼으로 명시했다.
- local CAS UI 재현이 백그라운드 타이머 승자를 가정하던 문제를 실제 pagehide flush와 상대 쓰기 지연으로 통제했다. CAS 자체를 fake하지 않았다. 지연은 선택 transaction 전에 복원했다.
- 복구 폴더를 선택하지 않아 삭제 복구 버튼이 비활성인 것은 정상 보호였다. UI 테스트도 명시적인 폴더 선택을 포함하도록 정정했다.
- Dexie 오류는 Playwright에서 DexieError로 포장될 수 있어 오류 문자열 대신 실제 record/history/Outbox rollback을 검증했다. ACK 실패도 특정 module 객체 패치 대신 실제 native IDB delete 실패로 주입했다.
- 서버 clean 로컬 사본의 실제 GET404도 복구하도록 보완했다. 기존 failed PUT이 없다고 복구 경로를 막지 않으며, 최신 GET404 재확인과 새 UUID 원자 commit은 동일하게 적용한다.
- 쿼리 문자열이 붙은 Vite entry 및 HMR 모듈 identity 때문에 기존 fault injection 테스트가 앱 초기화/대상을 잘못 잡을 수 있었다. 전용 shell/새 origin 환경에서 재검증한다. 실제 원고 유실로 해석하지 않는다.

## 최종 검증

- pnpm test:162/162, pnpm lint, pnpm build(TypeScript 포함) 통과.
- 격리 PostgreSQL backend:35개, 실패/오류/skip0.
- 구현 전 실제 재현2개, 구현 후 실제 서버/IndexedDB14개, 실제 UI4개 묶음, 기존 자동 재조정9개 통과.
- production 전체 동기화18개, production PWA11개(오프라인 Diff 포함), 기존 mock browser12개 suite 통과.
- 마지막 모달 제목 autofocus/모바일 첫 화면 scrollTop0 및 삭제 원고 읽기 전용 미리보기 변경 후 UI4개와 PWA11개를 다시 실행했다. 최종 빌드의 production 길이별5개 측정도 완료했다.
- 50,000줄/1,938,889자: Worker11.7ms, 시작·전달 포함46.1ms, 모달+첫 변경 이동899ms, 줄 DOM180개. 한 조건1회 표본이며 p95/개선율이 아니다.
- 최종 핵심 repository/session/수동 동기화 hash가 실제 서버 회귀 결과와 일치한다. Dexie schema constructor를 HEAD와 byte 비교해 동일함을 확인했다. backend diff 없음, git diff --check 통과. HEAD1bb1993 유지, staging/commit/push 없음.
- 전체 결과/환경/소스 hash: [검증 summary](../verification/2026-10-28-conflict-diff-summary.json). 기존 verification 파일의27일은 기능 시작일이며 최종 검증은28일이다. 개별 suite를 별도 실행했으며 --conflicts 결합 명령 전체를 실행했다고 주장하지 않는다.
- Chrome 첫 실행은 sandbox의 SIGABRT/EPERM으로 종료되어 승인된 격리 브라우저 실행으로 재검증했다. CPU 모델 수집도 sysctl 제한으로 미수집이다. 이를 제품 오류나 측정값으로 해석하지 않는다.


## 보존과 한계

구형1~4 schema 선언을 그대로 유지했고 서버/Flyway 변경이 없다. 사용자 실제 원고·개발 DB는 사용하지 않는다. 복구 사본은 같은 origin의 로컬 보관이며 외부 백업·무제한 저장 보장은 아니다. 구버전 앱 코드와 혼용하지 않도록 개발 탭 갱신 및 기존 SW 대기/종료 후 적용 정책을 유지한다. 서버 선택은 큐 확정이며 전송/ACK는 기존 전체 동기화로 수행한다. Safari·스크린리더·모든 장치 성능은 미검증이다. commit/push하지 않는다.
