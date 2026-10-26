# PWA 오프라인 실행·원고 복원 작업 이력

## 기준·보존

`feat/pwa-install`, 시작점 `e07fb65`(main의 PR2 merge)에서 시작했다. 시작 작업 트리는 깨끗했다. 기존 user 원고·개발 PostgreSQL/API/브라우저 profile을 테스트 fixture로 사용하지 않았고 기존5173 개발 서버는 종료/교체하지 않았다. commit/push는 하지 않았다.

## 실제 작업 순서

1. AGENTS.md/문서 규칙, AppLayout/useFolders/URL, Workspace·Note Query, DraftSession/Recovery Barrier/CAS, Dexie v1/v2/Outbox, 수동 저장·ACK, 생성삭제/테스트를 분석했다. Workspace 서버 의존과 Query offline pause, SW 업데이트 강제reload 위험을 `docs/troubleshooting/2026-10-26-pwa-offline-recovery.md`에 먼저 기록했다.
2. 공식 Vite PWA prompt/generateSW 문서와 pnpm registry peer를 확인했다. vite-plugin-pwa2.0.0이 Vite8/Node>=20.19를 지원함을 확인하고 설치했다. 첫 build는 virtual register의 workbox-window peer 해석 실패로 중단됐고 workbox-window/build7.4.1을 명시적으로 추가해 수정했다. 의존성에 glob11 deprecated 경고가 있지만 빌드/테스트 오류는 없었다.
3. `workspaceCache.ts`에 metadata 검증/허용 필드 선별/GET 우선/오프라인 및 일시적 실패 fallback/출처 안내를 구현했다. 실패를 빈 목록으로 저장하지 않고4xx는 조용히 fallback하지 않는다. live GET의 로컬캐시 저장 실패는 live 목록과 제한 안내를 반환한다.
4. `draftDatabase.ts`에 additive v3 workspace table/preflight/read/save를 추가했다. 기존 v1/v2 선언과 백필/쓰기/claim/ACK transaction은 유지했다. workspace 저장은 별도 transaction이며 요청 시작 시각보다 오래된 snapshot 교체를 거부한다. sidebar 제목 복원은 cursor로 순회하고 noteId/title만 반환하도록 해 본문 전체 배열 추가 보유를 피했다(메모리 전후 수치는 미측정).
5. `workspaceQueries.ts`의 networkMode always/fallback stale/reconnect GET, `noteQueries.ts`의 offline 명시적 오류·reconnect GET을 연결했다. `useNoteDrafts.ts`/lazy repository가 시작 시 로컬 제목 map을 복구하되 현재 메모리 입력이 항상 우선한다. dirty/frozen Draft는 서버 응답으로 재초기화하지 않는다.
6. `useConnectivity.ts`/AppLayout/useFolders에 오프라인 안내, 본문 없는 원고 이용 불가, 오프라인 서버 저장/생성삭제·rename 차단, 오래된 로컬목록의 부재를 서버404로 단정하지 않는 규칙을 추가했다. Draft가 존재하면 오프라인/일시적 detail 오류가 편집을 막지 않는다. 본문 미존재 원고는 readOnly이며 가짜 Draft/Outbox를 만들지 않는다.
7. `vite.config.ts`에 production precache/manifest/navigation fallback/API 제외/dev SW disabled/prompt 업데이트를 구성했다. `PwaStatus.tsx`는 offline-ready/실패/waiting 안내만 표시하고 skipWaiting/updateSW/reload를 호출하지 않는다. 모든 창이 닫힌 뒤 새 앱을 적용한다.
8. 최초 Chrome installability에서1254px 기존 아이콘만으로 suitable icon 부재 오류가 났다. 기존 Icon.tsx의 note 경로/색상으로 code-native SVG와192/512px PNG를 렌더링하고 maskable safe area를 확보했다. 기존 사이드바 로고를 바꾸지 않았다. 이후 실제 Chrome installability 오류0을 확인했다.
9. Node Query 테스트에는 navigator/IndexedDB가 없음을 확인했다. navigator 부재를 지원하고 기존 Query 계약 테스트의 storage adapter를 명시적으로 격리했다. 별도 offlineWorkspace 단위8개와 실제 IndexedDB 브라우저 검증을 추가했다. v1→v3 Outbox 테스트의 현재 schema 기대값만 갱신했다. Node109개가 통과했다.
10. `pwaOffline.cjs`는 두 production 빌드를 별도 임시 경로에 만들고 Node 합성 HTTP API/임시 persistent Chrome profile을 사용한다. 실제 네트워크 차단 후 Chrome 프로세스를 완전히 닫고 다시 띄워 root/directURL/목록/본문/편집/재실행을 검증했다. 첫 실증은 cold-offline 복원까지 성공했으나 온라인 복귀 시 버튼 대기가 timeout됐다. onlineManager 초기true와 문서 생성 전 offline 이벤트 누락 경계였고 main.tsx 시작에서 실제 navigator 상태로 초기화해 해결했다. 자동 PUT 없이 GET만 복귀한다.
11. 재실증에서 production10개 시나리오를 모두 통과했다. version A에서 아직 local commit되지 않은 메모리 입력을 둔 상태에도 새 worker는 waiting이고 HTML A/입력을 유지했다. local commit 확인 후 Chrome을 닫고 오프라인 재실행하면 HTML B/동일 storageToken/원고/Outbox를 복원했다. API cache entry는0이다. OS 설치 창 자동 조작이나 Safari 실행은 하지 않았다.
12. 기존 `manual-sync-lab.py`로 새 PostgreSQL/별도API/Vite/fixture에서 backend27개/실제 수동 저장10개/브라우저8종을 통과했다. 과거 결과 JSON을 덮어쓴 기본 출력은 원래 committed bytes로 복원하고 이번 실측은 pwa-manual-save-results.json으로 분리했다. 재현을 위해 출력 파일 env override를 추가했다. 기존 역사적 측정 JSON은 그대로 보존한다.
13. 최종 코드에서 build/tsc/lint/Node109개와 production10개를 다시 통과했다. 마지막 v3 metadata 검증/제목 cursor 코드까지 반영한 실제 Spring/PG 회귀는 최종 소스를 고정한 새 실행으로 아래에 기록한다. 문서/README/설계 후속 안내/실증 JSON·이미지/로컬 troubleshooting을 갱신했다.

