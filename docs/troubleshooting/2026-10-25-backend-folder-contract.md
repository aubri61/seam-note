# 빈 원고 검증 및 Folder 전환의 데이터·동시성 위험

- 발견일: 2026-10-25
- 영역: backend
- 구분: 발견된 문제 및 근거가 있는 예상 문제
- 상태: 해결 (공유 DB 적용 및 후속 동기화 제외)

## 현상과 영향

확인: Note 생성/수정 DTO의 @NotBlank가 빈 제목을 거부한다. Folder 관계가 없어 폴더별 원고 저장을 지원하지 않는다. 예상: 기존 notes에 folder_id NOT NULL을 즉시 추가하면 기존 행 때문에 실패한다. 부모 존재 검사만으로 동시 A→B/B→A 이동 시 순환이 가능하다.

## 재현 조건과 근거

- 기존 CreateNoteRequest/UpdateNoteRequest 검증 및 V1 스키마에서 확인.
- UUID는 @GeneratedValue, save() 생성. 수동 UUID로 전환하면서 save()만 유지하면 신규 판별/merge 의미가 달라진다.
- 기존 GlobalExceptionHandler는 BusinessException/DTO 검증만 처리한다.

## 원인

초기 CRUD 설계에 빈 원고·폴더 관계·수동 ID·구조 변경 동시성 정책이 없었다. 공유 DB에 실제 손상이나 순환이 발생했다는 관측은 없다.

## 개선 내용

V2 보존 마이그레이션, 명시적 persist, DTO 빈 문자열 허용, Folder CRUD, DB 트랜잭션 잠금과 FK/정렬 제약, 오류 표준화. 변경 파일과 설계는 ../design/folder-api.md 및 최종 변경 목록 참조.

## 검증과 전후 비교

- 변경 전: 코드에서 빈 제목 거부와 Folder 부재 확인.
- 변경 후: Java 21 + PostgreSQL 17 임시 컨테이너에서 `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_test ./gradlew test bootJar --offline` 성공. JUnit 10개(마이그레이션 2/API 7/context 1), 실패/스킵 0.
- 실제 V1을 적용한 빈 schema와 기존 원고 3개가 있는 schema 각각에서 V2 실행. ID/title/content/created_at/updated_at 원본 비교 일치, FK/NOT NULL/정렬 제약 및 재실행 확인.
- 동시 A→B/B→A 이동에서 한 요청 성공/다른 요청 409, 최종 무순환 확인. 원고 8개 동시 생성에서 중복 없는 정렬값 확인. DB 행 잠금으로 강제한 동시 내용 수정은 VERSION_CONFLICT 409를 반환하고 먼저 반영한 내용 보존.
- 프론트엔드 `pnpm build`, `pnpm lint`, `pnpm test` 성공(기존 13개 테스트). UI 코드는 변경하지 않음.
- 초기 root 경로에서 gradlew 실행은 파일 경로 오류로 실패해 backend wrapper 경로로 수정. 샌드박스의 Docker socket/Gradle cache 쓰기 제한은 확장 권한 명령으로 해결. 의존성 설치/버전 변경 없음.
- 실제 공유 DB 규모, backfill/잠금 지연과 다중 서버 부하는 미측정. 기존 공유 DB에 접근하거나 마이그레이션하지 않음.

## 남은 문제와 후속 조치

공유 DB 적용 전 백업/복구 검증 필요. 전역 구조 잠금은 초기 규모 선택이며 workspace 분리 시 범위를 줄여야 한다. 권한, operationId, Note 이동·Folder 변경의 stale client version, tombstone, 프론트엔드 실제 API 연결은 후속 범위. Note 내용 수정의 stale client version은 아래 후속 개편에서 보호한다. 상세 계약·변경 파일·적용 주의사항은 [설계 및 검증 문서](../design/folder-api.md)에 기록했다.

## 상세 작업 이력

실제 수행 순서와 파일별 변경 전후·이유, 실행 오류·검증 내역은 [2026-10-25 작업 이력](../worklogs/2026-10-25-backend-folder-api.md)에 기록했다.

## 후속 조사 — Note expectedVersion 계약 (2026-10-25)

- 상태: 해결 (Note 내용 수정 범위).
- 확인된 근거: Note의 @Version/NoteResponse.version은 있지만 UpdateNoteRequest에는 클라이언트 버전 필드가 없고, updateNote는 현재 서버 엔티티를 조회한 뒤 무조건 title/content를 교체한다. 따라서 과거 버전을 편집한 요청이 최신 서버 내용을 덮어쓸 수 있다. 실제 사용자 데이터 손실을 관측한 것은 아니다.
- 재현 계획: 원고 생성(version 0) → 다른 수정으로 version 1 → expectedVersion 0을 담은 PUT/PATCH → 409 및 기존 전체 응답 보존을 검증한다.
- 개선 계획: 필수 @NotNull/@PositiveOrZero Long expectedVersion, 서비스에서 내용 변경 전 버전 일치 검사, 기존 VERSION_CONFLICT와 @Version/flush 유지. DB·잠금·EntityManager 흐름은 변경하지 않는다.
- 다른 API의 예상 위험: Note 이동, Folder 이동/이름 변경 역시 요청 버전이 없다. 구조 잠금은 순환·정렬 경쟁을 막지만 오래된 이동 대상/이름의 덮어쓰기를 막지 않는다. 이번 구현 범위에서는 변경하지 않는다.
- 변경 전 재현 결과: 격리 PostgreSQL 17에서 staleExpectedVersionPreservesServerNote 테스트 실패. 기대 409/실제 200이며 version 1 원고가 오프라인 내용으로 변경되고 version 2가 됐다. 합성 테스트 원고만 사용했다.
- 변경 후: DTO에 @NotNull/@PositiveOrZero Long expectedVersion, 서비스의 변경 전 Objects.equals 비교를 적용했다. 기존 VERSION_CONFLICT/GlobalExceptionHandler/@Version/flush/잠금 코드는 유지했다. version 직접 증가 SQL을 사용하던 기존 테스트는 SELECT FOR UPDATE와 실제 두 HTTP 요청으로 대체했다.
- 검증 명령: `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_version_test ./gradlew test bootJar --offline` 성공. JUnit 13개(API 10/마이그레이션 2/context 1), 실패·오류·스킵 0. version 0→1→2, 오래된 버전 409와 전체 응답 보존, 필수/음수 검증, 빈 내용, 같은 버전 두 요청 중 하나만 성공을 확인했다.
- 수동 HTTP 검증도 201/201/200/200/409/200/400/400/400 및 충돌 후 GET 보존을 확인했다. [실제 JSON](../examples/note-expected-version.json), [작업 이력](../worklogs/2026-10-25-note-expected-version.md) 참조.
- 후속 위험: Note 이동·Folder 이동/이름 변경은 여전히 요청 버전 미검증이다. 프론트는 409 시 로컬 초안을 보존하고 서버 최신 문서와 병합하는 UX가 필요하다. 클라이언트 자동 재시도·삭제는 구현하지 않았다. 공유 DB/프론트 E2E/성능은 미검증.
