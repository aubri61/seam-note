# 멀티탭 로컬 저장 충돌: 분석·실증·격리 개선안

## 범위와 현재 상태

기존 PWA/전체 동기화/폴더 이름 변경 등의 미커밋 작업을 보존했다. 최초에는 원고 입력의 메모리 유실 위험을 안내하고 임시 복사본에서 검증했다. 이후 사용자가 개발 환경에 적용하라고 명시적으로 요청해 검증 패치를 실제 소스에 적용했다. commit/push하지 않았다.

## 실제 진행 순서

1. AGENTS 및 troubleshooting 양식, DraftSession/repository의 CAS·Recovery Barrier·ACK, Outbox/CreationOutbox, 수동/전체 동기화와 기존 테스트를 조사했다. 기존 BroadcastChannel을 확인했다.
2. `frontend/tests/browser/multiTabConflictLab.cjs` 추가. 격리 Chrome 두 탭·실제 IndexedDB와 기존 lab Spring/PostgreSQL로 제품 변경 전5개를 재현했다. `docs/verification/2026-10-27-multitab-before.json`에 원본 소스 해시와 UUID/버전/원고 해시를 기록했다.
3. 기존 같은 문제 문서가 없어 local-only `docs/troubleshooting/2026-10-27-frontend-multitab-local-conflict.md`를 작성하고 README 목록을 갱신했다. 사용자 화면만으로 metadata-only인지 실제 본문 충돌인지 단정하지 않았다.
4. 사용자에게 원인과 최소 개선안을 먼저 보고하고 실제 원고의 입력 보관 여부를 질문했다. 제품 소스 HMR 갱신 위험 때문에 frontend를 `/private/tmp/seam-note-multitab-fix/frontend`로 복사해 후보를 구현했다.
5. 후보 `draftSession.ts`: 마지막 commit checkpoint, 안전한 최신 로컬 내용 반영/검증된 metadata rebase, 한 번의 CAS 실패 재확인, write/ACK 중 알림 확인 보류, 복구 가능한 재확인. 기존 repository CAS와 ACK 조건은 변경하지 않았다.
6. 후보 `draftDatabase.ts / localDraftTypes.ts`: 같은 read transaction에서 pending 작업의 일치 여부를 증명하는 일시적 projection. schema v1~v4·migration·실제 저장 레코드의 모델은 그대로다.
7. 후보 `localDraftStatus.ts / noteDrafts.ts / NoteEditor.tsx`: 별도 로컬 충돌 상태와 현재 입력 복사/txt 보관·유실 위험 안내. `SyncCoordinator.ts`: local CAS와 서버409/404 오류를 구분하고 독립 작업을 유지했다.
8. 후보 `localDraftStorage.test.mjs`에11개, `syncCoordinator.test.mjs`에1개 추가. 실제 UI browser localDraftStorage에는 복사·파일 내용 검증을 추가했다. 총141개 단위 테스트/build/lint 통과.
9. 실제 Chrome 멀티탭 후보 하네스 `frontend/tests/browser/multiTabConflictAfter.cjs` 추가, 최종9개 통과. metadata-only/observer/진짜 충돌/알림누락/write경쟁/heldPUT/record삭제/독립 원고 실제 서버 ACK를 확인했다.
10. 후보 production Workspace18개/PWA10개와 로컬 저장·수동 저장 UI suite를 검증했다. Workspace 하네스의 초기2회 불안정 실패를 기록하고 URL만이 아닌 editor ID까지 기다리도록 보강했다. 원인이 확정된 제품 버그로 기술하지 않는다.
11. 검토용 `docs/verification/2026-10-27-multitab-candidate.patch`와 원본/후보 hash manifest, 실행 요약/JSON을 작성하고 `git apply --check` 성공만 확인했다. 실제 소스 적용은 하지 않았다.

12. 사용자 적용 요청 후 원본에 `git apply --check`를 재확인하고 패치를 적용했다.11개 파일의 최종 SHA-256이 검증 후보와 일치했다. 실제 프로젝트에서 pnpm test141개/build/TypeScript/lint를 재실행해 통과했다. 별도 Vite origin/cache와 mock API로 브라우저 UI도 재검증했다(아래 결과 참조).

## 결과·남은 작업

자세한 분류·설계·검증 한계는 `docs/design/multitab-local-conflict.md`에 있다. 최종 후보141개 테스트/build/lint 통과, 신규 실제 멀티탭9개 통과. production Workspace18개 실행 후 local CAS 오류 표시 분기를 추가했으며 최종 단위/실제 멀티탭 검증에 포함했다. production 전체18개가 마지막 표시 분기까지 재실행된 결과라고 주장하지 않는다.

사용자의 명시적 적용 요청 후 실제 소스 반영을 완료했다. 입력 보관 여부를 별도로 확인한 것으로 기록하지 않는다. 서로 다른 본문의 자동 병합, 임의 token 갱신, 미확정 작업 삭제는 구현하지 않았다. 안전하지 않은 ACK는 기존 operationId를 보존한 채 수동 확인 대상으로 남는다. 사용자 개발 DB·브라우저 저장소 삭제/실제 원고 변경은 하지 않았다.

## 실제 소스 적용 후 최종 확인

사용자 적용 요청 후11개 파일이 검증 후보 해시와 일치함을 확인했다. 실제 프로젝트에서 pnpm test141개/build/TypeScript/lint를 재실행해 통과했다. 별도 Vite origin/cache·격리 Chrome·mock API로 localDraftStorage(두 탭 충돌, 입력 복사/txt 보관, 이탈 경고 포함)와 manualSaveUx 두 suite도 통과했다. 개발 DB에 테스트 요청을 보내거나 IndexedDB를 초기화하지 않았다. 실행 근거는 `docs/verification/2026-10-27-multitab-applied.json`에 있다. commit/push하지 않았다.
