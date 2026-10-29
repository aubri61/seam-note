# Tiptap 브랜치 커밋·푸시 체크포인트

- 사용자 요청으로 feat/tiptap-editor의 남은 변경을 커밋하고 origin(https://github.com/aubri61/seam-note.git)에 같은 브랜치로 push한다. main merge/PR 생성은 하지 않는다.
- 기존 브랜치 커밋: e0a2a38(Tiptap), 11b99c2(단축키·빈 화면·툴팁). 이번 커밋은 nullable folder·재귀 삭제·로컬 삭제/Outbox 정리·missing Draft 복원·localEntities 수명·OS별 tooltip 및 모달 UI 개선을 포함한다.
- frontend lint/build/Node185개 통과. backend38개는 신규 V5를 포함해 격리 DB에서 통과한 결과를 유지한다. 이후 변경은 frontend에 한정됐다.
- 실제 Spring/PostgreSQL/production Chrome PWA13회귀, synthetic Chrome의 삭제/고아 큐/폐기/복원/메타데이터 수명 테스트 결과와 source hash는 docs/verification 및 각 worklog에 기록했다. 실제 개발 DB/profile 일괄 삭제 없음.
- git diff --check 통과. docs/troubleshooting은 기존 개인용 gitignore를 유지하고 추적 파일이 없는 것을 확인했다. 이번 stage/commit/push에도 포함하지 않는다.
- 적용 계약: Flyway V5 additive 변경(nullable notes.folder_id, FK cascade), Dexie v5 deletedEntities 추가. 기존 migration은 수정하지 않는다. Tiptap은 content 문자열 안의 JSON 문서를 기준으로 하며 구 plain text 자동 변환 없음. 기존 원고 UPDATE 자동 전송은 추가하지 않는다.
