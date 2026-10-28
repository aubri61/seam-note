# 본문 화면 높이 및 오프라인 상태 표시

## 변경 순서

1. AppLayout → AppHeader → NoteEditor의 높이 전달 구조와 useConnectivity를 확인했다. Writing은 확장되지만 textarea 자체는 최소 300px 높이에 남는 원인을 확인했다.
2. NoteEditor.tsx: Writing에 세로 flex, textarea에 flex:1·최소160px·resize:none을 적용했다. 기존 문서 여백과 부모 레이아웃을 유지했다.
3. AppHeader.tsx: online prop을 추가하고 오프라인일 때 버튼 대신 빨간 `현재 오프라인 작업 중` 상태를 표시했다. AppLayout.tsx에서 기존 연결 상태를 전달했다.
4. tests/browser/editorViewport.cjs를 추가해 production preview에서 GET-only 합성 응답과 임시 브라우저 컨텍스트로 화면 크기·긴 본문·오프라인 전환을 검증했다. 측정 결과는 docs/verification/2026-10-28-editor-viewport.json에 기록했다.
5. 기존 PWA 트러블슈팅 문서에 실제 현상·원인·수정·검증·한계를 보완했다. 해당 디렉터리의 기존 local-only Git ignore 정책을 유지했다.

## 검증

- pnpm build (TypeScript 포함): 통과.
- pnpm lint: 통과. pnpm test: 169/169 통과.
- production Chrome 브라우저: 데스크톱2·모바일1 크기에서 본문 하단까지 확장, 150줄 내부 스크롤, offline 버튼 교체·online 복원 모두 통과. API 쓰기 0건.
- 네이티브 설치 창과 SW 캐싱 자체는 이번 테스트에서 직접 검증하지 않았다. 원고/서버/DB/저장 스키마는 수정하지 않았다. commit/push 없음.
