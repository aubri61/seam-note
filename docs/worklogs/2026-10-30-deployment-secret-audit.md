# 배포 브랜치 비밀 점검 및 HTTPS 조사

- 시작 브랜치: chore/deploy-infra, HEAD b4be141. 미커밋 변경은 deploy/.env.example의 연결 설정이었다.
- 현재 서버 .env와 사용자 연결 설정의 지문 일치를 값 노출 없이 확인한 뒤 추적 예제를 커밋된 placeholder로 복원했다. 서버 파일·DB·컨테이너·보안 그룹은 변경하지 않았다. 실제 값은 이 문서에 포함하지 않는다.
- Git refs + reflog로 도달 가능한 29개 커밋, 733개 UTF-8 텍스트 blob(2MB 이하)을 검사했다. 운영 .env 이력, 개인키, AWS/GitHub token 패턴은 발견되지 않았다. 서버 DB 비밀번호는 지문을 메모리에서만 사용해 이력의 인용 문자열/환경변수/URI 리터럴 후보와 비교했고 일치는 0개였다.
- 개발/테스트용 고정 비밀번호 이력은 존재한다. 운영 비밀로 오인하지 않도록 구분했다. storageToken 참조는 CAS 필드/타입/UUID 생성이고 password_hash 참조는 합성 테스트 생성 명령으로 수동 분류했다. 비밀 후보 값이나 지문은 출력·보고서·Git에 저장하지 않았다.
- 검사 한계: 도달 불가능/정리된 Git 객체, 원격에만 있는 이력, 외부 CI 로그, 암호화/binary keystore의 내부는 조사하지 않았다. 전체 비밀 부재를 보증하는 결과는 아니다.
- 운영 파일 제외를 위한 .gitignore 정책(.env/.env.*, example 예외, cert 디렉터리)은 유지한다. 검사 원본 결과는 docs/verification/2026-10-30-secret-audit.json.
- 별도 무료 HTTPS 비교: docs/reports/2026-10-30-free-https-options.md. DuckDNS+Caddy, sslip.io/nip.io+Caddy, Quick Tunnel, 계정 tunnel의 변경 범위와 접근 통제를 조사했다. 실제 인프라는 변경하지 않았다.
- 이 배포 기록을 먼저 커밋한 뒤 현재 브랜치 기준 fix/initial-draft-recovery를 생성한다. main merge/push는 수행하지 않는다. 자동 동기화 코드는 다음 브랜치의 별도 커밋으로 남긴다.
