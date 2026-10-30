# 초기 Draft 복구 경쟁 수정

## 브랜치와 변경 범위

배포 감사/무료 HTTPS 비교를 chore/deploy-infra의 a8905bb로 먼저 커밋했다. 그 커밋에서 fix/initial-draft-recovery를 생성했다. main merge/push, 운영 EC2·Supabase·Vercel 변경과 재배포는 수행하지 않았다. 기존 배포 코드 커밋 3a9b7e9/b4be141을 유지한다.

## 원인과 해결

최초 read가 빈 상태로 끝난 뒤 startup retry가 느린 GET보다 먼저 실행되면, checkHead가 정상 신규 부재를 로컬 기록 삭제로 처리해 LocalDraftConflict에 고정됐다. 이후 서버 응답이 도착해도 최초 로컬 저장과 자동 전송이 막혔다.

- 확정 checkpoint/token/savedRevision이 없는 상태만 initial로 읽고, 빈 정상 결과를 충돌로 바꾸지 않는다. 기존 conflict는 자동 해제하지 않는다.
- IndexedDB 초기 read 및 최초 write 트랜잭션은 고아 update/create Outbox와 미확정 local entity를 확인한다. 상태에 관계없이 남은 큐를 새 서버 스냅샷으로 덮어쓰지 않는다. read/write 사이의 경쟁에도 보호된다.
- 확정 기록의 외부 삭제 복구는 기존 restoreMissing checkpoint/queue 검증을 통과한 동일 트랜잭션에서만 허용한다. CAS, dirty 본문/baseVersion, frozen queue, 삭제 tombstone을 보존한다. IndexedDB schema/API/백엔드/배포 설정은 바꾸지 않았다.
- 느린 GET와 원고 전환에서 note ID별 기존 세션을 유지하며 미저장 입력을 보존한다. 기존 scheduler/ACK/expectedVersion 알고리즘은 유지한다.

## 검증

수정 전 추가 Node 회귀 4개 중 3개 실패(집중 suite 전체 41개 중 38개 통과). 수정 후 전체 210개 통과. TypeScript+production PWA build 및 ESLint 통과.

새 initialDraftRecovery.cjs는 실제 Chrome/IndexedDB를 쓰되 HTTP API는 합성 fixture다. 23개 검사 통과: 최초 빈 저장소, pending/inFlight/conflict 고아 큐 보존, 정상 checkpoint 복구와 frozen 차단, read 뒤 큐 생성, 타 탭 CAS, 고아 신규 생성, 삭제 tombstone, dirty/baseVersion 보존, 1800ms 첫 GET, 자동 PUT/ACK, 오프라인 종료·재실행·온라인 ACK, A의 늦은 응답 중 B 편집 보존. 이 수치를 실제 EC2/Supabase/Vercel 검증으로 보고하지 않는다.

기존 autoSyncLive.cjs에는 SEAM_AUTO_SYNC_REPORT만 추가해 과거 실측 보고서를 보존한다. 격리된 임시 PostgreSQL + 로컬 Spring + production Chrome/PWA 회귀 결과는 완료 후 아래에 기록한다. 개발용 DB/API 포트 및 운영 DB에는 쓰지 않았다.

- 상세 결과: docs/verification/2026-10-30-initial-draft-recovery-summary.json 및 해당 browser/live 보고서.
- 기존 docs/verification/2026-10-30-ec2-pwa.json의 실패는 당시 실제 배포 결과로 보존한다. 이번 수정의 실제 Vercel/EC2 재검증은 남아 있다.
- 개인 트러블슈팅 기록(기존 gitignore 유지): docs/troubleshooting/2026-10-29-frontend-auto-sync.md, README.md 갱신.

## 기존 통합 회귀 최종 결과

실제 격리 PostgreSQL14(25519)/Spring(18819)와 production Chrome/PWA 18개 그룹 모두 통과했다. dirty GET/409와 Diff 선택, 35회 입력 합치기, PUT 도중 추가 입력, 응답 유실 후 같은 operationId 재전송, offline 종료·재실행·온라인 ACK, A/B 선택, 두 탭 Web Lock/CAS, cold uncertain A/B ACK 복구, 서버 삭제 뒤 로컬 보존, 401/400 수동 재시도, 503 제한 backoff를 포함한다. 장애/HTTP 오류는 합성 주입이며 운영 장애가 아니다.

503은 최초+3재시도 총4회 뒤 정지했고 실제 간격은 5096/15076/30129ms였다. 동일 operationId/payload hash를 유지했고 수동 재시도 후 ACK가 완료됐다. 이 수치는 이번 단일 격리 실험의 관측값이다. 근거: docs/verification/2026-10-30-initial-draft-auto-sync-live.json. 과거 보고서는 덮어쓰지 않았다.
