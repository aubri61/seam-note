# DuckDNS HTTPS · 기존 Vercel 연결 진행 기록

## 현재 범위와 보존

시작 브랜치 fix/initial-draft-recovery, HEAD d0d49e1, 시작 작업 트리 clean. 기존 자동 동기화 수정과 검증 보고서를 보존했다. main merge/push/새 EC2/유료 AWS 리소스 생성/보안 그룹/DB 변경은 하지 않았다. 초기 Draft 수정 소스는 이번에 변경하지 않았다.

## 실제 수행

- AWS CLI `--profile seam-note --region ap-southeast-2`로 지정 인스턴스와 SG를 읽기 조회했다. 기존 ARM64 EC2 running, 사용자 지정 IPv4 및 IPv6 확인. SG는 22의 기존 IP 제한과 80/443 허용이며 8080/5432 공개 없음.
- `dig +short A seamnote.duckdns.org`: 54.79.67.119. AAAA는 없음.
- 기존 검증된 known_hosts/개인키 경로를 사용해 SSH 접속했다. 키 내용은 읽거나 출력하지 않았다. EC2 `.env`는 0600이며 Docker Compose JSON은 프로세스 메모리에서만 해석해 비밀값을 출력하지 않았다. backend는 healthy, readiness UP, 호스트 port binding 없음.
- 실제 `.env`의 API_HOST/ACME_EMAIL은 예제였다. API_HOST는 사용자가 지정한 seamnote.duckdns.org로 변경했다. 이메일은 사용자 지정 대기다.
- 저장된 bcrypt 문자열의 유일한 유효 해시 본문을 그대로 보존하고 불필요한 접두를 제거해 single-quoted dotenv 형식으로 정리했다. 비밀번호/해시는 생성·회전하지 않았다. Compose config는 달러를 $$로 rendering하므로 이를 구분해 보존을 확인했다. 실제 `docker compose --env-file .env -f compose.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 성공. 이 명령은 서비스 포트를 publish하지 않는다. Caddy는 아직 서비스로 시작하지 않았다.
- 기존 Caddyfile/compose/manage.sh의 SHA를 비교하고 기존 구성 재사용을 확인했다. Caddy /data·/config는 named volume이다. 인증서 발급/재생성 후 보존 테스트는 미실행이다.
- Vercel CLI 65.7.0으로 project ls/inspect, 현재 production inspect, env ls를 수행했다. 처음 whoami 신호는 로그인 필요로 분류했지만 이후 실제 프로젝트 조회 권한이 확인돼 추가 로그인은 필요 없다. 기존 dream-in/seam-note, rootDirectory=frontend, origin=https://seamnote.vercel.app를 확인했다. 기존 페이지 200, 기존 /api/hello 404.
- `vercel link --yes --project seam-note --scope dream-in`으로 기존 프로젝트에 로컬만 연결했다. CLI가 .gitignore 끝에 덧붙인 .env* 때문에 example 예외가 덮이는 문제를 수정하고 /.vercel/ 제외만 추가했다.
- `vercel env add API_PUBLIC_URL --environment production --value https://seamnote.duckdns.org --no-sensitive --yes --project seam-note`, 동일 방식으로 FRONTEND_ORIGIN=https://seamnote.vercel.app를 설정했다. 변수명/target만 재조회했다. Basic/DB 비밀이나 VITE_*는 추가하지 않았다. 기존 deployment에는 아직 적용되지 않는다.
- 로컬 pnpm --dir frontend test: 210/210. pnpm --dir frontend build: TypeScript/production PWA build 통과. API proxy는 기존 Basic 전달/익명401/Origin 검사/no-store/Idempotency-Key 전달 구현을 재사용한다. Caddy는 Authorization을 backend에 전달하지 않는다.
- Git HEAD의 frontend 177개 파일만 임시 release 디렉터리로 추출했다. 운영 .env/키/로컬 무시 파일은 포함하지 않았고 새 코드나 Git 이력을 업로드하지 않았다. 승인 요청 대상은 d0d49e1의 프록시·배포 설정·초기 Draft 수정이며 기존 주소의 프론트를 교체한다. 아직 deploy 명령은 실행하지 않았다.
- 새 deploy/tests/public-https.py는 인증정보를 받지 않는 read-only TLS/리다이렉트/익명401/no-store 검증기다. Python 문법 검사 통과. 실제 호출은 현재 공개 HTTPS가 연결되지 않아 실패했고 인증서 성공으로 기록하지 않았다.

## 승인 검토 거부와 대안

