# 2026-10-30 실제 ARM64 EC2·Supabase 배포

## 완료 범위

기존 `chore/deploy-infra` 브랜치의 backend를 새 EC2에서 실제 실행했다. 현재 백엔드는 private Docker network에서만 실행되며 DB 포함 readiness가 UP이다. 공개 HTTPS와 Vercel API 연결은 아직 미완료다. 실제 자동 동기화의 첫 원고 초기화 문제도 발견해 통과와 구분한다.

AWS 호출에는 `--profile seam-note --region ap-southeast-2`를 명시했다. 실제 조회 리전은 시드니이며 서울로 새 리소스를 만들지 않았다. AWS 리소스 생성·삭제·재생성·보안 그룹 변경, 도메인 구매, push/merge를 하지 않았다.

## 대상 확인과 SSH

| 구분 | 실제 조회 결과 |
| --- | --- |
| 새 대상 | i-0fbbb17cfc43f331c / seam-note-server / arm64 / t4g.small / running |
| 이전 대상 | i-05ffa1bebcff9dc01 / x86_64 / t3.micro / terminated, 조회만 수행 |
| 실제 리전/AZ | ap-southeast-2 / ap-southeast-2b |
| 새 EC2 공인 IPv4 | 54.79.67.119 |
| 새 EC2 IPv6 | 할당 확인, 호스트 및 실제 backend의 Direct 연결 성공 |
| OS / Docker / Compose | Ubuntu 24.04.5 LTS aarch64 / 29.1.3 / 2.40.3 |
| 보안 그룹 | seam-note-sg, SSH 단일 사용자 IP/32, 80·443 IPv4 인터넷, backend/DB 포트 inbound 없음 |

SSH 키 이름은 seam-note-key이고 기존 로컬 키 파일을 사용했다. 개인키 내용을 출력하거나 전송하지 않았다. AWS 인증된 console output의 ED25519 지문과 ssh-keyscan 지문을 대조한 전용 known_hosts로 StrictHostKeyChecking=yes 접속했다. 기존 EC2나 다른 프로젝트 디렉터리는 변경하지 않았다.

## 이미지·파일·비밀 설정

- 코드 기준: 3a9b7e9. `docker build --platform linux/arm64 -t seam-note-backend:3a9b7e9-arm64 backend` 실제 성공.
- 이미지 tar.gz를 SCP 전송하고 EC2에서 docker load 성공. 양쪽 전송 SHA-256: `a2de7be657f47d19a0eece416ae47b4d7384f81cad31385b6be29dcb78437af0`.
- Docker 20(로컬)과 29(EC2)의 표시 image ID가 달라 RootFS layer digests, entrypoint, linux/arm64를 별도 비교해 동일함을 확인했다.
- 서버 디렉터리: `/home/ubuntu/seam-note`. deploy 파일과 루트 .gitignore를 전송했다. 원격 .env.example은 커밋된 비밀 없는 예제로 생성했다.
- 시작 시 사용자가 수정한 deploy/.env.example에 실제 DB_PASSWORD 값이 있었다. 값은 출력·로그·커밋하지 않고 SSH stdin으로 EC2의 `/home/ubuntu/seam-note/deploy/.env`에만 이동했다. 파일 권한 0600 확인. 로컬 예제의 DB_PASSWORD만 기존 placeholder로 복원했고 다른 사용자 값은 보존했다.
- 서버 `.env` BACKEND_IMAGE와 ENABLE_IPV6는 실제 배포 값으로 설정했다. DB 비밀번호나 Basic 비밀번호를 새로 생성하지 않았다. Caddy 비밀번호 해시는 사용자가 직접 입력해야 한다.

## Direct IPv6·TLS·Flyway

새 EC2 호스트의 실제 DB AAAA 조회와 TCP 5432 연결을 확인했다. Docker 기본 bridge는 IPv6=false라 host TCP 성공만으로는 backend 연결이 보장되지 않았다. Compose에 `ENABLE_IPV6` opt-in을 추가하고 서버 .env에 true를 설정했다. 전용 user-defined bridge의 private IPv6/NAT만 사용하며 host networking이나 backend port publishing을 도입하지 않았다. 기존 로컬/Session pooler는 false 기본값을 유지한다.

처음 내려받은 Project CA로는 실제 Direct endpoint의 레거시 체인을 검증할 수 없어 OpenSSL verify error 19로 실패했다. Supabase 공개 HTTPS 다운로드의 Root 2021 CA를 별도로 확인해 실제 체인·hostname 검증을 통과한 후 JDBC CA 파일에 적용했다. 검증을 끄거나 sslmode를 require로 낮추지 않았다.

- 공개 CA 다운로드: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- root fingerprint SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- 실제 JDBC 메타데이터: SSL=true, TLSv1.3, Flyway V1–V5 성공 5개·실패 0개.
- prod Flyway가 새 `seam_note` 스키마를 만들고 기존 V1–V5 원본을 적용했다. JPA ddl-auto=validate 초기화 성공. 기존 public/타 스키마 데이터를 초기화·삭제·이전하지 않았다.
- anon/authenticated schema USAGE=false, anon notes SELECT/INSERT/UPDATE/DELETE=false를 read-only JDBC probe로 확인했다. DB 자격증명과 원고 본문은 probe 출력에 넣지 않았다. Dashboard Data API 토글 자체는 조회하지 않았다.

## 실행·실제 검증

기존 manage.sh에 `deploy-backend` 모드를 추가해 Caddy preflight/시작 없이 내부 backend만 올릴 수 있게 했다. 실제 실행 명령은 `./deploy/scripts/manage.sh deploy-backend`이며 성공했다. API_HOST/ACME_EMAIL/VALIDATION_PASSWORD_HASH가 아직 예제 값이므로 Caddy는 시작하지 않았다. 컨테이너 PortBindings={}를 확인했다.

