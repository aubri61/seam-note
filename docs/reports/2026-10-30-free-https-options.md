# 도메인 구매 없는 Vercel → EC2 HTTPS 비교

조사일: 2026-10-30. 조사·설계만 수행했으며 DNS 등록, 터널 실행, EC2/보안 그룹/DB/운영 .env/Vercel 변경은 하지 않았다. 기존 *.vercel.app 프론트 주소는 그대로 사용할 수 있다. 브라우저 → Vercel 같은 출처 /api → HTTPS upstream 구조와 현재 서버 함수 프록시를 유지한다.

## 선택지

| 방식 | 장점 | 제약·운영 부담 | 기존 코드 변경 범위 |
| --- | --- | --- | --- |
| DuckDNS 무료 서브도메인 + Caddy | 구매 없이 유지되는 hostname, IP 변경 시 DNS만 갱신 가능 | 무료 계정/이름 확보 필요. DNS 서비스 의존, EC2 주소 갱신 필요 | 애플리케이션 변경 없음. API_HOST·ACME_EMAIL·Basic hash 및 Vercel API_PUBLIC_URL 설정. 선택적으로 DDNS 갱신 도구/서버 비밀 추가 |
| sslip.io / nip.io IP 기반 이름 + Caddy | 계정·DNS 레코드 생성 없이 IP 포함 이름 사용 | IP가 바뀌면 이름도 바뀌므로 Vercel 환경 갱신·재배포 필요. 공용 DNS/CA quota 의존 | 애플리케이션 변경 없음. 위 환경변수만 설정. Caddy 인증서 발급 성공은 실제 적용 때 검증 필요 |
| Cloudflare Quick Tunnel | 계정·구매 도메인 없이 임시 HTTPS, EC2 inbound 공개 포트 추가 불필요 | 재실행마다 hostname 변경, uptime 보장 없음, 최대 200 in-flight, SSE 미지원. 임시 개발·시험용 | cloudflared 서비스 + 내부 Caddy HTTP 검증 listener 필요. Vercel API_PUBLIC_URL 매번 갱신·재배포. Spring/DB/동기화 코드 변경 없음 |
| 계정 기반 Cloudflare Tunnel + public hostname | 장기 운영 가능한 tunnel 관리 방식 | 일반적인 public hostname 구성에는 Cloudflare에서 관리하는 도메인이 필요. 도메인이 전혀 없는 조건의 기본 해법으로 단정하지 않음 | tunnel credential 관리·Compose/origin 구성·DNS 연결 추가. 이번에는 구성하지 않음 |

DuckDNS는 사용자가 선택한 IP로 무료 서브도메인을 가리키는 DDNS다. 안정된 검증 주소를 원하는 현재 구성에는 **DuckDNS + 기존 Caddy**를 우선 제안한다. [DuckDNS 공식 안내](https://www.duckdns.org/about.jsp)

sslip.io/nip.io는 이름에 포함된 IP를 반환한다. 운영자가 Caddy와 HTTP-01을 이용한 TLS 발급을 안내하지만, 공용 도메인의 발급 제한도 안내하므로 실제 발급을 보장할 수 없다. 즉시 확인용 대안이며 아직 이름 등록·인증서 발급을 수행하지 않았다. [운영자 DNS/TLS 설명](https://nip.io/)

Quick Tunnel은 주소를 아는 사람이 origin에 접근할 수 있다. 임의 주소 자체를 인증으로 간주하면 안 된다. 공식 문서의 이메일 OTP 옵션은 대화형 브라우저 세션을 요구하고 비대화형 클라이언트를 지원하지 않아, Vercel 서버 프록시의 upstream 인증으로 그대로 적용할 수 있다고 가정하지 않는다. [Quick Tunnels 공식 문서](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

장기 public hostname에는 계정 기반 tunnel과 DNS 구성이 별도로 필요하다. [Cloudflare Tunnel 설정](https://developers.cloudflare.com/tunnel/setup/)

## 접근 보호를 유지할 구성

무료 서브도메인 방식은 현재 Caddy의 basic_auth, origin 검사, API no-store, 비공개 Spring 포트를 그대로 사용한다. 현재 기록의 80/443 규칙으로 검증 가능한 구조지만 이번에는 보안 그룹을 읽거나 수정하지 않았다. HTTP-01을 쓸 때는 hostname이 EC2로 해석되고 Caddy까지 80/443이 도달해야 한다. [Caddy 자동 HTTPS 조건](https://caddyserver.com/docs/automatic-https)

Quick Tunnel을 선택한다면 **cloudflared → basic_auth가 적용된 내부 Caddy listener → backend:8080** 순서여야 한다. cloudflared를 backend:8080에 직접 연결하면 Caddy의 보호를 우회하므로 채택하지 않는다. Compose에 cloudflared와 내부 전용 Caddy HTTP listener를 추가하고 host port는 publish하지 않는 설계다. 이 경우 TLS는 Cloudflare edge에서 종료되므로 Cloudflare가 요청을 처리하는 추가 신뢰 경계가 생긴다. 현재 EC2에서는 아무 터널도 실행하지 않았다.

모든 방식에서 기존 frontend/api/[...path].js, Axios /api, ACK 헤더, expectedVersion, Outbox, PWA 캐시 정책을 유지한다. VITE_*에 키/비밀번호를 넣지 않는다. Basic 자격증명은 검증자가 사용하고 프록시는 이를 전달할 뿐 익명 요청에 공유 비밀을 주입하지 않는다. 인증 전 실제 사용자 원고 저장과 공개 서비스 운영은 보류한다.

## Vercel 변경과 선택 기준

- 같은 *.vercel.app origin과 IndexedDB를 유지하고 서버 전용 API_PUBLIC_URL만 확정한다. FRONTEND_ORIGIN은 기존 origin을 사용한다.
- Vercel 환경변수 변경은 기존 deployment에 소급되지 않으므로 새 deployment가 필요하다. Quick Tunnel hostname 변경이 잦으면 이 운영 부담도 반복된다. [Vercel 환경변수 적용 범위](https://vercel.com/docs/environment-variables)
- 짧은 일회성 연결 확인은 Quick Tunnel, 반복적인 PWA/자동 동기화 검증은 DuckDNS+Caddy가 적합하다는 판단이다. 자동 동기화 초기화 수정 검증과 HTTPS 방식 적용은 별도 단계로 다룬다.
- 어느 방식도 기존 EC2 비용이나 Vercel/네트워크 사용료까지 무료로 만든다는 뜻은 아니다. 이번 조사에서 유료 리소스 생성, 도메인 구매, 계정 생성 또는 공개 endpoint 개설은 하지 않았다.
