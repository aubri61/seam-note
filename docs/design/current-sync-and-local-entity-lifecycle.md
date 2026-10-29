# 현재 동기화 흐름과 IndexedDB 레코드 수명

## 저장소별 역할

| 저장소 | 역할 | 서버 전송 여부 |
| --- | --- | --- |
| React DraftSession | 현재 탭의 편집본·마지막 IDB checkpoint·token/revision | 직접 전송하지 않음 |
| drafts | Tiptap JSON 편집본, 기준 서버 title/content/version, 로컬 revision/token | Outbox snapshot의 근거 |
| outbox | 기존 원고의 NOTE_UPDATE 불변 요청 snapshot | 수동 전체 동기화/저장 단축키 |
| creationOutbox | FOLDER_CREATE/NOTE_CREATE 요청 snapshot 및 부모 의존성 | 생성 직후·앱 시작·온라인 복귀의 생성 전용 자동 처리 또는 수동 전체 동기화 |
| localEntities | 로컬 생성 folder/note 메타데이터, 미생성/서버 생성 확인 상태 | 전송 큐 자체는 아니지만 생성/의존성/ACK 판단에 사용 |
| workspace | 마지막 성공한 서버 전체 메타데이터 GET snapshot | 조회 캐시, 오프라인 목록 복원 |
| deletedEntities(v5) | 사용자 명시 삭제의 엔티티 종류+ID marker | 서버 전송 없음, stale 탭 재생성 방지 |

## 새 폴더/새 원고

1. creationStorage.createFolder/createNote가 같은 생성/동기화 Web Lock에서 createLocalFolder/createLocalNote를 호출한다.
2. localEntities confirmed=false와 creationOutbox pending을 같은 IDB readwrite transaction으로 기록한다. 새 노트는 Draft도 함께 기록한다. UI는 서버 workspace와 localEntities를 병합하고 새 노트 URL로 이동한다.
3. useAutoCreationSync가 커밋된 creationOutbox를 관찰한다. 온라인이면 생성 전용 syncCreations를 실행한다. 부모 폴더가 먼저 확정돼야 자식을 보낸다. 이 경로는 기존 원고 NOTE_UPDATE를 자동 전송하지 않는다.
4. claimCreation이 pending을 inFlight로 전환한다. POST에는 operationId를 Idempotency-Key로 보낸다. 전송한 payload/key는 결과가 불확실할 때 바꾸지 않는다.
5. 응답의 ID/key/payload/version0을 검증하고 confirmCreation으로 ACK한다. creationOutbox를 제거하고 localEntities를 confirmed=true/confirmedAt으로 갱신하며 workspace에 서버 메타데이터를 합친다.
6. 노트 생성 중 추가 입력이 있었다면 ackNoteCreation이 최신 Draft를 보존하고 필요한 NOTE_UPDATE를 동일 ACK transaction에서 만든다. 생성 전용 자동 처리는 그 UPDATE를 자동으로 보내지 않는다. 수동 전체 동기화 실행 안에서 생성 ACK가 이뤄졌다면 한 번의 bounded 후속 UPDATE가 허용된다.

## 기존 원고 수정

