# 삭제 후 잔여 Outbox·유령 복구 모달 조사

## 재현 → 수정 순서

1. AppLayout/useConflictList/inspectConflict/DraftSession, 일반 원고 DELETE 경로를 조사했다.
2. 기존 build에서 원고 입력·로컬 저장·영구 삭제·전체 동기화를 실제 Chrome synthetic API로 실행했다. Draft와 Outbox가 남아 삭제한 원고 PUT1회→404→복구 모달을 재현했다. 변경 전 결과를 `/private/tmp/seam-note-delete-before.json`에 저장한 후 제품 코드를 수정했다.
3. 새 noteDeletion.ts로 global sync lock+서버삭제 확인+IDB 원자적 정리를 연결했다. finishNoteDeletion/removeLocalNote를 추가하고 모달의 discard도 공통 정리를 사용한다.
4. 같은 탭 session의 deletion event를 연결했다. 기존 다른 탭 BroadcastChannel과 tombstone 검사를 유지한다. stale refresh가 새 URL 선택을 되돌리지 않도록 useFolders의 현재 경로를 확인한다.
5. Draft 없는 conflict Outbox는 자동 모달에서 제외하고 작업 snapshot을 보존한 채 오류를 알린다. 이미 열려 있는 모달도 명시적 로컬 삭제 event에서 marker를 확인하면 닫는다.
6. mutation Node 테스트는 삭제 함수를 주입해 HTTP/cache 계약을 유지하고, 제품 기본 경로의 IDB/lock은 browser tests로 검증한다. 테스트 환경 분기를 제품에 추가하지 않았다.

## 주요 파일

- features/notes/noteDeletion.ts
- features/workspace/workspaceMutations.ts
- features/local-drafts/draftDatabase.ts, draftSession.ts
- features/conflicts/useConflictList.ts, ConflictDialog.tsx
- features/folders/useFolders.ts
- tests/browser/noteDeletionQueues.cjs, orphanConflict.cjs
- tests/workspaceMutations.test.mjs, helpers/loadModules.mjs

## 검증

실제 Chrome+IndexedDB/합성 API로 정상 삭제, 서버 실패, IDB rollback, 잔여 CreationOutbox, 2탭, 원고 없는 고아 Outbox를 검증했다. 서버/사용자 DB 변경0. 브라우저의 복구 완료 전 fill 대기는 contenteditable=true locator로 안정화했다. 최종 숫자·결과는 verification JSON 및 후속 최종 기록 참조.

관련 개인 기록: docs/troubleshooting/2026-10-27-frontend-multitab-local-conflict.md. commit/push 없음.

## 최종 결과

- lint/build/Node183개/git diff --check 통과.
- 신규 Chrome7시나리오 통과: 정상삭제, DELETE503 보존/재시도, IDB quota rollback/404 재시도, 잔여 NOTE_CREATE 정리, 2탭 삭제/재동기화, 모달을 열어둔 다른 탭에서 삭제, Draft 없는 고아 conflict Outbox 보존.
- 기존 deletedNoteDiscard6시나리오도 회귀 통과. 실제 사용자 DB/profile 변경0. 이번 서버 응답은 synthetic mock이며 PostgreSQL 실험을 추가로 실행했다고 주장하지 않는다.
- 삭제 알림 직후 오래된 충돌 목록으로 모달이 remount되는 경쟁도 확인했다. 모달 mount 때 이미 기록된 삭제 marker를 확인해 닫고 알림도 계속 구독한다. 자동 모달로 숨겨진 에디터를 탐색하던 harness는 Dialog→Escape를 기다리도록 정리했다.
- 보고서 docs/verification/2026-10-29-note-delete-queues.json에 before/after, 코드 hash, 테스트 환경을 기록했다. 본문을 로그에 저장하지 않았다.