자동 승인 검토가 vercel pull을 거부했다. 이유는 두 공개 변수 외 production 환경변수/잠재적 비밀을 로컬로 내려받을 수 있다는 것이다. 실행되지 않았으며 우회하지 않았다. 승인 후 Vercel 원격 빌드를 사용해 로컬 production 환경변수 다운로드를 생략한다.

## 미완료 · 최소 후속

- 사용자에게 ACME 연락 이메일을 질문했다. 기존 Basic 비밀번호/해시는 요청하지 않았다.
- 사용자 지시상 production 배포는 실행 전 승인이 필요하다. 기존 프로젝트/주소·코드 커밋·교체 영향이 포함된 승인 질문을 보냈다.
- 이메일 확인 후 기존 manage.sh deploy로 Caddy 시작, Let's Encrypt 발급, TLS hostname/trust·redirect·익명401, named volume 유지와 컨테이너 재시작 검증을 수행해야 한다.
- production 승인 후 기존 Vercel 프로젝트에 Git 추출 release만 전송해 프록시 배포, 실제 인증된 GET/POST/PUT/멱등성/409 및 PWA 자동 동기화를 검증해야 한다. 기존 비밀번호를 재생성하거나 평문을 채팅에 요청하지 않는다. 해시만으로 인증된 HTTP 요청을 만들 수 있다고 간주하지 않는다.
- 테스트는 신규 독립 합성 데이터만 사용한다. 기존 사용자 데이터에는 이번 단계에서 쓰지 않았다. 실제 HTTPS/Vercel 자동 동기화는 미검증이며 전체 서비스 완료 상태가 아니다.
- 개인 트러블슈팅: docs/troubleshooting/2026-10-29-shared-deployment-boundary.md 갱신(기존 gitignore 유지). 공유 결과: docs/verification/2026-10-30-duckdns-vercel.json.


## 이메일 제공 후 실제 HTTPS 완료

사용자가 ACME 연락 이메일을 제공해 EC2 .env에 반영했다. 기존 bcrypt 전후 동일성을 확인했고 다른 비밀값은 변경하지 않았다. 기존 `bash /home/ubuntu/seam-note/deploy/scripts/manage.sh deploy`를 실제 실행해 Caddy를 시작했다. AWS/SG/DB 설정 변경은 없다.

- Caddy 로그에서 Let's Encrypt ACME 계정 등록·challenge·certificate obtained successfully 확인.
- 시작 직후 probe의 SSLError는 발급 완료 전 handshake였다. 발급 완료 후 `python3 deploy/tests/public-https.py https://seamnote.duckdns.org` 6개 검사 모두 통과했다.
- 실제 TLSv1.3 신뢰/hostname/SAN 검증 성공. issuer=Let's Encrypt YE1, notAfter=2027-01-27 16:24:50 UTC. HTTP→HTTPS 308.
- 익명 /api/workspace/tree와 /actuator/health/readiness는 모두401/Basic challenge/no-store. 명백히 잘못된 Basic 헤더도401. 실제 비밀번호로 인증 성공한 요청으로 혼동하지 않는다.
- `manage.sh restart`로 backend 한 번 재시작 후 readiness UP 복구. `compose up -d --no-deps --force-recreate caddy`로 실제 Caddy 컨테이너 ID가 바뀐 뒤에도 /data·/config named volume identity와 공개 leaf 인증서 지문 동일성 확인. 재생성 후 공개 probe도6/6 통과했다. private key는 읽지 않았다.
- Caddy 컨테이너 내부에서 backend:8080 readiness UP 확인. private network reachability 검사이며 공개 인증된 API 검사와 구분한다.
- 이메일 제공만으로 production 배포를 승인했다고 간주하지 않았다. 기존 seamnote.vercel.app의 production 교체, 인증된 GET/POST/PUT·멱등성·409·PWA 검증은 아직 미실행이다.
- 현재 필요한 승인은 기존 프로젝트에 d0d49e1 frontend를 배포하는 것이다. Git push/merge 없이 기존 주소를 유지하고 API proxy·초기 Draft 수정을 반영하는 범위로 이전 승인 질문을 유지한다.


## Production 승인 후 실제 배포 · 프록시 경로 수정

사용자가 production 배포를 명시적으로 승인했다. 사전 Git 추출 release manifest와 project/org ID를 검증한 후 공식 CLI로 `vercel deploy /private/tmp/seam-note-vercel-release-yx7imtab --prod --yes --scope dream-in --meta sourceCommit=d0d49e17baf630879b5d7e686398eb21612fbd0e`를 실행했다. production 환경변수를 로컬로 내려받지 않고 Vercel 원격 빌드를 사용했다. Git push/merge는 하지 않았다.

