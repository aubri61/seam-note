# 사이드바 Command+B / Ctrl+B 단축키

## 변경 순서

1. AppLayout의 sidebarOpen 소유 구조 및 SidebarDrawer/Radix onCloseAutoFocus를 확인했다.
2. AppLayout.tsx에 등록/해제되는 window keydown 및 useEffectEvent handler를 추가했다. Meta+B/Control+B/한글 배열 KeyB를 인식하고 기존 sidebarOpen을 functional update한다. 편집기·Draft·URL에는 접근하지 않는다.
3. 반복키·IME 조합·추가 Alt/Shift 조합을 구분한다. 다른 모달이 열렸을 때는 실행하지 않고, SidebarDrawer 자체가 열린 경우에는 동일 단축키로 닫을 수 있다.
4. desktop sidebar 내부에 포커스가 있을 때 닫으면 header toggle로 이동한다. mobile은 기존 Radix focus restore를 그대로 사용한다. AppHeader에 aria-keyshortcuts와 툴팁을 추가했다.
5. sidebarShortcut.cjs를 추가해 실제 Chrome desktop/mobile의 키 입력·포커스·Draft 보존을 GET-only mock과 임시 프로필에서 검증했다.
6. 기존 폴더 메뉴/접근성 troubleshooting 문서에 사전 예방한 포커스 위험과 검증을 보완했다. commit/push하지 않았다.

## 결과

- pnpm --dir frontend lint/build/TypeScript/test169개 통과.
- desktop/mobile2개 묶음: Command+B/Ctrl+B 토글, 편집 Draft 유지, 사이드바 내부 포커스로 닫기 및 복원, 다른 모달 차단, 한글 배열 physical KeyB, 반복키/IME/modifier 분기 통과. API write0.
- 결과: docs/verification/2026-10-28-sidebar-shortcut.json.
- 기존 전용 수동 동기화 실험 서버25183의 화면을 사용하되 별도 임시 Chrome 컨텍스트 및 합성 API 응답만 사용했다. 사용자 원고·개발 DB·수동 실험 프로필은 수정하지 않았다.

## 추가 단축키 제안 (미구현)

- Command/Ctrl+K: 원고 검색 또는 빠른 원고 열기.
- Command/Ctrl+Shift+F: 집중 모드 전환.
- Escape: 현재 메뉴·검색·모달 닫기(기존 메뉴/드로워/모달 일부는 이미 지원).

이번 요청으로 실제 추가한 것은 사이드바 단축키뿐이다. 앞으로 서식 편집을 연결하더라도 B 키는 사용자가 지정한 사이드바 동작과 충돌하지 않도록 별도 계약이 필요하다.
