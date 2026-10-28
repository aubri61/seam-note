# Command+S / Ctrl+S 저장 단축키

## 실제 변경 순서

1. AppLayout의 단일 useWorkspaceSync와 동기화 버튼 disabled/gate/flush 경로를 확인했다.
2. useWorkspaceSync.ts에 window keydown 등록/해제를 추가했다. React useEffectEvent로 최신 online/busy/count/run을 읽어 stale closure를 피한다.
3. Meta+S/Control+S 및 한국어 배열의 물리 KeyS를 인식하고 기본 브라우저 페이지 저장을 막는다. repeat/오프라인·실행 중·큐 읽기 오류/모달 열린 상태에서는 전송하지 않는다. IME 조합·Alt/Shift 조합·일반 S는 가로채지 않는다.
4. 기존 run을 호출하므로 현재 오른쪽 위 동기화 버튼과 같은 Workspace 전체 명시적 동기화다. 원고별 별도 저장 경로를 만들지 않았다. 기존 flushLatest/CAS/Idempotency-Key/ACK·rebase/전송 잠금을 유지한다.
5. AppHeader.tsx에 aria-keyshortcuts 및 툴팁을 추가했다. saveShortcut.cjs에서 실제 키 이벤트와 격리 IndexedDB/합성 API로 검증했다.
6. 기존 manual-save-availability troubleshooting 문서에 예방한 위험과 실증을 보완했다. commit/push하지 않았다.

## 검증

- pnpm lint / pnpm build(TypeScript 포함) / pnpm test169개 통과.
- Chrome:Command+S·Ctrl+S 각각 synthetic PUT 성공, debounce 직전 제목/본문 flush, expectedVersion0→1→2 및 operationId 분리, busy 중 중복2회 차단, 오프라인 입력 보존·전송0, 모달 중 차단, 브라우저 기본 저장 방지, 반복 키 및 modifier/IME 조합 분기 모두 통과.
- 결과: docs/verification/2026-10-28-save-shortcut.json. 실제 개발 DB 쓰기0. 기존 사용자 프로필 대신 별도 임시 컨텍스트를 사용했다.
- 최초 검증 명령은 루트에서 pnpm을 실행해 manifest 없음 오류가 났다. package.json이 있는 frontend 디렉터리에서 재실행해 통과했다. 제품 오류가 아니다.

## 정책

오프라인에서 이 단축키는 브라우저 페이지 저장을 막지만 서버 요청을 하지 않는다. 원고는 기존 로컬 저장 흐름으로 유지된다. 서버 저장의 전체 Workspace 범위는 버튼과 동일하다. 원고별 서버 저장으로 범위를 바꾸지 않았다. 설치형 네이티브 PWA 메뉴의 키 전달 자체는 별도 실행하지 않았으며, 실제 Chrome 페이지 키 이벤트를 검증했다.
