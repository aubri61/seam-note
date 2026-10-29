# OS별 툴팁과 사이드바 안내 정리

1. Sidebar/AppHeader/RichTextEditor의 tooltip 문자열과 하단 안내·작업 수 렌더링을 확인했다.
2. lib/keyboard/shortcutLabel.ts를 추가해 브라우저 OS에 맞는 단일 단축키를 표시했다. Mac ⌘B/⌘⇧Z, Windows Ctrl+B/Ctrl+Shift+Z. 실제 키 핸들러는 변경하지 않았다.
3. Sidebar 내부 접기 버튼에도 이름+단축키를 제공하고 헤더·툴바·동기화 표기를 통합했다.
4. 미동기화 작업 수 화면 출력과 빈 헤더의 추가 행, Sidebar 하단 두 줄 안내를 제거했다. 오류가 있는 경우만 오류 행을 표시한다. 개별 저장 상태와 동기화 동작은 유지한다.
5. shortcutLabel Node 테스트, platformTooltips Chrome GET-only mock 테스트를 추가하고 기존 tooltip 테스트를 OS별 기대값으로 갱신했다. loadModules에 새 모듈을 추가했다.

검증: pnpm lint/build 통과. Chrome Mac/Windows 2시나리오 통과(두 sidebar 버튼, 서식, undo, title Tab, 문구 제거). Node 결과는 최종 보고에 기록. 사용자 개발 DB/브라우저 저장소 변경 없음. 이번 변경 commit/push 없음.

관련 개인 기록: docs/troubleshooting/2026-10-29-frontend-tiptap-editor.md (기존 gitignore 유지).

최종: Node183개 전부 통과, 마지막 lint와 git diff --check 통과.
