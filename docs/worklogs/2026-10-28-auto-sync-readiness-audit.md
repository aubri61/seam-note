# 자동 원고 전송 사전 검증 — 제품 코드 미변경

## 작업 순서

1. 현재 생성 자동 반영과 수동 NOTE_UPDATE 경로, 삭제 모달 분류/진입, 삭제 Mutation, Recovery Barrier/CAS/ACK/Coordinator/Web Lock, 전역 Workspace/원고 조회와 인증 유무를 조사했다.
2. frontend/src·backend/src의 전체 파일 hash를 임시 manifest에 보관하고 기존 미커밋 작업을 그대로 유지했다.
3. 새 격리 PostgreSQL/Spring/Vite lab을 실행했다(UI25175/API18766/DB25442). 실제 개발 원고와 브라우저 저장소는 사용하지 않았다.
4. inFlightCrashRecovery에 별도 결과 파일 지정 옵션을 추가해 과거 기록을 덮어쓰지 않고 현재4조건을 다시 실행했다. 최초 CDP 포트 파일 준비 경합(port0)을 테스트의 완전한 파일 내용 대기로 보완했다. 제품 저장 실패가 아니다.
5. conflictResolutionLive도 결과 경로 옵션을 추가해14개를 새 JSON에 실행했다. 기존 multiTabConflictAfter의9개도 현재 소스로 재실행했다.
6. autoSyncReadinessAudit.cjs를 새로 작성했다. 실제 서버 GETv3를 로컬 read보다 먼저 완료시키고 복구 gate 중 Coordinator를 테스트에서 직접 호출했다. dirty A+B와 clean revert+미확정 A 모두 복구 전 PUT0, 복구 후 원문 보존을 확인했다. 제품에 자동 호출 hook을 추가하지 않았다.
7. 두 탭에서 Coordinator를 동시에 명시 호출해 전역 Web Lock으로 한쪽만 PUT1회/서버v1임을 확인했다.
8. 같은 앱에서 미전송 원고를 직접 삭제한 뒤 전체 sync를 누르면 남은 NOTE_UPDATE가404 NOTE_NOT_FOUND가 되어 복구 모달이 열리는 현재 경로를 재현했다. 원문은 보존됐으나 의도적 삭제와 원격 소실의 구분 정책이 없음을 보고한다. 이번에는 삭제 처리나 Outbox를 임의 정리하지 않았다.
9. 인증/서버·계정 범위, 최소 단일 scheduler, 복구 barrier/유한 follow-up, 오류별 중단·재시도안을 설계 문서로 작성했다.

## 결과

- 실제 Chrome SIGKILL/동일 프로필 재실행4조건, SIGKILL5회 통과. A/B Ledger각1, 최종v4/Outbox0.
- 실제 충돌/키 재사용/ACK rollback/삭제 보호14개 통과.
- 멀티탭 CAS/metadata/서버 lock 중 로컬 입력9개 통과.
- 추가 readiness4개 통과(GET 순서2, 동시 Coordinator1, 직접 삭제 후 popup1).
- Node169개 통과. 별도 lint 결과 및 제품 전체 hash 동일 여부는 최종 summary에 기록한다.
- source 변경은 테스트 하네스뿐이며 기존 Dexie/Outbox/Ledger/서버 API를 재작성하지 않았다. NOTE_UPDATE 자동 시작/online hook을 추가하지 않았다. 생성 자동 반영은 기존 상태를 유지했다. commit/push하지 않았다.

최종 보고: docs/design/startup-reconnect-sync-readiness.md. 수치는 docs/verification/2026-10-28-auto-sync-audit-*.json 및 auto-sync-readiness.json을 따른다. 보호 경로가 겹치므로 전체 수를 독립 커버리지로 합산하지 않는다. OS 전원 차단/저장소 삭제·회수/Safari·운영 인증 환경은 미검증이다.

최종 확인: 제품 소스126개 파일의 시작/종료 hash가 모두 동일하다. Node169/lint 통과, git diff --check 통과. HEAD14d6759와 기존 미커밋 변경을 보존했고 staging/commit/push하지 않았다. 검증 summary: docs/verification/2026-10-28-auto-sync-audit-summary.json.
