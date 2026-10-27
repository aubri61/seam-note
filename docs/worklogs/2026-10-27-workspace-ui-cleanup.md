# 개별 원고 저장 버튼·불필요한 로컬 목록 조회 안내 정리

## 범위

사용자의 요청에 따라 기존 미커밋 Workspace 전체 동기화, 폴더 이름 변경·포커스, 멀티탭 충돌 개선까지 보존하고 이번 UI 정리 후 함께 커밋한다. push는 요청하지 않았다. 실제 개발 원고나 브라우저 저장소는 테스트에 사용하지 않는다.

## 순서와 변경 파일

1. AppHeader/AppLayout/Sidebar, localCreations와 loadWorkspace, Query 상태를 확인했다. Sidebar의 폴더와 원고를 불러오는 중은 Workspace 첫 조회 isPending일 때이고, NoteEditor의 원고 로딩 중은 선택 상세 조회/로컬 Draft 복구 중에 표시된다. 로컬 생성 직후 반복되는 서버 목록 다시 확인 안내는 내부 강제 로컬 병합이 localSnapshot을 만드는 별도 정상 경로였다.
2. AppHeader에서 개별 원고 서버에 저장 버튼과 결과 패널, AppLayout에서 useManualSync 연결을 제거했다. 상단 모든 변경사항 동기화 및 기존 수동 서버 전송 엔진은 유지했다. 폴더 단독 저장 버튼은 이번 범위에서 제거하지 않았다.
3. workspaceCache.ts에 일시적인 localSnapshot.reason=local-refresh를 추가하고 localCreations.ts / workspaceMutations.ts의 내부 로컬 갱신에서만 지정했다. AppLayout은 온라인 정상 로컬 갱신 안내를 표시하지 않고 서버 목록 다시 확인 버튼을 제거한다. Query 최초 로딩/실제 오류/오프라인/저장소 실패 안내는 유지한다. IndexedDB 저장 schema나 migration을 변경하지 않았다.
4. offlineWorkspace.test.mjs에 정상 로컬 갱신과 서버 장애 구분, 로컬 엔티티 읽기 실패 경고 유지 테스트2개 추가. manualSaveUx/workspaceCreateDelete/PWA/Workspace 실증 suite를 현재 전체 동기화 UI 계약에 맞췄다. legacy manualSyncLive/offlineCreationLive entry point는 canonical Workspace 실증 suite를 호출한다. script lab도 현재 전체 동기화 경로로 정리하고 과거 JSON을 덮어쓰지 않도록 별도 결과 경로를 사용한다.
5. frontend README와 design 문서에 현재 UI와 과거 개별 저장 이력을 구분했다. 같은 UX의 기존 local-only troubleshooting Workspace 문서에 원인·개선·검증을 추가했다.
6. frontend에서 pnpm test143개/build/TypeScript/lint 통과. 초기 루트에서 pnpm 실행 cwd 오류는 frontend로 정정했다. 실제 격리 Spring/PostgreSQL·Chrome 회귀를 실행한다. 결과는 아래에 기록한다.

## 검증 결과

- frontend Node143개/build/TypeScript/lint 통과. 초기 index492.84kB이며 Vite500kB 경고 없음. 실행 성능 수치는 측정하지 않았다.
- 격리 DB backend35개, failures/errors/skips0.
- 실제 production Chrome→Spring/PostgreSQL Workspace18개 통과. 부모 의존성·생성/수정·응답 유실·same-key·409/404·ACK rollback·두 탭 경쟁·추가 입력·독립 원고 보호·PWA 재실행 포함.
- mock API + 실제 Chrome/IndexedDB browser12개 suite 모두 통과: outboxStorage, localDraftStorage, noteDrafts, noteRouting, workspaceCreateDelete, workspaceReadonly, sidebarDraftTitles, manualSaveUx, inlineFolderCreation, folderExpansion, folderMenu, folderRenameFocus. 순차 실행 전체 exit0.
- production PWA10개 통과. 전체 버튼이 v2에서 복구한 dirty 원고2개의 작업을 모두 ACK함을 확인했다.
- Outbox 초기 browser 실패는 읽기 전용 projection과 원본 DB record의 비교 계약 문제였다. 실제 persisted record 완전 일치/projection 미저장과 read projection 값을 각각 확인하도록 보강한 후 통과했다. 제품 DB migration 실패로 주장하지 않는다.
- 상세 환경·수치는 docs/verification/2026-10-27-workspace-ui-{results,pwa-results,summary}.json. 최초 lab은 backend35/실제18개 완료 후 outboxStorage에서 중단됐고, 보강 뒤 mock browser12개와 PWA10개를 별도로 재실행했다.
- docs/troubleshooting은 기존 gitignore에 따라 로컬 전용으로 남기고 커밋하지 않는다.
