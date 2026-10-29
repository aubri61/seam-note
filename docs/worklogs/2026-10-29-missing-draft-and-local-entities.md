# Draft 행 재생성 및 localEntities 수명 정리

## 작업 순서

1. 격리 Chrome에서 drafts 행만 삭제한 뒤 재입력했다. 기존 token CAS 거부→Draft가 재생성되지 않는 현상을 코드 수정 전에 재현했다.
2. localDraftTypes의 MissingDraftCheckpoint/선택적 restoreMissing, 실제 localDraftRepository의 연결을 추가했다.
3. draftDatabase.restoreMissing에서 marker/row absence/기존 pending UPDATE·CREATE의 checkpoint 일치를 검증하고 기존 write를 같은 readwrite transaction으로 호출한다. frozen/불일치 작업은 차단한다.
4. DraftSession은 성공 commit 후에만 token/checkpoint/revision을 갱신한다. 복원 중 추가 입력은 다음 revision으로 남긴다. 영구 삭제된 ID는 복원하지 않는다. 구체적인 missing Draft 오류를 표시한다.
5. 이어진 사용자 요청으로 localEntities 생명주기를 조사했다. 생성 시 생기고 ACK 후 true로 바뀌지만 확정 행의 물리 정리 정책이 없음을 확인했다.
6. saveWorkspace의 최신 성공 GET 저장에 안전한 metadata GC를 연결했다. confirmed이고 ACK보다 이후 요청이며 관련 작업/보호 의존성이 없는 행만 지운다. Draft나 큐를 지우는 GC는 아니다. 새 IndexedDB schema 없음.
7. 전체 흐름은 docs/design/current-sync-and-local-entity-lifecycle.md에 정리했다. 코드·테스트 실제 근거와 개인 troubleshooting을 함께 갱신했다.

## 검증 및 범위

- Node185개 통과: 추가 입력 중 복원과 다른 탭 선점 보호 2개 포함. lint/build 통과.
- Chrome5경우: pending UPDATE/clean snapshot의 Draft 재생성·reload 보존, frozen snapshot 보존/차단, 명시적 삭제 no-resurrection, 오프라인 새 노트 pending NOTE_CREATE 보존을 검증한다. 마지막 경우는 SW를 차단한 mock이므로 오프라인 reload는 수행하지 않고 IDB transaction 보존만 확인한다.
- localEntities native IDB fixture: confirmed2개 제거, pending/queued/newerACK/missingParent/child5개 유지.
- 실제 Spring/PostgreSQL 통합 회귀는 별도 임시 cluster25521/API18821/브라우저 origin25203에서 실행한다. 개발 DB/브라우저profile/원고 변경 없음. 결과는 최종 기록 참조.
- commit/push 없음. 기존 nullable folder/삭제/툴팁 변경은 보존했다.

개인 기록: docs/troubleshooting/2026-10-27-frontend-multitab-local-conflict.md 및 docs/troubleshooting/2026-10-26-offline-creation.md(gitignore 유지).

## 최종 결과

- Node185개, lint/build/git diff --check 통과.
- Chrome missing Draft5경우 모두 통과. 기존 clean/pending은 재입력+reload 보존, local-create는 NOTE_CREATE payload와 Draft atomic commit 확인, frozen은 기존 key/payload 유지하며 차단, 삭제 marker는 복원 차단.
- native IDB localEntities2개 정리/5개 보호 통과. 해당 GET은 synthetic API로 기존 사용자 DB 쓰기0.
- 실제 별도 Spring/PostgreSQL/production PWA13시나리오 통과: 생성 부모 순서·ACK·후속 UPDATE·응답 유실·로컬/서버 충돌 선택·GET실패 보호·오프라인 재실행·긴 원고 회귀. 보고서 docs/verification/2026-10-29-tiptap-live.json.
- tests/browser/tiptapLive.cjs의 에디터 locator는 contenteditable=true를 기다리도록 변경했다. readonly 복구 중 노드를 fill하던 harness race였으며 제품 CAS를 완화하지 않았다.
- 최종 통합 보고서 docs/verification/2026-10-29-missing-draft-local-entities.json. 본문은 결과 로그에 노출하지 않았다. 별도 임시 서버만 종료하며 개발 서버/DB와 사용자 profile은 보존한다.
