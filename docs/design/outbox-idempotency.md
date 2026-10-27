# Outbox v2와 Note 수정 멱등성

후속 오프라인 생성 단계에서 additive v4와 FOLDER_CREATE/NOTE_CREATE·생성 Ledger·부모 우선 명시적 반영을 추가했다. 최신 생성/수동 저장 흐름은 [오프라인 생성 계약](offline-creation.md)을 따른다. 아래는 해당 선행 단계의 설계·실증 기록이다.


## 일반 원고 수동 저장 UX (2026-10-26)

이후 실험UUID/DEV gate를 제거하고 개발·프로덕션 공통의 상단 수동 저장으로 확장했다. [최신 제품 계약](manual-server-save.md)을 따른다. Outbox/서버 멱등성 스키마와 전송 안전성은 유지한다.

## 후속 구현 (2026-10-26)

아래는 Outbox 기반 단계의 설계·검증 기록이다. 이후 지정한 테스트 노트만 대상으로 수동 PUT/응답 검증/atomic ack와 후속 pending rebase를 추가했다. 자동 전송 엔진은 없다. 최신 동작과 실습은 [원고 한 건의 전체 저장 흐름](../learning/2026-10-26-note-storage-flow.md)을 따른다. v1/v2 schema와 기존 Flyway V1/V2/V3 선언을 변경하지 않았다.

## 기반 단계의 범위

React Draft → IndexedDB Draft/Outbox의 원자적 기록과 Spring Boot Note 수정의 성공 재사용 기반을 구현했다. **자동 서버 PUT/PATCH 전송, 온라인 감지, 재시도 엔진, 성공 ack, 충돌 병합은 없다.** 기존 Query·URL·에디터·생성/삭제 동작을 유지한다.

기존 미커밋 로컬 저장·사이드바·측정 작업은 보존했다. NoteService의 expectedVersion 검사, Note의 @Version, 기존 구조 잠금·EntityManager 코드, Flyway V1/V2는 변경하지 않았다.

## IndexedDB schema와 데이터 보존

DB 이름은 `seam-note-local`이다. 기존 선언 `version(1).stores({ drafts: '&noteId' })`를 그대로 두고 아래 v2를 추가했다.

```ts
version(2).stores({
  drafts: '&noteId',
  outbox: '&operationId, noteId, status',
})
```

- 기존 drafts 레코드를 변경하거나 삭제하지 않는다. noteId·본문·기준 내용·version·revision·token·저장 시각 모두 유지한다.
- v1 → v2 versionchange transaction에서 모든 기존 Draft를 검증하고 dirty인 경우만 최초 pending 작업을 생성한다. expectedVersion은 baseVersion이고 localRevision은 기존 저장 revision이다.
- 업그레이드가 성공하면 schema와 백필이 함께 commit된다. 레코드 검증/Outbox 기록이 실패하면 전체 upgrade를 rollback해 기존 v1과 데이터를 유지한다. 재개방으로 백필을 다시 생성하지 않는다.
- upgrade는 전체 Draft를 toArray로 읽는다. 대규모 저장소의 메모리/열기 지연은 아직 측정하지 않았으며, 필요하면 같은 transaction 안의 keyset pagination을 검토한다.
- 새 v2 DB는 빈 상태에서 시작하므로 백필할 데이터가 없다. 이후 dirty 저장은 저장 transaction에서 큐를 생성한다.
- preflight는 알려진 v1/v2의 store/key/index만 허용한다. 알 수 없는 schema나 더 높은 버전은 자동 변경하지 않는다.
- 이미 열린 구버전 탭은 versionchange에 의해 닫힐 수 있다. 구버전 코드로 v2를 계속 쓰는 대신 재로딩해야 한다. 사용자 DB 삭제를 해결책으로 사용하지 않는다.

백필은 해당 origin의 DB가 새 코드로 처음 열릴 때 일어난다. 아직 앱을 실행하지 않은 브라우저/프로필까지 백그라운드 마이그레이션하지 않는다.

## Outbox 모델

```ts
interface NoteUpdateOperation {
  readonly operationId: string // UUID → Idempotency-Key
  readonly noteId: string
  readonly type: 'NOTE_UPDATE'
  readonly title: string
  readonly content: string
  readonly expectedVersion: number // 서버 작성 기준 baseVersion
  readonly localRevision: number  // 로컬 snapshot 식별
  readonly createdAt: number
  updatedAt: number
  status: 'pending' | 'inFlight' | 'conflict'
  attemptedAt: number | null
}
```

