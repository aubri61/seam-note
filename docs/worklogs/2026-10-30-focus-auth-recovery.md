# 검증용 인증 후 포커스 복구 · 자동 동기화 대기 개선

## 사용자 요청과 조사 범위

사용자는 Basic 로그인과 사용자 계정 로그인의 차이, 반복 입력 여부 및 향후 제거 가능성을 질문했고, 포커스 복귀 시 자동 동기화가 간헐적으로 실행되지 않으며 느리다고 보고했다. Basic은 현재 OAuth/사용자 격리가 없는 API의 임시 검증용 보호다. 리뷰어 계정/회원 로그인과 다르며, 사용자 인증·권한 구현 뒤 Caddy와 Vercel proxy 양쪽에서 대체할 수 있다. 이번에는 보호·비밀값을 제거하지 않았다.

사용자의 실제 실패 세션 HTTP 상태와 Outbox는 직접 관측하지 않았다. 이전 native browser 도구 지연을 반복하지 않고 소스/격리 테스트/EC2 read-only 측정으로 조사했다. 기존 fix/initial-draft-recovery 브랜치와 이전 배포 미커밋 파일을 보존했다.

## 확인한 코드 문제와 수정

401/403은 일반 halt와 failed operationId 차단으로 처리돼 로그인 뒤 focus만으로는 회복할 수 없었다. auth outcome을 분리하고 실제 focus/online/manual 이벤트로만 한 번 재평가하도록 수정했다. 응답 대기 중 도착한 focus도 후속 실행으로 보존한다. 401/403의 frozen 작업은 원래 operationId/payload/expectedVersion을 유지한 채 재시도 가능하며, 일반 영구 오류의 halt/blocked 및 충돌 보호는 유지한다. 사용자 증상의 유일한 원인을 401로 단정하지 않는다.

입력 종료 대기는4초→1.5초로 줄였다. focus/online은 quiet 대기를 건너뛰며150ms 합치기·최소3초 실행간격·5/15/30초 네트워크 backoff·유한 retry를 유지한다. 로컬 flush/CAS/ACK/서버 version guard는 바꾸지 않았다. 연속 입력 때는 서버 요청이 증가할 수 있어 기존 burst/폭주 방지 회귀를 재검증한다. 1.5초는 전송 예약 대기이며 전체 서버 저장 완료 SLA가 아니다.

## 실제 지연 측정

EC2 backend의 loopback HTTP에서 각3회, 응답 본문은 폐기했다.

| 경로 | 초 단위 표본 |
|---|---|
| DB 포함 readiness |0.510340 / 0.256158 / 0.255922|
| workspace/tree |1.533488 / 1.770717 / 1.517294|

이 표본은 Basic/Vercel을 통하지 않아 전체 경로 측정이 아니다. bcrypt cost14는 유지했고 암호 검증 비용의 기여도는 따로 측정하지 않았다. 목록 조회는 DTO projection2개를 repeatable-read 트랜잭션에서 조회하며, 이번 코드 읽기만으로 N+1이라고 주장할 근거는 없다.

배포 metadata의 함수는iad1(미국), EC2는ap-southeast-2(시드니)다. 함수와 원본 API를 가까이 둘수록 지연을 줄일 여지가 있지만 실제 효과·요금·배포 승인을 확인하기 전 설정을 바꾸지 않았다. 공식 근거: https://vercel.com/docs/functions/configuring-functions/region 및 https://vercel.com/docs/regions . 새 Supabase connector의 프로젝트는 운영 DB와 일치하지 않아 추가 조사하지 않았으며 운영 DB 리전을 추측하지 않았다.

## 검증

- 기존 scheduler16개+신규 요구사항 중2개는 수정 전 실패. 수정 후 scheduler19/19, Node 전체213/213, TypeScript/production build·lint 통과.
- 실제 격리 Chrome/IndexedDB/PWA + 합성 HTTP API24개 통과. 401 PUT 뒤 자동 루프가 없고, 접근 복구→focus만으로 같은 key/version 재전송·ACK를 확인했다. dirty/CAS/frozen queue/tombstone/오프라인 재실행·초기 지연 GET·원고 전환 보호도 재통과했다.
- 합성 API 보고서: docs/verification/2026-10-30-focus-auth-browser.json. 실제 Vercel에서 인증된 테스트로 해석하지 않는다.
- 기존 실제 격리 Spring/PostgreSQL+production Chrome/PWA 통합18/18 재통과. dirty409/Diff, 빠른 입력, PUT 중 입력, 응답 유실, offline 종료·재실행, A/B 선택, Web Lock/CAS, uncertain ACK, 서버 삭제,401/400/503 보호를 포함한다. 503 최초+3retry 뒤 정지, 간격5049/15045/30223ms, 기존 key/hash 유지. 근거: docs/verification/2026-10-30-focus-auto-sync-live.json.

## 운영 상태와 남은 확인

이번 자동 동기화 변경은 아직 production에 배포하지 않았다. 이전 d0d49e1의 production 승인을 신규 동작 변경 승인으로 확대하지 않는다. 운영 반영 승인을 받은 뒤 같은 Vercel origin에 반영할 수 있다. PWA는 열린 편집기를 자동 reload하지 않으므로 로컬 저장 확인 후 기존 업데이트 안내에 따라 적용해야 한다. 캐시/IndexedDB/Outbox를 삭제하지 않는다.

추가 확인은 실제 사용자 탭의 HTTP401/403/네트워크 상태와 서비스워커 버전, 인증된 전체 요청별 지연이다. 사용자 원고는 수정·삭제하지 않았고 AWS 리소스/SG/DB/비밀값 변경, Git push/merge는 수행하지 않았다. 개인 문제 기록: docs/troubleshooting/2026-10-29-frontend-auto-sync.md.


## DB 왕복 분리 측정

운영 backend의 writable /tmp에 자격증명을 포함하지 않는 Java21 진단 class와 기존 JDBC driver만 임시 전달했다. 컨테이너 환경값은 프로세스 메모리에서 읽고 기존 CA/sslmode=verify-full을 유지했다. SELECT1만5회 실행했으며 사용자 원고/DDL/DML은 다루지 않았다.

새 JDBC 연결2498.801547ms, SELECT1 269.397240/249.743626/249.573177/249.479675/249.508056ms. 풀 재사용과 다른 새 연결 표본이므로2.5초가 매 요청마다 발생한다고 주장하지 않는다. 단순 DB 쿼리의 왕복 자체도 약0.25초라는 근거이며 DB 내부 실행시간/물리적 리전/네트워크 각 기여도는 분리하지 않았다. source-only 진단 도구는 /private/tmp, 원격 class/driver는 해당 애플리케이션 /tmp 하위만 사용하고 종료 후 정리했다.

다음 성능 단계는 인증된 전체 요청의 단계별 시간과 서버↔DB 근접성/반복 roundtrip을 확인하는 것이다. 트랜잭션 일관성, expectedVersion, Ledger를 버려 속도를 높이지 않는다. 리소스 이동/추가 비용/운영 DB 변경은 새 승인 없이 수행하지 않는다.


## 후속 main 통합·배포 승인

사용자가 현재 배포·동기화 작업 전체의 commit/push, PR 제목·본문 작성과 생성, main 병합, 병합 후 production 배포를 명시적으로 승인했다. 위의 미배포/미승인 표기는 각 검증 시점의 이력이다. 운영 인증된 CRUD/PWA 미검증 한계는 그대로 유지하며 merge 후 실제 배포 결과는 해당 PR에 기록한다. 비밀정보·개인 troubleshooting 제외 정책을 유지한다.