첫 배포 dpl_EyTVgNnKL3pqAxBDQeLYkBi3uVzQ는 READY였으나 단일 segment /api/notes·folders는401이고 workspace/tree·notes/UUID는 Vercel NOT_FOUND404였다. 배포 메타데이터에서 api/[...path] lambda가 포함돼 있어 함수 누락과 구분했다. 같은 origin의 cross-origin POST는 기존 ORIGIN_FORBIDDEN403으로 보호됐다.

이를 해결하기 위해 frontend/vercel.json에 /api/:path* → /api/[...path] 내부 rewrite만 추가했다. Basic/Origin/프록시/자동 동기화 코드 변경은 없다. 기존 deploymentProxy Node4개 회귀 통과 후, 승인된 프록시 연결 범위에서 이 단일 파일만 release에 덧씌워 같은 프로젝트에 재배포했다. 다른 release 파일은 Git d0d49e1과 byte 단위로 동일함을 확인했다. 해당 경로 수정은 작업 트리에 보존돼 있으며 새 Git 커밋은 만들지 않았다.

최종 deployment dpl_8dUUz1Nx2iP79JGffnXXmqeMnLTq, https://seam-note-4wbe04zer-dream-in.vercel.app, READY. 기존 seamnote.vercel.app 및 seam-note-dream-in.vercel.app alias 유지. 실제 배포 inspect에서 내부 rewrite와 api/[...path] nodejs22.x lambda/iad1 확인.

실제 검증:

- 기존 frontend / 및 notes/UUID 직접 접근200, sw.js200/no-cache, manifest200.
- workspace/tree·notes/UUID 익명 요청401, proxy VALIDATION_ACCESS_REQUIRED/Basic challenge/no-store.
- 같은 다중 경로에 명백히 잘못된 Basic 헤더를 보내면 Caddy의 restricted realm401이 Vercel을 거쳐 반환된다. 따라서 Vercel→Caddy HTTPS 연결을 확인했으며 실제 성공한 인증 요청으로 과장하지 않는다.
- 외부 Origin POST403/ORIGIN_FORBIDDEN. 요청은 보호 단계에서 종료돼 원고 쓰기는 하지 않았다.
- 재배포 후 EC2 공개 HTTPS probe도 재통과. 인증서/컨테이너 재생성 검증은 앞 절 결과를 유지한다.

## 브라우저 인증 검증의 실제 한계

배포 프론트엔드를 검증용 in-app browser에 열어 실제 UI가 로드되는 것을 확인했다. 보호된 /api/workspace/tree 탐색은 net::ERR_BLOCKED_BY_CLIENT로 막혔다. TLS 경고나 인증 보호를 우회하지 않았다. 이후 native Chrome 바인딩 호출이 도구 기준30392.4045초 후 반환되는 장시간 지연이 발생했다. 원인은 확인되지 않았고 웹앱·API 지연으로 단정하지 않는다. 더 이상 브라우저 제어 호출은 하지 않고 CLI로 production200/익명401/upstream401을 다시 확인했다.

인증된 GET/POST/PUT·멱등성/409·실제 Vercel PWA 자동 동기화는 아직 미실행이다. 정상 기존 Basic 로그인 세션이 필요하며 EC2의 bcrypt만으로 인증 헤더를 생성할 수 없다. 비밀번호를 새로 만들거나 채팅으로 요청하지 않았다. 기존 사용자 원고에는 이번 검증에서 쓰기·삭제를 하지 않았다. 인프라/프록시 배포 완료와 전체 서비스 통합 검증 완료를 구분한다.

최소 후속은 사용자가 https://seamnote.vercel.app/api/workspace/tree에서 기존 Basic 로그인을 정상 브라우저에서 완료하는 것이다. 실제 비밀번호나 헤더는 채팅에 보내지 않는다. 원격 권한/DB/기존 비밀값 변경은 필요 없다.


## 후속 main 통합·배포 승인

사용자가 현재 배포·동기화 작업 전체의 commit/push, PR 제목·본문 작성과 생성, main 병합, 병합 후 production 배포를 명시적으로 승인했다. 위의 미배포/미승인 표기는 각 검증 시점의 이력이다. 운영 인증된 CRUD/PWA 미검증 한계는 그대로 유지하며 merge 후 실제 배포 결과는 해당 PR에 기록한다. 비밀정보·개인 troubleshooting 제외 정책을 유지한다.