## 변경 파일

| 파일 | 책임 |
| --- | --- |
| frontend/package.json, pnpm-lock.yaml | PWA2/Workbox7.4.1 개발 의존성 |
| frontend/vite.config.ts | manifest, 앱 셸 precache, root/note navigation fallback/API 제외, dev SW disabled/prompt |
| frontend/tsconfig.app.json | virtual PWA client types |
| frontend/public/pwa-icon.svg, pwa-192.png, pwa-512.png | 기존 note 벡터 기반 설치 아이콘 |
| frontend/src/features/pwa/PwaStatus.tsx | ready/실패/새 버전 대기 안내, 강제reload 없음 |
| frontend/src/features/offline/workspaceCache.ts | 온라인 우선 metadata cache/fallback/검증 |
| frontend/src/features/offline/useConnectivity.ts | native online/offline 표시 |
| frontend/src/features/local-drafts/draftDatabase.ts | v3 additive schema/캐시 transaction/제목 cursor |
| frontend/src/features/local-drafts/localDraftRepository.ts | lazy 제목 복원 adapter |
| frontend/src/features/notes/useNoteDrafts.ts | noteId별 복구 title와 메모리 title 우선순위 |
| frontend/src/features/notes/noteQueries.ts | 오프라인 명시적 결과/reconnect detail GET |
| frontend/src/features/workspace/workspaceQueries.ts | offline에도 로컬 fallback 실행/reconnect GET |
| frontend/src/features/folders/useFolders.ts | 로컬 목록 부재를 서버404로 단정하지 않음 |
| frontend/src/app/AppLayout.tsx | 오프라인 편집/이용불가/서버 작업 차단 안내 |
| frontend/src/main.tsx | cold-offline onlineManager 초기 상태 |
| frontend/tests/offlineWorkspace.test.mjs | 캐시/오류/4xx/취소/빈성공/필드선별8개 |
| frontend/tests/apiFoundation.test.mjs, workspaceMutations.test.mjs | 기존 Query 계약의 저장 adapter 격리 |
| frontend/tests/helpers/loadModules.mjs | offline 모듈 테스트 로더 |
| frontend/tests/browser/outboxStorage.cjs | v1/v2 경유 v3 현재 버전 기대값 |
| frontend/tests/browser/pwaOffline.cjs | 실제 production SW/새프로세스/네트워크 차단/수동ACK/업데이트 |
| scripts/manual-sync-lab.py | 기존 결과 보존을 위한 검증 출력 env override |
| docs/design/pwa-offline.md, local-draft-storage.md, frontend/README.md | 최신 구조/실습/한계/이전 설계 안내 |
| docs/verification/2026-10-26-pwa-* | 이번 실측/이미지/실제 수동 저장 회귀 |
| docs/worklogs/2026-10-26-pwa-offline.md | 순서/파일/검증 기록 |
| docs/troubleshooting/2026-10-26-pwa-offline-recovery.md 및 README | 실제 발견/예방/검증, 로컬 Git 제외 |