요청 snapshot 필드는 readonly이며 Repository는 생성/미전송 대체와 상태 전이만 제공한다. 읽어온 객체를 메모리에서 바꿔도 저장소가 바뀌지는 않는다. raw Dexie table을 직접 쓰면 Repository 경계를 우회하므로 제품 코드는 adapter를 통해 접근해야 한다. 작업 본문·제목을 로그나 BroadcastChannel로 보내지 않는다.

operationId와 localRevision/storageToken/server version은 서로 다르다. operationId는 특정 전송 payload의 정체성이고, localRevision은 로컬 편집 순서, storageToken은 관측한 저장 head, expectedVersion은 서버 수정의 낙관적 잠금 기준이다.

## 원자적 기록과 병합 규칙

`DexieDraftRepository.write()`는 `[drafts, outbox]`를 같은 rw scope로 사용한다.

1. 현재 Draft의 token과 revision을 검증한다.
2. 해당 노트의 Outbox 상태를 검증하고 새 큐 계획을 만든다.
3. 새 token/revision의 Draft를 저장한다.
4. 안전한 미전송 pending만 제거하고 필요하면 새 작업을 추가한다.
5. 전체 transaction commit 후에만 저장 성공을 반환한다.

Outbox 삽입이 실패하면 Draft 저장과 기존 pending 삭제도 rollback된다. 두 탭의 stale Draft 쓰기는 큐를 변경하기 전에 거부된다. DraftSession의 debounce·직렬 저장·commit ack 정책은 그대로 재사용한다.

| 상황 | 처리 |
| --- | --- |
| frozen 작업 없이 dirty 저장 | 기존 미전송 pending을 새 snapshot의 pending 하나로 대체 |
| frozen 작업 없이 clean으로 원복 | 미전송 pending만 제거, 서버 수정 작업 없음 |
| pending 병합 | **새 operationId** 생성. 같은 키의 요청 내용을 바꾸지 않음 |
| claim 성공 | 같은 Outbox transaction에서 pending → inFlight, attemptedAt 고정 |
| inFlight/conflict가 있는 노트의 추가 편집 | frozen 작업은 그대로 보존하고 최신 후속 pending 하나만 유지 |
| 전송 중인 내용과 동일한 최신 편집 | 중복 후속 작업을 만들지 않음 |
| 전송 중 다른 내용으로 변경한 뒤 clean으로 원복 | 원복 의도의 후속 pending 유지. 선행 요청이 서버를 바꿀 수 있으므로 삭제하지 않음 |
| 결과 불확실/충돌인 선행 작업 뒤 후속 claim | 차단. 임의 버전 추정으로 전송하지 않음 |

`attemptedAt`이 설정된 작업을 pending으로 되돌리는 API는 없다. 결과가 불확실한 작업은 새 키로 바꾸거나 삭제해서는 안 된다. 네트워크 응답 유실 시 기존 operationId와 payload로 결과를 확인해야 한다.

## 후속 엔진이 사용할 로컬 경계

`features/outbox/outboxRepository.ts`는 lazy import로 다음 함수를 제공한다.

- `listPending()` — 전역 pending 조회. 이 목록에는 선행 작업 때문에 claim이 차단되는 항목도 있을 수 있다.
- `listForNote(noteId)` — pending/inFlight/conflict snapshot 조회.
- `claim(operationId)` — 아직 전송을 시도하지 않았으며 같은 노트의 다른 작업이 없는 경우에만 원자적으로 inFlight로 전이.
- `markConflict(operationId)` — inFlight를 conflict로 바꾸되 요청 key/snapshot은 유지.

현재 UI는 이 함수로 HTTP를 보내지 않는다. claim 자체도 자동 호출하지 않는다. 결과가 불확실한 inFlight는 무기한 보존되므로 재시작 복구·lease·재전송·성공 ack는 후속 엔진에서 구현해야 한다.

## 서버 Idempotency-Key 계약

기존 `PUT /api/notes/{id}`와 `PATCH /api/notes/{id}`가 동일한 전체 제목/본문 교체 계약을 유지한다. DTO는 기존 title/content/expectedVersion 그대로다.

```http
PUT /api/notes/00000000-0000-4000-8000-000000000001
Idempotency-Key: 00000000-0000-4000-8000-000000000101
Content-Type: application/json
```

