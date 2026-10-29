# 에디터 포커스·툴팁·아이콘 체크포인트

- e0a2a38 이후 서식/Undo/Redo/sidebar 단축키 및 빈 화면 생성 개선과 함께 커밋할 UI 범위다. 폴더 없는 원고/하위 전체 삭제는 이 체크포인트 이후 별도 변경한다.
- NoteEditor 제목의 기본 Tab만 intercept해 현재 편집기 section의 editable textbox에 포커스를 준다. Shift+Tab/IME/수정키 및 로딩·readonly 상태는 기본 탐색을 유지한다.
- Radix Tooltip1.4.1과 공통 Tooltip을 추가했다. IconButton이 title/aria-label로 포털 tooltip을 제공한다. 서식·Undo/Redo·sidebar에 이름/단축키가 표시된다. header sync·원고 생성·행 메뉴도 같은 tooltip을 쓴다. 스타일은 기존 Emotion 토큰이다.
- undo/redo의 유니코드 글리프를 기존 Icon의 SVG 선 아이콘으로 바꿨다.
- primitives.ts를 JSX 컴포넌트에 맞게 .tsx로 바꿨다. Fast Refresh가 styled Eyebrow를 일반값으로 인식한 lint 오류는 실제 React Eyebrow wrapper로 정리했다. 기존 ref는 IconButton forwardRef로 유지했다.
- lint/build/Node175개 통과. production Chrome/GET-only mock에서 제목Tab→본문, 굵게/기울임/undo/sidebar 툴팁의 이름·단축키, undo SVG를 검증했다. 기존 개발 DB 쓰기0.
- 결과 docs/verification/2026-10-29-title-tooltip.json. 관련 기록은 개인용 troubleshooting의 Tiptap 문서를 갱신했다.
- 툴팁의 hover grace 때문에 한 번의 pointer jump 뒤 닫힘을 기다리던 테스트가 실패했다. 정보성 tooltip에 disableHoverableContent를 적용해 포인터 이탈 시 즉시 닫도록 하고 재검증했다.
