# 2026-10-29 배포 구성 및 검증

## 결과와 실행 범위

브랜치 `chore/deploy-infra`를 깨끗한 main 작업 트리에서 생성했다. 기존 미커밋 변경은 없었다. 기존 migration V1–V5, 루트 개발 Compose, 기본 application.yml, Axios와 자동 동기화/IndexedDB/Outbox/ACK 소스는 변경하지 않았다. push/merge, 유료 리소스 생성, DB 초기화/기존 데이터 이전은 수행하지 않았다.

**코드와 로컬 검증 완료, 실제 Supabase/EC2/Vercel 배포는 미실행**이다. AWS CLI는 profile이 없고 STS 조회도 `Unable to locate credentials`로 실패했다. 실제 Supabase Connect 문자열·CA·API 도메인·Vercel 프로젝트 접근은 제공되지 않았다. 클라우드 성공 여부를 추정하지 않는다.

구성/명령/환경변수/콘솔 단계/비용/롤백은 [배포 가이드](../../deploy/README.md)에 있다.

## 변경 파일

| 파일 | 목적 |
| --- | --- |
| backend/build.gradle | Actuator 추가 |
| backend/src/main/resources/application-prod.yml | TLS verify-full, pool 3/idle 1, Flyway/JPA/JDBC 공통 seam_note 스키마, DB readiness, graceful shutdown |
| backend/Dockerfile | Java 21 멀티스테이지, non-root JRE, health용 curl |
| backend/.dockerignore | Gradle/main 소스만 build context에 허용, 비밀/테스트/빌드 결과 제외 |
| deploy/compose.yml | 운영 backend/Caddy, Spring host port 미노출, restart/health/resource/log 제한 |
| deploy/Caddyfile | HTTPS, 공유 Basic 접근 제한, cross-origin write 차단, actuator 비공개, no-store |
| deploy/.env.example | EC2 환경변수 이름과 안전한 입력 예시 |
| deploy/certs/.gitignore | 인증서/키 로컬 파일 추적 방지 |
| deploy/scripts/manage.sh | 배포 유효성 검사·ready 대기·재시작·로그·종료 |
| deploy/scripts/smoke.py | 명시적 합성 CRUD/멱등성/409 확인 및 자체 폴더 정리 |
| deploy/tests/local-stack.py | 임시 PostgreSQL TLS + prod + Caddy HTTPS 통합 검사 |
| deploy/README.md | 콘솔 절차, 비용 승인, 비밀 설정, 배포/재배포/롤백, 실제 검증 순서 |
| frontend/api/[...path].js | HTTPS 같은 origin API 프록시, Basic 헤더 전달, ACK/409 보존, 비밀 주입·캐싱 없음 |
| frontend/vercel.json | Vite/Node 함수/notes 직접 접근 routing, API no-store, sw.js no-cache |
| frontend/.env.example | 로컬 shell/Vercel 서버 환경변수 안내 |
| frontend/package.json | 검증한 Node 22.x, pnpm 10.32.1 지정 |
| frontend/tests/deploymentProxy.test.mjs | 프록시 접근 경계·헤더·오류·204 회귀 (mock transport) |
| docs/verification/2026-10-29-deployment-local.json | 로컬 운영 스택 결과 19개 |
| docs/verification/2026-10-29-deployment-browser.json | 기존 Chrome 자동 동기화 회귀 18개 결과 요약 |
| README.md, 이 문서 | 배포 가이드 연결 및 변경·검증 기록 |

트러블슈팅 원문과 목록은 기존 로컬 전용 Git ignore 정책을 유지했다: `docs/troubleshooting/2026-10-29-shared-deployment-boundary.md`, `docs/troubleshooting/README.md`. 운영 private 스키마를 도입할 때 JPA default_schema만으로는 JdbcTemplate Ledger가 해당 스키마를 찾지 못하는 문제를 발견해 `currentSchema=seam_note`를 함께 설정했다. 최초 Docker/Gradle 실행 제한은 샌드박스 권한 확보 후 해소됐다. invalid-CA 테스트는 실제 드라이버 오류 문구 차이를 수정한 후 전체 재실행했다.

## 실제 로컬 검증

환경: macOS arm64, Java 21.0.12.1, Node 22.23.4, pnpm 10.32.1, Docker 20.10.22, Compose 2.15.1, PostgreSQL 17, Caddy 2.10.2. 테스트 DB/포트/브라우저 프로필은 개발 서비스와 분리했다. 부하·지연·메모리 성능 수치는 측정하지 않았다.