```json
{"title":"","content":"수정 snapshot","expectedVersion":2}
```

위는 계약 예시다. 실제 통합 테스트는 임의 UUID와 합성 원고를 사용한다. 새 성공은 기존 NoteResponse 전체(id/folderId/title/content/sortOrder/version/createdAt/updatedAt)를 JSON으로 반환한다. 예시 expectedVersion 2의 정상 수정이라면 JPA가 version을 증가시키며 코드는 수동 증가시키지 않는다.

| 요청 | 결과 |
| --- | --- |
| 처음 보는 key + 최신 expectedVersion | 기존 NoteService로 수정 후 원래 성공 JSON을 기록, 200 |
| 같은 key + 같은 note/title/content/expectedVersion | **당시 성공 JSON을 그대로 재사용**, 200. 현재 Note를 다시 수정하지 않음 |
| 같은 key + 다른 필드 또는 다른 noteId | 409 IDEMPOTENCY_KEY_REUSED |
| 다른 key + 오래된 expectedVersion | 409 VERSION_CONFLICT, 성공 ledger 없음 |
| 잘못된 UUID key | 400 INVALID_REQUEST |
| key 생략 | 기존 클라이언트 호환 경로. expectedVersion 보호는 유지하지만 성공 replay 보장은 없음 |

이전 요청이 성공했다면 재시도의 expectedVersion이 현재보다 오래돼도 원래 결과를 돌려준다. 이는 새로운 수정을 허용하는 것이 아니라 이미 적용된 작업의 결과를 재사용하는 것이다. 신규 operation은 기존 expectedVersion/@Version 검사를 그대로 통과해야 한다.

PUT/PATCH는 같은 교체 의미라 같은 key/동일 payload를 두 method에 사용해도 같은 결과다. JSON 필드 순서와 공백은 무시하지만 문자열 내용은 정규화하지 않는다. 길이 prefix와 UTF-16 code units로 noteId/요청 필드/operation 종류를 SHA-256 처리해 필드 경계와 Unicode를 손실 없이 구분한다. 변경된 request hash 알고리즘을 기존 ledger와 호환 없이 교체해서는 안 된다.

409의 기존 공통 응답 구조는 유지한다.

```json
{"code":"IDEMPOTENCY_KEY_REUSED","message":"같은 멱등성 키에 다른 요청을 사용할 수 없습니다.","errors":[]}
```

## 서버 transaction과 동시성

새 `IdempotentNoteUpdates.update()`가 READ_COMMITTED transaction을 소유한다. PostgreSQL transaction advisory lock을 `NOTE_UPDATE:{operationId}`에서 계산한 키로 획득한 뒤 기존 성공을 조회한다. lock은 commit/rollback에 자동 해제된다. 해시 충돌은 불필요한 대기만 만들고 다른 key를 같은 작업으로 재사용하지 않는다.

성공이 없으면 기존 NoteService가 같은 transaction에 참여해 expectedVersion 검사/update/flush를 수행한다. 반환된 NoteResponse를 JSON으로 직렬화하고 success ledger에 insert한다. Note 변경과 ledger insert는 같은 DB transaction이므로 기록 실패 시 Note 변경까지 rollback된다. 컨트롤러가 응답을 쓰기 전에 service transaction이 commit된다.

동일 key의 두 요청은 DB lock에서 직렬화되며 첫 commit 이후 두 번째가 성공 기록을 읽는다. operation_id PK도 중복 레코드를 막는다. 서로 다른 key는 서로의 operation lock을 공유하지 않으므로 기존 JPA 낙관적 잠금이 Note 동시 수정을 검증한다.

동일 key라도 실패 응답은 현재 ledger에 기록하지 않는다. 재시도에서 원래 성공 결과를 재사용하는 보장은 **성공 확정 작업**에 대한 것이다. 400/409/500을 성공으로 캐시하지 않는다.

## Flyway V3와 보존 기간

새 `V3__note_update_idempotency.sql`은 `note_update_operations`를 추가한다.

| 컬럼 | 의미 |
| --- | --- |
| operation_id UUID PK | 성공한 작업 식별자 |
| note_id UUID NOT NULL | 대상 원고 식별자. FK 없음 |
| request_hash VARCHAR(64) NOT NULL | 같은 요청인지 확인하는 fingerprint |
| response_json TEXT NOT NULL | 원래 성공 응답 전체 |
| created_at TIMESTAMPTZ | 성공 transaction 기록 시각 |

