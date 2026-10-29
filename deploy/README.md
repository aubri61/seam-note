# EC2 + Supabase + Vercel 배포

이 구성은 **공유 검증자만 사용하는 배포**다. 실제 공개 서비스 운영과 실제 사용자 원고 저장은 Google 로그인·사용자별 권한 구현까지 보류한다. 공유 Basic 인증은 OAuth나 사용자별 데이터 분리가 아니며, 자격증명을 아는 검증자는 모든 테스트 원고에 접근할 수 있다. 합성 데이터만 사용한다.

## 조사 결과와 구성

- Java 21 / Gradle wrapper 9.8.2 / Spring Boot 4.1.2. Spring Data JPA, PostgreSQL JDBC, Flyway 사용.
- 기존 Dockerfile·운영 Compose·Vercel routing 설정은 없었다. 루트 docker-compose.yml의 PostgreSQL 17, loopback 15439, 기존 volume을 변경하지 않는다.
- 기본 application.yml과 test profile 유지, prod만 별도 추가. JPA `ddl-auto=validate`, Flyway V1–V5 원본 유지. 신규 migration 없음.
- prod는 `seam_note` 스키마를 Flyway, Hibernate, JDBC `currentSchema`에 공통 적용한다. JdbcTemplate Ledger도 이 스키마를 사용한다. 엔티티·테이블·트랜잭션·expectedVersion·advisory transaction lock·Ledger 구현은 유지한다.
- Axios `/api`, TanStack Query, IndexedDB, Outbox/ACK, 자동 동기화 코드는 변경하지 않는다.
- SW는 정적 자산만 precache하고 API runtimeCaching은 없다. API navigation fallback 제외 유지. 프록시와 Caddy는 API에 `no-store`를 강제한다.

```text
검증 브라우저 --HTTPS--> Vercel static React/PWA
                /api/* --> Vercel Node function (인증 헤더 전달, 비밀 주입 없음)
                             --HTTPS--> Caddy (Basic 검증, origin 검사)
                                          --> Spring:8080 (host publish 없음)
                                               --JDBC verify-full--> Supabase Session pooler:5432
```

CORS 허용 설정은 필요 없다. 브라우저는 Vercel의 같은 origin `/api`만 호출한다. Spring을 직접 인터넷에 연결하거나 VITE_* 비밀 키를 사용하지 않는다. Vercel 프록시 경유와 API 도메인 직접 접근 모두 Caddy가 검증한다. Origin 검사는 CSRF 방어 보조이며 인증을 대체하지 않는다.

## 1. 비용·리소스 승인 먼저

추천: Supabase와 가까운 AWS 서울 리전, Ubuntu Server 24.04 LTS **arm64**, **t4g.small (2 vCPU / 2 GiB RAM)**, 암호화 gp3 20 GiB, 단일 EC2 + Caddy. Java 컨테이너 1 GiB, Caddy 256 MiB 제한이며 나머지는 OS에 둔다. 빌드는 로컬/CI에서 하고 이미지만 전송한다. x86이 필요하면 t3.small과 linux/amd64 이미지를 선택한다. micro 1 GiB는 JVM/OS 여유가 작아 추천하지 않는다.

승인용 예산 추정(USD, 월 730시간, 세금·도메인 제외): EC2 약 $15–22 + EBS 약 $2–3 + 공인 IPv4 $3.65 = **약 $21–29/월**. 이는 서울 실시간 견적 확정값이 아닌 예산 범위다. 생성 전에 AWS Pricing Calculator에서 선택한 AMI/리전의 Linux 온디맨드 단가를 확인하고 `시간당 단가 × 730`으로 다시 승인받는다. CPU burst 초과 크레딧, egress, snapshot/backup, 로그 서비스, 도메인, Supabase 유료 플랜, Vercel 함수 사용량은 별도다. 무료 크레딧 적용이나 계정 무료 자격을 가정하지 않는다. EC2를 중지해도 EBS와 미해제 고정 IP 등의 비용은 남을 수 있다. NAT Gateway·ALB·RDS는 만들지 않는다.