| 검사 | 실제 결과 / 범위 |
| --- | --- |
| AWS 인증, ARM64 대상/SG/IPv6 조회 | 성공, seam-note 프로필과 실제 리전 사용 |
| ARM64 이미지 build/SCP/load/무결성 | 성공 |
| EC2 host IPv6 TCP / Direct CA·hostname | 성공 |
| backend Direct JDBC / Flyway / JPA | 성공, TLSv1.3 / schema v5 |
| Docker health / readiness | healthy / UP |
| 실제 서버 smoke | 13개 통과: GET/POST/PUT/PATCH/DELETE, 생성·수정 ACK/재전송, expectedVersion 409, key/payload 불일치 409 |
| 합성 테스트 정리 | 자체 UUID 폴더·노트만 정리, Ledger는 기존 정책에 따라 유지 |
| 실제 EC2 backend 재시작 / 데이터·Ledger | readiness UP, 합성 원고와 동일 key replay 유지 3개 통과 |
| 기존 로컬 TLS/HTTPS stack | 19개 재실행 통과. 실제 공개 HTTPS 통과로 간주하지 않음 |
| frontend proxy transport mock | 4개 통과 |
| frontend production build / shell syntax / diff check | 통과 |
| 기존 Vercel 정적 페이지 / hello API | 실제 HTTP 200 / 404. API 함수 연결은 아직 없음 |
| 실제 원격 backend에 연결한 production PWA | 첫 원고 로컬 초기화 충돌 재현, 자동 동기화 불통과 |
| 공개 Caddy HTTPS / 실제 Vercel GET·POST·PUT | 미실행, 도메인·Basic 설정 및 Vercel 인증 필요 |

SSH 터널의 로컬 loopback과 backend private IP를 연결해 실제 API를 검증했다. 외부 API 포트를 열지 않았다. 단순 2초 대기 때문에 초기 SSH tunnel이 준비되기 전 연결 실패한 임시 검사도 있었으며 실제 연결 대기로 고쳐 다시 실행했다. 최초 재시작 GET의 전체 DTO 비교는 한 번 실패했으나 차이 필드를 수집하지 않아 원인은 미확정이다. 후속 검사에서 전체 필드의 차이 목록이 비어 있었고, 원고/버전/시간값과 Ledger replay가 유지됐다. 시간값 검사는 저장 정밀도의 1마이크로초 이내 차이만 별도로 허용했으며 성공한 재검증에서는 해당 차이도 없었다. 읽기 전용 컨테이너의 docker cp 거부는 보호를 끄지 않고 writable tmpfs의 exec stdin으로 진단을 수행해 해결했다.

## 자동 동기화에서 발견한 남은 문제

신규 origin/로컬 Draft가 없는 서버 원고의 첫 GET 응답이 늦으면 startup의 `session.retry`가 서버 조회 완료 전 빈 로컬 상태를 `LocalDraftConflict`로 분류한다. 이후 서버 응답은 200이어도 로컬 스냅샷이 없고 PUT이 시작되지 않는다. 강제 SW reload를 제거해도 재현됐다. 진단 GET은 note 약 0.99–2.47초, workspace 약 1.99–2.07초였으며 통계/성능 부하 측정은 아니다.

기존 DraftSession 모듈을 `select→빈 로컬 read→retry→지연 receive→flush` 순서로 실행해 phase=conflict/write=0을 별도로 재현했다. 사용자가 자동 동기화/Outbox/ACK/PWA 변경을 금지했으므로 제품 소스는 수정하지 않았다. 오프라인 복구 검사는 이 초기화 단계에서 막혀 실행하지 못했다. 별도 동기화 수정 단계에서 최초 미생성 상태와 실제 기록 삭제를 구분하는 recovery barrier 및 전체 회귀가 필요하다.

공유 결과: [실제 EC2/DB 검증](../verification/2026-10-30-ec2-supabase.json), [PWA 미통과 기록](../verification/2026-10-30-ec2-pwa.json).
로컬 전용 트러블슈팅: docs/troubleshooting/2026-10-29-shared-deployment-boundary.md, docs/troubleshooting/2026-10-29-frontend-auto-sync.md. 기존 Git ignore 정책을 유지한다.

## 남은 최소 사용자 작업과 후속 실행

1. EC2의 `/home/ubuntu/seam-note/deploy/.env`에서 API_HOST, ACME_EMAIL, VALIDATION_PASSWORD_HASH를 직접 설정하고 API DNS를 새 EC2 IPv4로 연결한다. Basic 해시는 서버의 `docker run --rm -it caddy:2.10.2-alpine caddy hash-password` 숨김 프롬프트로 생성한다. 비밀번호/해시는 채팅에 보내지 않는다. 도메인 구매나 DNS/보안 그룹의 새 변경을 대리 실행하지 않았다.
2. 위 값이 준비되면 에이전트가 DNS 확인→manage.sh deploy→공인 TLS/무인증 401→Vercel 서버 환경 API_PUBLIC_URL/FRONTEND_ORIGIN 및 배포를 이어갈 수 있다. Vercel CLI 65.5.0 whoami도 실제 실행했으며 Logged out 상태로 확인됐다. Vercel 로그인 후 기존 프로젝트 접근이 필요하다. 그 전에는 Caddy를 올리지 않는다.
3. 자동 동기화 초기화 경쟁은 이번 변경 금지 범위이므로 별도 수정 작업에서 처리한다. 그전까지 실제 사용자 원고를 저장하는 공개 서비스로 전환하지 않는다.
