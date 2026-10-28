# 충돌 비교 화면 간소화 및 자동 열기

## 변경 순서

1. AppLayout/헤더/NoteEditor/ConflictDialog/DiffView 상태 흐름과 기존 동기화 버튼 스타일을 확인했다.
2. SyncButton 공통 컴포넌트를 추출해 전체 동기화 버튼과 두 선택 버튼이 같은 스타일을 사용하도록 했다.
3. DiffView를 제목/본문/선택 버튼이 각 패널 안에 있는 구조로 바꾸고 변경 이동 버튼을 제거했다. 서버 비교는 현재/서버, 로컬 CAS는 실제 출처인 현재/다른 탭으로 표시한다.
4. 모달의 다운로드·이력 파일·재비교·취소 버튼과 기술 버전 문구를 제거했다. Escape/바깥 클릭과 기존 삭제 복구는 유지한다. 내부 복구 사본/트랜잭션/ACK 계약은 수정하지 않았다.
5. AppLayout은 새 충돌 목록/선택 원고/동기화 종료를 관찰해 자동으로 모달을 연다. 헤더 충돌 수·목록과 에디터의 충돌 배너를 제거했다. 단순 닫기만으로 무한 재개방하지 않는다. 미해결 충돌은 재선택/다음 수동 동기화 후 다시 확인한다.
6. 모달이 배경을 inert로 만드는 Radix 특성을 고려해 배경 버튼 스타일 검사를 role query에서 DOM locator로 정정했다. 중간 JSX/타입 오류를 수정하고 build/lint를 재검증했다.

## 검증

- pnpm test162개 통과. pnpm build(TypeScript 포함), pnpm lint 통과.
- production preview의 격리 Chrome/새 native IndexedDB/mock GET에서3개 시나리오 통과: 현재 선택/서버 선택/모바일에서 Escape 닫기. 선택 이전 사본과 닫기 후 conflict 작업 보존, 각 패널의 버튼, 공통 버튼 스타일, 자동 열림을 검증했다.
- API는 GET만 허용해 실제 개발 DB에 변경 요청을 보내지 않았다.
- 기존 실제 서버 UI/성능/PWA 하네스의 버튼 이름과 자동 열림 진입점을 새 계약에 맞췄다. 이번 수정 후 실제 Spring/PostgreSQL UI 묶음을 재실행했다고 주장하지 않는다.
- 최신 production 빌드로 PWA11개도 통과했다. 오프라인 두 탭에서 자동으로 뜬 모달의 다른 탭 원고 선택과 이전 원고 내부 사본 보존까지 검증했다. 결과: docs/verification/2026-10-28-conflict-simple-pwa.json. 이전 전체 검증 수치는 최초 Diff 작업 이력으로 유지한다.
- commit/push하지 않았다.
