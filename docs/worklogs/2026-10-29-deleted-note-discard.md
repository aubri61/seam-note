# 삭제된 서버 원고의 로컬 폐기·모달 크기 개선

## 조사·변경 순서

1. inspectConflict/classifyConflict 및 NOTE_NOT_FOUND 분류, resolveConflict·DraftSession 선택 fence를 확인했다. 정확한 HTTP404+NOTE_NOT_FOUND인 서버 부재와 로컬 Draft가 결합된 경우의 복구 UI다.
2. ConflictDialog/DiffView의 전체 화면 inset·고정 본문 높이를 제거했다. 비교 최대960px, 삭제복구 최대520px, 모바일 viewport여백32px. 짧은 Diff는 내용에 맞춰 줄이고 긴 원고는 스크롤한다.
3. ConflictDialog에 경고와 ‘로컬 원고 삭제’를 추가했다. conflictService.discardDeletedNote가 기존 global sync WebLock 안에서 서버 부재를 재확인한다.
4. draftDatabase.discardDeletedConflict가 preview headStamp/current revision/failureCode를 검증하고 Draft·Outbox·local note metadata·Workspace 및 v5 tombstone을 원자적으로 처리한다. 불확정 전송·CreationOutbox가 남으면 기존 blockedChoice로 차단한다.
5. DraftSession.applyConflictChoice는 explicit discard의 null 결과를 처리해 메모리를 폐기하고 저장 타이머를 막는다. 기존 선택/ACK 흐름은 유지한다. 기존 BroadcastChannel 삭제 알림을 재사용한다.
6. 관련 없는 NoConflict의 오래된 다운로드 안내 문구도 제거했다. 개인 troubleshooting 기존 멀티탭 문서를 갱신했다(gitignore 유지).

## 검증

frontend lint/build 및 Node 전체 테스트, 실제 Chrome GET/PUT synthetic404/409·IndexedDB 검증. 개발 DB와 사용자 프로필 쓰기0. browser harness는 tests/browser/deletedNoteDiscard.cjs, 결과는 docs/verification/2026-10-29-deleted-note-discard.json. 최종 수치는 실행 완료 후 추가한다.

이번 변경 commit/push 없음. 이미 진행 중인 nullable folder/recursive deletion 작업과 함께 미커밋 상태다.

## 최종 결과

- pnpm lint/build 및 Node183개 통과. git diff --check 통과.
- 실제 Chrome6시나리오 통과: discard, quota rollback 후 재시도, 서버 재조회 성공 시 폐기 차단, local token/revision 변경 fault injection 시 차단, 비교모달, 모바일 폐기.
- desktop1440×1000: 삭제모달520×380.375px, 짧은 비교960×354.09375px. 모바일390×844: 삭제358×424.5625px. 이는 이번 합성 짧은 원고에서 관찰한 크기이며 모든 원고의 고정 높이를 뜻하지 않는다.
- 폐기 이후 원고/Outbox 없음, tombstone 있음, reload 후 재생성 없음. 생성/서버DELETE 요청0. 기존 동기화 PUT 실패1회만 발생.
- harness에서 다수 alert의 strict locator와 복구 전 readonly 에디터에 fill하는 대기 조건을 수정했다. 제품의 CAS를 우회하지 않았다.
