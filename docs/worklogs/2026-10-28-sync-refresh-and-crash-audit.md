# 동기화 안내 정리·상세 Draft 갱신·inFlight 강제 종료 검증

## 작업 순서와 파일

1. useWorkspaceSync/SyncCoordinator, DraftSession.receive/recovery/ACK, repository.write/acknowledge/planOperation 및 기존 검증 하네스를 분석했다.
2. 제품 수정 전 production Chrome/mock GET에서 clean Draft v0를 읽은 후 서버 snapshot을 v1으로 바꾸고 빈 Outbox 전체 sync를 실행했다. 상세 GET1→1, 제목/본문 미변경을 재현해 before JSON에 기록했다.
3. AppLayout.tsx의 선택 완료 안내, AppHeader.tsx의 마지막 실행 ACK 진단·상세 항목, NoteEditor.tsx의 장문 저장 안내 및 전용 Footer 스타일을 제거했다. 동기화 버튼은 aria-busy로 작업 중 상태를 제공한다. 실제 오류 보호와 원고 데이터는 제거하지 않았다.
4. useWorkspaceSync.ts는 syncWorkspace pass 뒤 noteKeys.all을 invalidate한다. 활성 노트 상세 GET을 다시 실행하고 기존 DraftSession.receive로 clean 원고만 최신 제목·본문으로 채택한다. dirty/미확정 Outbox 보호는 그대로다. 미열람 원고 전체 본문을 새로 다운로드하지 않는다. 비활성 Query도 stale로 표시되어 다시 열 때 조회한다.
5. syncRefreshUi.cjs를 추가했다. 같은 production UI에서 수정 후 clean 제목/본문/사이드바 최신화, clean pull PUT0, dirty 입력 뒤 409+GET에서도 내 제목/본문 보존을 확인했다.
6. inFlightCrashRecovery.cjs를 별도로 작성했다. 추적한 테스트 Chrome root PID만 SIGKILL하고 같은 테스트 프로필로 재실행한다. 실제 DraftSession/IndexedDB/수동 전송/Coordinator와 별도 Spring/PostgreSQL을 사용했다.
7. 정상 write가 이미 A+B와 B를 원자 commit함을 확인했다. 정상 B 존재2개, 합성 B 부재 주입2개(마지막은 ACK successor 삽입 실패 rollback 포함)를 검증했다. 제품 ACK/Outbox 저장 로직 변경은 없었다.
8. 기존 noteDrafts/manualSaveUx/workspaceSyncLive 하네스를 제거된 안내 문구에 의존하지 않도록 갱신했다. Workspace 결과는 실제 HTTP operationId와 최종 IDB의 남은 작업으로 확인한다. 비교 모달은 사용자처럼 Escape로 닫고 다음 수동 sync를 수행한다. 테스트 관측용 전역/디버그 UI를 제품에 넣지 않았다.

## 확인된 문제와 테스트 환경 문제 구분

- 실제 제품 문제: 빈 Outbox sync가 메타데이터만 갱신해 본문 상세 Query/Draft를 새로 읽지 않음. 한 지점의 Query invalidation으로 해결했다.
- 기존 정상 보호: write와 ACK가 Draft/후속 Outbox를 같은 transaction에 기록하므로 요청한 저장 중간 틈이 정상 commit 경계에 없음.
- 사전 방어 검증: pending B 부재·삽입 오류를 합성 데이터에 주입했으며 실제 사용자 데이터 유실이 관측됐다고 표현하지 않는다.
- 하네스 초기화 오류: 새 Chrome 프로필에 서버 snapshot을 주지 않아 readyForSync가 거부했다. 초기 profile만 receive(snapshot) 후 준비하도록 정정했다.
- 기존 Draft 하네스는 /src 모듈에 fault를 주입하므로 production preview에서는 모듈 import가 실패했다. 실제 Vite lab+mock GET에서 재실행해 통과했다. 제품 UI 오류가 아니다.
- 기존 Workspace 하네스의 reload 직후 자동 삭제 모달이 sync click을 막았다. 미해결 모달을 닫는 사용자 흐름으로 보강했으며 제품 모달을 우회하거나 CAS를 꺼서 통과시키지 않았다.

## 결과

- pnpm test162개, pnpm lint, pnpm build(TypeScript 포함) 통과.
- clean/dirty production refresh 회귀 통과, before/after JSON 보관.
- 실제 SIGKILL/재실행4개 조건 통과(강제 종료5회), 각 A/B Ledger1건, 최종 서버v4/Outbox0.
- 격리 backend35개 실패/오류/skip0.
- 기존 Draft 및 명시적 저장 mock Chrome suite2개 통과.
- production PWA11개 통과.
- 기존 production Workspace18개 최종 통과. 실제 HTTP/IDB 기반으로 재검증했으며 lab 전체 Ledger 누계는 이18개 단독 생성 수와 구분한다. summary 및 sync-refresh-workspace JSON에 기록했다.

## 보존과 한계

ACK/Outbox/schema/Flyway/backend 코드를 수정하지 않았다. 실제 개발 DB/브라우저 저장소/원고는 사용하지 않았다. 합성 UUID만 생성했고 연구 포트는 UI25175/API18766/PostgreSQL25442, mock preview25177이다. 정상 코드 경로를 통한 crash 안정성은 확인했지만 OS 전원 차단·디스크 고장·브라우저 저장소 삭제·모든 종류의 손상 상태/Safari까지 보장하지 않는다. 외부에서 모든 Outbox를 지운 상태의 범용 복구 엔진을 추가한 것이 아니다. commit/push하지 않았다.

상세 원자성·실험 조건·실제 코드/한계: docs/design/inflight-crash-recovery.md. 결과는 docs/verification의 2026-10-28-sync-refresh-*.json 및 2026-10-28-inflight-crash-recovery.json을 따른다.

사용자 후속 요청으로 Sidebar의 ‘서버 미반영 폴더/폴더 서버에 저장’ 전용 영역과 미사용 FolderCreationSave 컴포넌트를 제거했다. 기존 전체 동기화/CreationOutbox 처리는 유지한다. 이 시점까지의 충돌 비교·선택 즉시 저장·상세 갱신·강제 종료 검증을 먼저 커밋하고, 생성 자동 반영은 그 이후 별도 작업한다.