| 검사 | 결과 | 성격 |
| --- | --- | --- |
| 기존 개발 Docker Compose config / PostgreSQL 준비 상태 | 통과, 기존 컨테이너 pg_isready 정상 | 원본 config 불변, 개발 데이터 쓰기 없음 |
| backend Gradle test | 38/38 통과 | 전용 Docker PostgreSQL 실제 통합, 일부 순수 unit 포함 |
| Java bootJar / Docker 멀티스테이지 build | 통과 | 실제 Linux arm64 이미지 빌드 |
| frontend pnpm test | 206/206 통과 | 기존 모델/상태 회귀 + 새 프록시 4개 transport mock |
| frontend build / lint / frozen lockfile 확인 | 통과 | Node 22, PWA production build |
| prod Flyway/JPA/JDBC | 통과 | 테스트 CA의 verify-full, pg_stat_ssl=true, 스키마 history V1–V5 5행 |
| HTTPS 보호/CRUD/Ledger/expectedVersion | 통과 | 실제 로컬 Caddy HTTPS+prod 컨테이너, 자체 CA 신뢰, 무인증 401/교차 출처 403/health 404 |
| backend 재시작·DB 재시작 후 데이터/ACK | 통과 | 합성 원고 version/이전 operation replay 유지 |
| DB 장애 health / 잘못된 CA | 통과 | readiness=503, 잘못된 root CA로 JDBC/Flyway 시작 거부 |
| 로컬 운영 스택 전체 | 19/19 통과 | 전용 임시 Compose 프로젝트, 완료 후 자체 컨테이너/volume 정리 |
| 제공 smoke.py | 13개 통과 | 격리 Spring에 실제 합성 CRUD·ACK·충돌·자체 폴더 DELETE |
| 기존 autoSyncLive 실제 Chrome 회귀 | 18/18 통과 | production PWA, 실제 격리 Spring/PostgreSQL, 신규 기능/알고리즘 변경 없음 |

Chrome 회귀에는 선택 원고 GET, clean pull/dirty 보호, 409와 Diff 복구, 빠른 입력 병합, 전송 중 추가 입력, 응답 유실 후 같은 key/snapshot 재전송, PWA 오프라인 종료/재실행·편집·온라인 복구, 멀티탭 단일 적용/CAS, 불확실한 inFlight 복구, 서버 삭제, 401/400 재시도 제한, 503 backoff 검사가 포함된다. 기존 회귀 스크립트의 결과 출력 경로만 임시 복사본에서 변경했으며 원본을 수정하지 않았다. 브라우저 테스트는 Vercel 호스팅 테스트가 아니다.

임시 이미지 `seam-note-backend:deploy-validation`은 남겨 검토할 수 있다. 초기 테스트 DB 컨테이너/호스트 Spring은 검증 종료 후 정리했다. 기존 개발 DB는 실행 상태를 유지했다.

## 실제 클라우드 미검증 항목

| 항목 | 현재 상태 / 필요한 작업 |
| --- | --- |
| Supabase Session pooler JDBC·CA·Flyway/JPA | 실제 Connect 값/CA 없음. EC2 비밀 환경 설정 후 확인 필요 |
| Direct IPv6와 비교 / 별도 migration 연결 | 실제 네트워크 미확인. 기본은 동일 Session 연결이며 분리는 선택 경로로만 문서화 |
| Supabase Data API 보호 | 콘솔에서 비활성 또는 private schema 비노출/권한 확인 필요 |
| AWS EC2 OS/리소스/SG/DNS | 비용 승인 및 콘솔 생성 필요. 계정 자격증명 없음 |
| 공인 ACME HTTPS·외부 port 차단·EC2 재부팅 | DNS/실제 서버에서 검증 필요. 로컬 테스트 CA와 구분 |
| Vercel 함수 routing, notes 직접 접근/refresh | 실제 프로젝트 Root Directory와 배포 확인 필요 |
| Vercel Network GET/POST/PUT, 브라우저 Basic 인증 캐시 | 실제 origin에서 /api/hello 인증 → 페이지/Network 확인 필요 |
| 실제 배포 origin의 자동 동기화·오프라인·PWA·ACK | 위 연결 후 기존 시나리오 반복 필요 |

## 사용자가 할 콘솔 작업

1. Supabase의 대상 프로젝트/DB와 기존 데이터 여부 확인 → 실제 **Connect Session pooler** 값과 root CA를 EC2 안전한 파일에 설정 → Data API 보호 확인. 비밀번호를 채팅에 보낼 필요 없다.
2. 서울 Ubuntu 24.04 arm64/t4g.small/암호화 gp3 20 GiB/IPv4의 **실제 견적을 확인해 승인**한 다음 EC2·보안 그룹·도메인 DNS 구성. 약 $21–29/월 예산 추정이며 실제 단가/세금/추가 사용료는 가이드 참조. 생성/구매는 하지 않았다.
3. EC2 `.env`에 DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD, BACKEND_IMAGE, API_HOST, FRONTEND_ORIGIN, ACME_EMAIL, VALIDATION_USERNAME, VALIDATION_PASSWORD_HASH 설정. Compose profile은 prod 고정. CA 파일 설치.
4. 이미지 전송/load 후 `./deploy/scripts/manage.sh deploy`, 직접 HTTPS 무인증 401 및 smoke 확인.
5. 기존 Vercel Root Directory=frontend / Node22 / 서버 환경변수 API_PUBLIC_URL·FRONTEND_ORIGIN 설정 후 승인된 경로로 수동 배포. API keys/DB credentials/VITE_* 비밀은 넣지 않는다.
6. Vercel `/api/hello`에서 공유 검증 자격증명으로 접근한 뒤 notes 새로고침·CRUD·자동 동기화·오프라인 복구를 실제 Network 탭에서 확인한다.

Google 로그인, Supabase Auth, Spring Security 인증/인가, 사용자 소유권/쿼리 분리, 사용자별 Ledger 범위는 다음 단계다. 공유 검증 보호를 사용자 인증으로 간주하지 않는다. 완료 전에는 합성 원고만 사용하고 공개 서비스 운영을 보류한다.