1. Tiptap→React Draft. session이 원고별 debounce(평상시400ms, 지속 입력 시 최대 대기2초)를 거쳐 write한다.
2. IDB readwrite transaction에서 tombstone/기존 token/revision을 검증한 다음 Draft와 NOTE_UPDATE를 함께 기록한다.
3. 미전송 pending은 최신 입력으로 합칠 수 있지만 operationId는 새로 발급한다. inFlight/conflict의 snapshot을 고치거나 지우지 않는다.
4. ‘전체 동기화’ 또는 ⌘S/Ctrl+S는 syncWorkspace를 호출한다. 현재 탭의 로컬 저장을 먼저 flush하고 기존 Web Lock 아래 생성 의존성과 충돌을 점검한다. 로컬 저장 실패 원고는 건너뛰고 독립 항목은 계속한다.
5. prepareManual이 snapshot을 claim한다. PUT에 Idempotency-Key=operationId 및 expectedVersion을 보낸다. 서버는 ledger와 Note @Version/expectedVersion을 같은 DB transaction에서 확정한다.
6. 성공 응답 검증 후 acknowledge가 현재 token/revision 및 작업을 다시 검사한다. 기준 서버 버전을 응답 버전으로 갱신하고 확정 작업을 제거한다. 전송 중 추가 입력은 유지하고 후속 UPDATE를 새 ID/새 expectedVersion으로 같은 IDB transaction에서 생성한다.
7. 네트워크/응답 유실은 같은 키·동일 snapshot으로 다음 명시적 동기화 때 재시도한다. VERSION_CONFLICT/NOTE_NOT_FOUND는 자동 덮어쓰기·재생성 없이 별도 충돌 처리한다. ACK 실패도 작업을 보존한다.
8. 수동 동기화는 서버 detail/Workspace 조회도 갱신한다. dirty Draft와 불확정 전송이 있는 Draft를 GET으로 덮어쓰지 않는다.

## localEntities 정리 정책

- 생성 ACK 직후 바로 제거하면 ACK보다 오래된 진행 중 GET과 부모 의존성 판단 사이에 틈이 생길 수 있어 confirmed 기록을 잠시 보관한다.
- 기존 구현에는 confirmed 행을 물리 정리하는 정책이 없어 누적됐다. 화면 merge에서 제외되더라도 DevTools에는 남아 있었다.
- 이제 saveWorkspace가 성공한 최신 전체 GET을 저장하는 동일 transaction에서 정리한다. confirmedAt보다 요청 시작 시각이 확실히 나중이어야 한다. 더 오래된 GET은 이전 requestedAt fence로 전체 저장을 중단한다.
- 미확정 엔티티, 자기 생성 작업이 남은 엔티티, NOTE_UPDATE가 남은 노트, 서버 snapshot에 없는 부모를 미생성 자식이 참조하는 경우, confirmedAt이 없거나 요청보다 최신인 경우는 유지한다.
- 정리 대상은 중복 메타데이터뿐이다. Draft·Outbox·CreationOutbox 본문/요청을 지우지 않는다. 서버에 이미 없고 보호할 작업/의존성도 없는 오래된 confirmed 메타데이터도 정리한다.
- 오프라인/실패한 GET에서는 정리하지 않는다. 이 테이블 전체를 clear하면 미생성 항목과 부모 의존성을 잃으므로 금지한다.
- 명시적 원고/폴더 삭제는 서버 확인 후 해당 localEntities/관련 큐/Draft/workspace를 원자적으로 정리하고 tombstone을 기록한다. 상세한 삭제 실패 복구는 이전 worklog 참조.

## DevTools에서 Draft 행만 지운 경우

- 서버 원고 삭제나 ‘로컬 원고 삭제’와 다르다. Draft만 지우면 메모리 token이 남아 기존 CAS가 거부하는 현상을 재현했다.
- restoreMissing은 마지막으로 커밋한 메모리 checkpoint가 있고, 삭제 marker가 없고, 행이 실제로 없고, 남은 pending 요청이 그 checkpoint와 정확히 일치할 때만 복구한다. pending NOTE_CREATE도 같은 조건으로 검증한다.
- absence/queue 검증과 기존 write의 missing-row CAS를 같은 IDB transaction에서 수행한다. 단순히 token을 undefined로 바꿔 재시도하지 않는다. 다른 탭이 먼저 새 행을 만들면 덮어쓰지 않는다.
- 기존 inFlight/conflict 요청, 알 수 없는 변경은 자동 복구하지 않고 현재 입력과 snapshot을 보존한다. 사용자가 앱에서 명시적으로 삭제한 marker가 있으면 복구하지 않는다.
- 수동 DevTools 변경은 여러 저장소의 관계를 끊을 수 있다. 본문을 잃은 고아 작업을 일괄 삭제하거나 다른 저장소 전체를 비워 문제를 숨기지 않는다.