[EC2 사양](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html), [EC2 요금](https://aws.amazon.com/ec2/pricing/on-demand/), [공인 IPv4 $0.005/시간](https://aws.amazon.com/vpc/pricing/), [EBS 요금](https://aws.amazon.com/ebs/pricing/), [계산기](https://calculator.aws/).

이번 작업에서는 유료 리소스를 생성하지 않았다. 인스턴스·Elastic IP·도메인·유료 Supabase 플랜 생성은 위 비용과 실제 견적을 확인한 뒤 승인해야 한다.

## 2. Supabase 콘솔

1. 기존 프로젝트를 사용할지 새 검증 프로젝트를 만들지 결정한다. 기존 데이터가 있는 DB에는 무조건 초기 실행하지 않는다. 프로젝트와 DB 대상 및 `seam_note` 스키마/테이블 존재 여부부터 확인한다.
2. Dashboard **Connect**에서 실제 문자열을 읽는다. IPv4-only EC2는 **Session pooler**(보통 5432)를 우선 선택한다. host/user/project ref를 예시에서 조립하지 않는다. 화면의 DB host/port/name/username을 아래 환경변수에 각각 복사하고 비밀번호는 EC2의 비밀 파일에만 입력한다.
3. IPv6 라우팅이 실제 구성된 경우 Direct connection과 연결성/지연을 비교할 수 있다. Direct는 기본 IPv6이고 별도 IPv4 옵션은 비용 확인이 필요하다. **Transaction pooler 6543은 사용하지 않는다.** 현재 코드는 session/transaction advisory lock과 prepared statement 호환성이 필요하다. Flyway도 동일 Session 연결을 사용한다.
4. Database 설정의 SSL enforcement를 켜고 서버 root CA를 내려받아 EC2 `deploy/certs/supabase-ca.crt`에 설치한다(컨테이너 uid 10001이 읽을 수 있게 인증서는 0644). JDBC `verify-full`은 CA 체인과 Connect hostname을 검증한다. `require`로 낮추거나 hostname 검증을 끄지 않는다. 풀러가 별도 체인을 제공하면 해당 endpoint에 맞는 신뢰 CA를 확인한다. 실제 Pooler TLS는 아직 미검증이다.
5. 앱은 Supabase REST/GraphQL을 쓰지 않으므로 **Data API를 비활성화**한다. 비활성화할 수 없는 공유 프로젝트면 `seam_note`를 Exposed schemas에 추가하지 않고, `anon`/`authenticated`의 스키마 권한도 검토한다. 이를 확인하기 전 데이터 입력을 보류한다. Supabase Auth는 도입하지 않는다.
6. Hikari 최대 3, 최소 idle 1. 단일 인스턴스 기준이며 migration 순간 연결·Dashboard·기타 클라이언트까지 DB 제한에 포함된다. 다중 인스턴스 배포는 별도 예산 검토가 필요하다.

기존 로컬 데이터는 자동 이전하지 않는다. 새 운영 스키마는 빈 상태에서 V1–V5를 적용한다. 기존 public 테이블을 발견해도 자동 baseline/clean/repair/rename하지 않는다. 데이터 이전은 대상 확인·백업·별도 승인 후 수행한다. Flyway `clean-disabled=true`, `baseline-on-migrate=false`다.

별도 migration 연결은 기본적으로 만들지 않는다. Session pooler에 실제 Flyway/JPA/CRUD 테스트가 실패하면 먼저 DNS/TLS/사용자/권한을 확인한다. Direct IPv6나 별도 migration 역할이 필요한 것으로 확인된 경우에만 `SPRING_FLYWAY_URL`, `SPRING_FLYWAY_USER`, `SPRING_FLYWAY_PASSWORD`를 EC2 비밀 환경에 추가한다. JDBC URL에는 `currentSchema=seam_note&sslmode=verify-full&sslrootcert=/run/certs/supabase-ca.crt`를 동일하게 적용한다. 별도 migration 계정은 runtime 계정에 schema/table/sequence 권한을 부여해야 한다. 이 분리 경로는 미검증이다.

[Supabase 연결·TLS](https://supabase.com/docs/guides/database/connecting-to-postgres), [pgJDBC SSL](https://jdbc.postgresql.org/documentation/ssl/), [Supabase API 보호](https://supabase.com/docs/guides/api/securing-your-api).

## 3. EC2 콘솔과 호스트 준비

승인 후 콘솔에서 위 OS/타입을 생성한다. IMDSv2 필수, 최소 IAM 권한, EBS 암호화, 필요한 SSH 키를 설정한다. DB와 API가 가까운 리전을 사용한다.

| 방향 | 포트 | 출발지/대상 |
| --- | --- | --- |
| inbound | 22/TCP | 검증자 공인 IP/32만. 가능하면 SSM으로 SSH 대체 |
| inbound | 80/TCP | 인터넷, Caddy HTTP→HTTPS 및 ACME challenge용 |
| inbound | 443/TCP | 인터넷, 모든 API 요청은 Basic 검증 |
| inbound | 8080, 18765, 5432, 15439, 2019 | **규칙을 만들지 않음** |
| outbound | 443/TCP, 5432/TCP, DNS | 이미지/ACME 및 실제 Supabase pooler, DNS resolver. OS 패키지 설치 시 80도 필요할 수 있음 |

IPv6를 쓸 때만 동등한 IPv6 규칙과 라우팅을 설정한다. API 도메인 A record를 EC2 고정 주소에 연결한다. AAAA는 실제 IPv6가 작동할 때만 추가한다. 필요하면 Elastic IP 비용을 승인받고 생성한다. 일반 공인 IP는 stop/start 시 바뀔 수 있다.

Ubuntu에서 Docker와 Compose v2를 설치한다(패키지 버전은 생성한 OS에서 확인).

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
# SSH 재접속 후
docker version
docker compose version
```

저장소의 `deploy/`를 EC2에 복사한다. `.env`·CA·이미지 tar를 Git에 넣지 않는다. 다음 명령은 저장소 루트 기준이다.

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# 편집기로 실제 값 입력. shell history나 채팅에 비밀번호를 입력하지 않는다.
# Caddy 비밀번호는 아래 대화형 프롬프트에서 입력하고 출력된 bcrypt만 .env에 저장한다.
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

`.env`에서 비밀번호와 bcrypt는 **작은따옴표**로 감싸 `$`/`#`의 보간을 막는다. 새 자격증명은 검증자에게 안전한 별도 경로로 전달한다. API_HOST는 scheme/path 없는 DNS hostname, FRONTEND_ORIGIN은 끝 `/` 없는 정확한 HTTPS origin이다.

## 4. 빌드·전송·배포·롤백

먼저 테스트를 통과한 checkout에서 이미지 생성. t4g는 arm64다. Linux amd64 환경에서 빌드하면 `--platform linux/arm64`와 buildx/QEMU 지원이 필요하다. 반대로 t3는 linux/amd64를 사용한다.

```bash
# 로컬 저장소 루트에서. 아래 SHA는 배포할 커밋의 실제 값이다.
DEPLOY_SHA=$(git rev-parse --short HEAD)
docker build --platform linux/arm64 -t seam-note-backend:$DEPLOY_SHA backend
docker save seam-note-backend:$DEPLOY_SHA | gzip > /private/tmp/seam-note-backend.tar.gz
# 승인 후 생성한 서버의 실제 hostname으로 전송
scp /private/tmp/seam-note-backend.tar.gz ubuntu@EC2_HOST:~/
# deploy/ 디렉터리도 전송한다(.env는 서버에서 직접 작성).
```

EC2에서:

```bash
gunzip -c ~/seam-note-backend.tar.gz | docker load
# deploy/.env BACKEND_IMAGE를 위 실제 SHA tag로 설정
./deploy/scripts/manage.sh deploy
./deploy/scripts/manage.sh status
./deploy/scripts/manage.sh logs
```

`manage.sh deploy`는 Compose/Caddy 유효성을 검증하고 DB를 포함한 readiness를 기다린다. 내부 readiness가 200일 때 Caddy를 시작한다. Caddy /data volume이 ACME 인증서를 유지한다. **공개 401/HTTPS 검증까지 자동 완료되는 것은 아니다.**

재배포: 새 tag 이미지를 별도로 load → 이전 BACKEND_IMAGE 값을 안전한 운영 기록에 남김 → `.env` tag 변경 → `manage.sh deploy`. 공유 태그 latest를 쓰지 않는다. 첫 빌드에는 Gradle/JDK 다운로드가 필요하다. 현재 베이스 이미지는 major/JRE tag이므로 이후 빌드 시 patch 내용이 바뀔 수 있다. 검증한 최종 앱 이미지 tag/이미지 ID 또는 registry digest를 함께 보관한다.

```bash
./deploy/scripts/manage.sh restart   # backend만 재시작
./deploy/scripts/manage.sh stop      # 컨테이너 중지, DB/인증서 삭제 없음
# 롤백: .env BACKEND_IMAGE를 이전 tag로 복원 후
./deploy/scripts/manage.sh deploy
# 상태/로그를 확인하고 같은 HTTPS smoke를 다시 실행한다.
```

DB는 Supabase에 있으므로 컨테이너 교체로 지워지지 않는다. 새 migration을 도입한 후의 이미지 롤백은 스키마 하위 호환성을 먼저 검토한다. 이번 변경에는 신규 migration이 없다. `down -v`, DB drop, Flyway clean은 배포/롤백 명령에 포함하지 않는다.

Health: `docker compose --env-file deploy/.env -f deploy/compose.yml exec -T backend curl -fsS http://localhost:8080/actuator/health/readiness`. DB 불가 시 503. 잘못된 TLS/비밀번호는 startup Flyway/Hikari 오류와 컨테이너 로그로 확인한다. JVM 종료는 restart policy가 복구한다. **unhealthy 상태만으로 Docker가 자동 재시작하지는 않는다**. 로그·health 관측 및 알림 연결은 별도 운영 작업이다. 실패 로그를 공유할 때 JDBC host/user·비밀번호·원고를 제거한다. `docker compose config`를 출력하면 비밀이 펼쳐지므로 `config --quiet`만 사용한다.

## 5. Vercel 프로젝트

1. 기존 프로젝트 Settings를 확인한다. 프로젝트 **Root Directory=frontend**, Framework=Vite, Node=22.x. pnpm 10.32.1 / frozen lockfile, output=dist가 코드에 명시돼 있다. 기존 root가 다르면 변경 전 영향 확인이 필요하다.
2. Production(검증 preview도 필요하면 해당 환경)에 서버 전용 `API_PUBLIC_URL`, `FRONTEND_ORIGIN`을 설정한다. 첫 값은 Caddy의 `https://API_HOST`, 둘째는 현재 승인한 Vercel/custom frontend origin이다. **VITE_ 접두사를 붙이지 않는다.** DB 변수나 Basic 비밀번호는 Vercel에 필요 없다.
3. `frontend/api/[...path].js`가 Node 서버 함수로 배포되고 `/api/*`를 처리하는지 확인한다. rewrite는 `/notes/:id`만 index.html에 보낸다. API를 SPA HTML로 보내는 전역 catch-all rewrite를 추가하지 않는다.
4. 이번 작업은 push 금지이므로 자동 Git 배포를 유발하지 않는다. 로컬 검증된 checkout의 `frontend/`에서 Vercel CLI/dashboard가 제공하는 기존 프로젝트 배포 절차로 수동 배포하거나, 별도 승인 후 branch를 올린다. 기존 프로젝트 연결/권한이 없어 실제 배포는 아직 하지 않았다.
5. 브라우저에서 **먼저 `https://FRONTEND_HOST/api/hello`로 직접 이동**, 검증용 Basic 자격증명을 입력한다. 200 응답을 확인한 뒤 `/`로 이동한다. `/api/hello`에서 인증하면 브라우저 인증 범위가 `/api/`가 되어 다른 API 요청에도 사용된다. 인증 만료/401 후 자동 재시도 폭주 대신 다시 이 주소에서 인증하고 기존 수동 동기화 버튼으로 재시도한다. 자격증명을 앱 코드/localStorage에 저장하지 않는다.
6. `/notes/:id` 직접 접근·새로고침, Network의 GET/POST/PUT 2xx, Idempotency-Key ACK, 409 계약을 검증한다. 브라우저/프록시의 Basic 캐시 동작은 실제 Vercel URL에서도 확인해야 한다. `/api`의 CDN cache는 no-store이며 SW cache에도 API가 없어야 한다.
7. 보조적으로 Vercel Deployment Protection도 활성화할 수 있다. 계정 플랜의 적용 범위를 콘솔에서 확인한다. API 보호는 이 옵션에 의존하지 않는다. 인증 없는 EC2 직접 호출은 항상 401이어야 한다.

Preview 호스트에서 쓰기를 하려면 FRONTEND_ORIGIN과 Caddy를 해당 정확한 origin에 맞춘 별도 검증 환경을 사용한다. wildcard Origin 허용을 추가하지 않는다. origin을 바꾸면 IndexedDB는 브라우저 origin별로 별도 저장된다. 기존 Vercel origin을 유지하고, 오프라인 pending 원고를 먼저 동기화/백업한다. Basic 자격증명을 바꿔도 기존 브라우저의 로컬 원고가 자동 삭제되지는 않는다.

[Vercel Node 함수](https://vercel.com/docs/functions/runtimes/node-js), [routing](https://vercel.com/docs/routing/rewrites), [Caddy Basic](https://caddyserver.com/docs/caddyfile/directives/basic_auth).

## 제공할 환경변수와 안전한 위치

| 이름 | 설정 위치 |
| --- | --- |
| DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD | EC2 deploy/.env, 실제 Connect 화면에서 입력 |
| SPRING_PROFILES_ACTIVE | Compose가 prod로 고정; 로컬 기본 profile 유지 |
| BACKEND_IMAGE | EC2 deploy/.env, 검증한 불변 tag |
| API_HOST, ACME_EMAIL | EC2 deploy/.env |
| VALIDATION_USERNAME, VALIDATION_PASSWORD_HASH | EC2 deploy/.env, 비밀번호는 대화형 hash 생성 |
| API_PUBLIC_URL | Vercel 서버 환경변수, HTTPS origin만 |
| FRONTEND_ORIGIN | EC2 deploy/.env 및 Vercel 서버 환경변수에 같은 값 |
| SEAM_NOTE_API_TARGET | 로컬 Vite만, 기본 http://127.0.0.1:18765 |

CA 파일은 EC2 deploy/certs/supabase-ca.crt. 비밀번호/접속 자격증명은 채팅에 붙여 넣지 않는다. `.env`는 gitignore되고 Docker build context에는 main 소스/Gradle 파일만 포함된다.

## 실제 환경 검증 순서 (미실행 항목은 통과 아님)

1. 정확한 Supabase 프로젝트/DB/스키마, Data API 비활성, CA, security group/DNS를 확인.
2. EC2 readiness=200, Flyway schema history V1–V5 success, JPA validate 및 `pg_stat_ssl`로 실제 DB TLS 확인.
3. 무인증 `curl -i https://API_HOST/api/workspace/tree`는 401, `/actuator/health`는 인증 후에도 404. HTTP는 HTTPS로만 redirect. Spring 포트는 외부에서 연결되지 않아야 한다.
4. 합성 데이터 쓰기/정리는 아래 명령으로 실행한다. 비밀번호는 숨김 프롬프트에서만 입력된다. 스크립트는 자체 UUID 폴더만 정리한다. 초기화/기존 원고 삭제는 하지 않는다.

```bash
python3 deploy/scripts/smoke.py --base-url https://API_HOST/api --validation-user reviewer --confirm-synthetic-writes
# 실제 Vercel origin에도 동일 실행
python3 deploy/scripts/smoke.py --base-url https://FRONTEND_HOST/api --validation-user reviewer --confirm-synthetic-writes
```

5. 별도 합성 원고 저장 → backend restart → 조회 및 같은 operationId replay 확인. DB 재시작은 Supabase 관리형 동작에 맞춰 계획하며 운영 DB를 임의 재시작하지 않는다.
6. Vercel 실제 브라우저: 작성 자동 동기화 → ACK 후 reload → 비행기 모드에서 작성 → 앱 종료/오프라인 재실행 → 온라인 복구 → 자동 ACK 및 서버 내용 확인. Network에서 API가 SW/cache에서 반환되지 않는지 확인. 401 상태에서는 로컬 변경이 유지돼야 한다.
7. Google 로그인, Supabase Auth, Spring Security 인가, 사용자 소유권/쿼리 분리, Ledger 사용자 범위는 다음 단계다. 완료 전 공유 검증 환경을 공개 서비스로 전환하지 않는다.

로컬 검증 재실행:

```bash
# Java 21 및 격리 TEST_DB_URL/TEST_DB_USERNAME/TEST_DB_PASSWORD를 로컬 환경에 설정
(cd backend && ./gradlew test bootJar)
(cd frontend && pnpm test && pnpm build && pnpm lint)
docker build -t seam-note-backend:deploy-validation backend
python3 deploy/tests/local-stack.py
```

`local-stack.py`는 임시 Compose project/loopback port/합성 비밀번호/전용 PostgreSQL/테스트 CA만 사용한다. 클라우드 및 deploy/.env를 읽지 않는다. 종료 시 자기 project와 volume만 정리한다. 실제 클라우드 검증 현황은 [검증 기록](../docs/worklogs/2026-10-29-deploy-infra.md)에 구분해서 남긴다.
