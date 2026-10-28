# 충돌 버전 선택 즉시 서버 저장 및 제목 Diff

## 작업 순서와 변경 파일

1. ConflictDialog/conflictService, syncOneNote/syncLocalNote, ACK와 Query 갱신 경로를 확인했다. 이전 구현은 선택 시 로컬 확정만 수행했고 서버 전송은 별도였다.
2. DiffView.tsx의 제목을 별도 ‘제목’ 영역으로 만들고 양쪽 제목이 다르면 배경·변경 범위·‘변경됨’ 표시를 적용했다. 제목만 다른 원고도 선택할 수 있다. 실제 빈 값은 바꾸지 않는다.
3. conflictService.ts에 saveChosenNote를 추가했다. 선택 확정 후 해당 noteId에 대해서만 기존 syncLocalNote/syncOneNote를 global Web Lock 아래 재사용한다. 불변 operationId/expectedVersion/flush/fence/ACK는 그대로다. 새 UUID 복구도 생성 후 후속 수정 경로를 사용한다.
4. ConflictDialog.tsx는 선택을 IDB에 확정한 다음 서버 저장/ACK까지 기다린 후 닫는다. 저장 중 상태를 표시하고 중복 클릭·닫기를 막는다. 네트워크 실패면 선택한 원고/사본/작업을 유지하고 같은 버튼을 재시도로 바꾼다. 이미 확정된 선택을 다시 적용해 새 key를 만드는 대신 기존 미확정 작업을 재시도한다. 재409/삭제는 최신 비교를 다시 로드한다.
5. 서버 원고 선택으로 제목·본문이 서버와 같으면 기존 syncOneNote는 unchanged이며 불필요한 PUT/version 증가를 만들지 않는다. AppLayout 성공 안내도 ‘서버 저장 확인’으로 수정했다. 해당 Note/Workspace Query를 무효화해 서버 목록과 화면을 갱신한다.
6. conflictSimpleUi.cjs를 제목만 다름/PUT+ACK/서버 채택/취소/네트워크 동일 키/재409 새 키의6개 검증으로 갱신했다. PWA 하네스는 오프라인 선택 후 로컬 보존·서버 저장 불가 안내를 확인한다. 실제 서버 UI 하네스의 background sync 버튼 확인은 Radix inert 상태에서도 DOM locator로 확인하도록 보강했다.

## 검증

- Node162개/build(TypeScript)/lint 통과.
- 실제 Chrome production preview, 합성 mock API와 격리 native IndexedDB의6개 시나리오 통과. 선택한 제목이 에디터/저장 record/서버 snapshot에 일치, ACK 후 Outbox0, 네트워크 재시도 key/body 동일, 재409 후 새 key 및 expectedVersion2를 확인했다. 제목만 다를 때도 PUT/ACK 성공했다.
- production PWA11개 통과. 오프라인에서는 서버 성공으로 표시하지 않고 선택 결과를 로컬에 보존하며 연결 후 재시도를 안내한다.
- 실제 Spring/PostgreSQL UI 최종 결과는 후속 검증에 기록한다. 초기 실행에서 새 UUID가 세션에 없어 전송이 거부되는 누락과, 복구 후 stale conflict list가 해결 모달을 다시 여는 문제를 발견해 readyForSync 및 해결 ID 임시 제외로 보완했다. 이후 여러 Chrome 회귀 동시 실행에서 local race의 A commit 기대가 실패해 다른 Chrome 종료 후 경쟁 탭 쓰기 지연을5초로 명시하여 단독 재검증했다. 제품의 데이터 유실 또는 성능 개선으로 해석하지 않는다.
- 실제 개발 DB/사용자 원고를 테스트에 사용하지 않았고 schema/backend/Flyway 변경 없음. commit/push하지 않았다.

## 최종 확인

실제 격리 Chrome 두 프로필/Spring/PostgreSQL UI4개 묶음 최종 통과. 로컬 충돌 선택 후 추가 sync 클릭 없이 실제 GET 결과를 확인했고, 새 UUID 복구 서버 생성/ACK와 모달 재개방 방지도 통과했다. 실제 서버 결과는 docs/verification/2026-10-28-conflict-choice-save-live-ui.json이다. 최종 production mock6개와 PWA11개, Node162/build/lint 모두 통과했다. 검증 lab/preview는 이번 실행의 프로세스만 종료하며 개발 서버는 유지한다.
