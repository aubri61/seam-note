# 폴더 저장 전용 UI 제거·이전 작업 커밋·생성 자동 반영

## 실제 변경 순서

1. Sidebar/FolderCreationSave 및 로컬 생성 Mutation/CreationOutbox/멱등성/ACK/Web Lock 구조를 확인했다.
2. Sidebar의 ‘서버 미반영 폴더/폴더 서버에 저장’ 영역과 미사용 컴포넌트를 제거했다.
3. 기존 작업 전체를 test162/build/lint 통과 후14d6759 `feat: add safe manuscript conflict resolution and sync recovery`로 커밋했다. 개인 docs/troubleshooting은 기존 ignore대로 포함하지 않았고 push하지 않았다.
4. 그다음 생성 전용 autoCreationSync.ts/useAutoCreationSync.ts를 추가했다. 기존 전송/claim/부모 chain/멱등성/ACK를 재사용하고 NOTE_UPDATE 자동 전송을 제외했다.
5. draftDatabase.ts에 형식 검증된 listCreations 읽기 메서드를 추가하고 creationStorage.ts에 연결했다. schema 변경은 없다. AppLayout.tsx에서 online 상태와 DraftSession에 연결했다.
6. offline 보존/재연결/재실행, 두 탭 잠금, 제한된 backoff, 부모 실패·독립 작업을 처리했다. 네트워크 실패는 생성 취소가 아니라 로컬 보존 상태로 표시한다.
7. unit7개와 실제 production PWA/Spring/PostgreSQL browser4개 묶음을 추가했다.

## 구현 중 발견 사항

- 처음 liveQuery callback에서 async 스키마 probe 후 목록을 읽자 실제 root 생성 후 pending만 남고 POST가 없었다. DB를 먼저 열고 직접 table query를 관찰하도록 보완해 실제 실증 통과했다.
- 테스트의 부모 실패 조건이 undefined===undefined로 NOTE_CREATE까지503을 주입했다. name 조건이 명시됐을 때만 실패시키도록 하네스를 정정했다. 제품 서버 장애로 해석하지 않는다.

## 결과와 범위

Node169/build/TypeScript/lint, 실제 production browser4개 묶음 통과. API/DB는 격리 lab(UI25177/API18766/PG25442)과 합성 UUID만 사용했다. 기존 원고 수정은 자동 PUT하지 않고 기존 Outbox/수동 저장 정책을 유지한다. 서버 스키마/Flyway/API 변경 없음. 새 자동 생성 변경은14d6759 이후 미커밋으로 남기며 push하지 않았다.

설계/실패 정책/재현은 docs/design/creation-auto-sync.md, 원시 결과는 docs/verification/2026-10-28-auto-creation-live.json 참조. 상세 troubleshooting은 기존 docs/troubleshooting/2026-10-26-offline-creation.md에 갱신했다.