## 검증 결과

- `pnpm --dir frontend build`(tsc 포함)/lint/test: 성공, Node109 / fail0 / skipped0 (기존101+신규8).
- production PWA10개 통과: v2→v3 bytes 보존/로컬제목, installability/precache, offline새프로세스+directURL+트리/APIfallback제외,오래된 목록 밖 local Draft URL복원, 편집·refresh·미열람불가, 두번째offlinecoldstart, 온라인복귀Outbox유지+자동PUT0+수동ACK,503보존,waiting 중 미commit 입력/HTMLA유지,창닫은뒤HTMLB/동일token/원고복원.
- Chrome155.0.8059.86. 최종 production origin `http://127.0.0.1:59285`, 임시 profile/build 로그 `/var/folders/j0/4ncpc9m90tg_c7d24lc1kvnr0000gn/T/seam-note-pwa-2K4HM8`. 종료 후 fixture 서버/Chrome은 정리했다.
- 위 API는 합성 HTTP fixture이며 PostgreSQL 저장을 주장하지 않는다. 온라인 복귀 후 수동 PUT1/Ledger1/version1 ACK를 확인했다. 최종은 추가 오프라인 편집과 다른 원고의 작업 때문에 Outbox2가 남는 것이 정상이다. 캐시의 API URL0이다.
- 별도의 실제 Spring/PG 수동 저장 회귀는 pwa-manual-save-results.json에 기록한다. 이전 committed manual-save-results.json은 변경하지 않았다.

## 재현·한계

실습은 [PWA 설계](../design/pwa-offline.md)를 따른다. development5173은 SW를 등록하지 않으며, production preview4173은 별도 origin이다. 기존5173의 미동기화 원고를4173으로 자동 옮기지 않는다. 실제 배포 origin을 유지해야 같은 local data를 복원한다. 브라우저 저장소/캐시 회수, 미commit 입력, 미열람 본문, 설치된 앱/탭 전부닫기 전 업데이트 대기, Safari/iOS·실제 OS 설치 UI·운영CDN은 한계/미검증이다. 백엔드/API/기존 Flyway는 변경하지 않았다.

## 최종 회귀·정리

최종 실제 회귀는 `/private/tmp/seam-note-manual-sync-z4_c5hre`에서 runner exit0으로 끝났다. backend27/실제 수동 저장10/기존7종+manualSaveUx 총8종 모두 통과했다. fixture note는 `0a022505-afd6-4a06-81ac-cd1b104e6268`, 최종serverversion13/Ledger13/선택원고Outbox0이다. 사용한25175/18766/25442는 스크립트가 종료했고5173은 유지했다.

최종 production10개에는 목록 밖 로컬 Draft의 direct URL도 포함했고, 결과 JSON의 sourceHashes를 실제 코드와 비교했다. 마지막 UI의 오프라인 생성 재시도/rename 경로에도 명시적 가용성 guard를 두었다. build/tsc/lint/Node109가 다시 통과했다. 기존 manual-save-results.json과 Flyway/V1/V2 선언 보존, 문서 링크·ignore·diff 검사를 확인했다. 임시 테스트 profile/빌드 폴더는 조사용으로 남으며 Chrome/HTTP fixture 프로세스는 종료했다. API/원고 본문은 SW Cache Storage에 저장하지 않았다.