**보존 기간은 무기한이고 자동 삭제/TTL은 없다.** 같은 요청의 재시도 허용 기간도 제한하지 않는다. 한 번 성공한 key를 다른 payload에 재할당하는 것은 영구 금지다. 추후 유한 보존 기간을 도입하려면 새 계약과 삭제 이후의 tombstone/만료 거부 정책이 필요하다. 과거 key를 그냥 삭제해 신규 요청처럼 다시 적용해서는 안 된다.

이후 원고가 다른 작업으로 수정되거나 물리 삭제돼도 원래 성공 결과를 복원해야 하므로 Note FK로 cascade 삭제하지 않는다. replay는 현재 원고 조회가 아니며 삭제된 원고를 재생성하지 않는다. 전체 응답의 본문을 무기한 보관하므로 저장 용량과 개인정보 삭제 정책은 운영·인증 설계와 함께 검토해야 한다. 새 인증을 추가할 때는 key/조회 범위를 사용자·workspace로 격리해야 한다. 현재는 기존 인증 없는 단일 API 범위를 유지한다.

## 검증

- frontend `pnpm build`(tsc 포함), `pnpm lint`, `pnpm test`: **84개 통과**. 기존 79개 유지 + Outbox 모델 5개.
- 실제 headless Chrome/격리 IndexedDB: 신규 outboxStorage + 기존 6개 브라우저 스크립트, **7종 모두 통과**.
- 신규 브라우저: v1 dirty/clean 레코드 전 필드 보존, dirty 백필/재개방 중복 방지, 잘못된 레코드의 versionchange rollback, Outbox 삽입 실패 시 Draft/기존 pending 복원, 100회 저장/즉시 session 입력, inFlight/conflict 불변성, clean 보상 의도, 두 연결 CAS/claim 경쟁. HTTP 호출 0개 확인.
- 별도 임시 PostgreSQL **14.20**/25441/seam_note_outbox_test에서 `./gradlew test bootJar --offline`: **27개 통과**, 실패·오류·스킵 0. 기존 15개 + 멱등 API 9개 + fingerprint 3개.
- 실제 API 동시 key 요청, 다른 key의 @Version 경쟁, 입력 검증/키 재사용 거부, 원고 후속 수정/삭제 후 replay, 오래된 ledger replay, ledger insert trigger 실패 후 Note rollback을 검증했다.
- 성공 응답 유실은 테스트 TCP proxy가 실제 API 성공/commit 뒤 downstream 연결을 응답 바이트 없이 종료해 재현했다. 같은 key 재시도가 원래 응답과 version 1을 복원했다.
- Flyway V1/V2 checksum은 변경 전과 동일하다. 개발 DB15439/서버18765/사용자 원고에는 쓰지 않았다. PostgreSQL17 배포 환경과 Safari는 이번에 직접 검증하지 않았다.

## 후속 서버 동기화 엔진의 필수 작업

1. pending을 claim한 뒤 **그 snapshot만** 전송하고 operationId를 Idempotency-Key에 넣는다. timeout이면 같은 key/payload로만 결과를 확인한다.
2. inFlight 재시작 복구·worker 소유/lease를 설계한다. 불확실 상태를 단순 pending으로 되돌리거나 새 key로 재전송하지 않는다.
3. 성공 ack를 로컬 CAS transaction과 session에 반영한다. 더 최신 편집이 있으면 내용을 유지하면서 성공 snapshot을 기준으로 baseVersion/baseTitle/baseContent를 재조정해야 한다.
4. 확인된 선행 작업을 처리한 뒤 후속 pending을 새 expectedVersion의 **새 operationId**로 안전하게 재생성한다. 현재 기록된 후속 expectedVersion을 그대로 보내면 stale일 수 있다.
5. VERSION_CONFLICT/IDEMPOTENCY_KEY_REUSED/404/네트워크 오류를 구분한다. 충돌·삭제 원고를 자동 덮어쓰기/자동 재생성하지 않는다.
6. 삭제된 서버 노트의 로컬 Draft/작업도 자동 삭제하지 않는다. 기존 생성/삭제 API를 Outbox 작업으로 바꾸지는 않았다.
7. UI의 로컬 저장과 서버 ack·실패·충돌을 분리한다. 현재 구현을 서버 자동 동기화 완료로 표시하지 않는다.
