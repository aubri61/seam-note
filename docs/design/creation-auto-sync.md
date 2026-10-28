# 폴더·노트 생성 자동 서버 반영

2026-10-28. 기존 단계까지의 커밋14d6759 이후 변경이다. 원고 수정 자동 동기화 엔진을 도입한 것이 아니다.

## 데이터 흐름

1. 온라인/오프라인 모두 기존 createLocalFolder/createLocalNote가 로컬 엔티티와 FOLDER_CREATE/NOTE_CREATE를 같은 IndexedDB transaction에 저장한다.
2. 기존 Mutation이 Sidebar/URL/Draft를 즉시 갱신한다. API 실패를 로컬 생성 실패로 되돌리거나 가짜 서버 성공으로 표시하지 않는다.
3. AppLayout 수명의 useAutoCreationSync가 CreationOutbox의 committed 변경을 Dexie liveQuery로 관찰한다. 온라인 시작·재연결 시에도 기존 큐를 읽는다.
4. syncCreations는 기존 전역 Web Lock 안에서 생성 작업 snapshot만 처리한다. 부모 chain을 먼저 확인하고 syncLocalFolder/syncLocalNote를 재사용한다. NOTE_UPDATE는 읽어 전송하지 않는다.
5. 기존 claim은 pending을 inFlight로 고정하고, 결과 불확실 재시도는 같은 operationId/payload를 사용한다. 서버 Idempotency-Key 및 생성 Ledger, ACK/CAS를 그대로 사용한다.
6. 서버 성공·ACK 후 Workspace Query를 갱신하며 원고 생성 응답은 해당 상세 Query에 반영한다. 서버 확인이 끝난 엔티티만 confirmed로 바뀐다.

## 오프라인·실패

오프라인은 POST하지 않고 로컬 생성 엔티티/Draft/CreationOutbox를 유지한다. 같은 브라우저 origin/PWA 재실행 후 복구되며 온라인 전환 시 처리한다. 두 탭은 Dexie 관찰과 기존 Web Lock으로 중복 적용을 막는다.

임시 실패나 다른 탭 lock 점유는1/3/10/30초 간격의 제한된 추가 재시도를 한다. 계속 실패하면 큐를 유지하고 안내한다. 다음 연결 복귀·앱 시작·새 큐 변경 또는 기존 전체 수동 동기화로 다시 처리할 수 있다. 영구 충돌 작업은 자동 반복 전송하지 않는다. 부모 실패 시 종속 작업을 보내지 않고 독립 생성은 계속 처리한다.

서버 생성 전에 입력한 제목·본문은 기존 pending NOTE_CREATE 병합 규칙에 따라 생성 payload에 포함될 수 있다. 생성 POST가 이미 전송된 후 추가 입력은 기존 ACK rebase에 따라 NOTE_UPDATE로 남고, 이번 자동 생성 경로는 이를 자동 PUT하지 않는다. 기존 원고 수정도 수동 저장 정책을 유지한다.

## 관찰 경계와 불변성

스키마 확인/DB 열기를 먼저 수행한 뒤 liveQuery callback은 creationOutbox.toArray를 직접 호출한다. 비동기 스키마 probe를 callback 안에 넣었을 때 최초 생성 후 dependency가 연결되지 않아 pending이 남는 실제 구현 문제를 확인하고 보완했다. 전송 pass는 repository.listCreations의 형식 검증을 거친다. 기존 schema v1~v4 변경 없음.

inFlight snapshot, 부모 생성/ACK, DraftSession 복구/flush/ACK fence, 서버 생성 멱등성은 교체하지 않았다. 앱을 닫아도 생성 큐는 남으며 실행 중 요청의 결과가 불명확하면 같은 키로 확인한다. 생성 자동 반영은 온라인에서 기존 로컬 pending 생성도 처리한다. 사용자 실제 원고는 테스트에 사용하지 않았다.

## 검증

Node169개(기존162+전용7), build/TypeScript/lint 통과. 실제 production PWA·격리 Chrome·IndexedDB·별도 Spring/PostgreSQL4개 묶음 통과:

- 온라인 폴더/노트 POST·ACK, 이후 일반 편집은 NOTE_UPDATE로만 남음(PUT0).
- 오프라인 A→B→C 및 집필, 브라우저 프로필 재실행 후 복구, 두 탭 온라인 복귀에서 부모 순서/ACK 확인.
- 실제 서버 생성 성공 후 응답 유실, 동일 키/payload 재시도2회·Ledger1건.
- 부모503 시 자식 큐 보존/독립 폴더 성공, 재연결 후 부모·자식 성공.

실행 코드: frontend/tests/browser/autoCreationLive.cjs, 단위 테스트 autoCreationSync.test.mjs. 결과: docs/verification/2026-10-28-auto-creation-live.json. 과거 온라인 생성 후 수동 클릭을 전제한 검증 결과를 현재 자동 정책의 결과로 재사용하지 않는다.
