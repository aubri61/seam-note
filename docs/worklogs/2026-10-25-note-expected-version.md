# 2026-10-25 — Note expectedVersion 작업 이력

## 기록 기준

사용자가 요청한 Note 내용 수정의 expectedVersion 계약 추가 작업이다. 이전 Folder 개편의 작업 디렉터리 변경은 그대로 유지한다. 아래 순서는 실제 도구 실행 순서이며, 확인하지 않은 파일 저장 시각은 기록하지 않는다.

## 수행 순서

1. 기존 git 상태와 AGENTS.md 확인. Note 엔티티, UpdateNoteRequest, NoteService, NoteController, NoteResponse, ErrorCode, GlobalExceptionHandler, 기존 통합 테스트와 test 설정을 읽었다. FolderService의 이동/이름 변경도 읽어 위험을 분석했다.
2. PUT/PATCH가 같은 DTO와 updateNote를 사용하고, 현재 @Version은 stale client 요청의 버전을 확인하지 않는다는 점을 보고했다. 기존 트러블슈팅 문서에 후속 문제를 발견 시점에 기록했다.
3. 이 작업 이력 문서를 생성했다. 기존 FolderNoteApiTests의 정상 PUT/PATCH에 expectedVersion을 추가하고, 연속 수정·stale 거부·입력 검증 테스트를 작성했다. 기존 수동 version 증가 SQL 동시성 테스트를 SELECT FOR UPDATE와 실제 PUT/PATCH 두 요청으로 대체했다.
4. Docker 확장 권한으로 PostgreSQL 17 일회용 컨테이너 seam-note-version-verification을 생성했다. 별도 DB seam_note_version_test, 로컬 포트 25439를 사용했다. 기존 seam-note-db에는 연결하지 않았다.
5. 구현 전 `./gradlew test --tests '*FolderNoteApiTests.staleExpectedVersionPreservesServerNote' --offline`을 TEST_DB_URL 지정 후 실행했다. 테스트 1개 실패: 예상 409/실제 200. 합성 원고 version 1이 offline title/body로 바뀌고 version 2가 된 응답을 확인했다.
6. UpdateNoteRequest에 필수·0 이상 Long expectedVersion과 접근자를 추가했다. NoteService.updateNote에서 엔티티 수정 전에 Objects.equals 버전 비교를 추가하고 불일치 시 기존 VERSION_CONFLICT 예외를 던지게 했다. 엔티티의 @Version과 기존 flush는 그대로 유지했다.
7. 격리 DB에서 `./gradlew test bootJar --offline` 실행 성공. 총 13개(API 10/마이그레이션 2/context 1), 실패·오류·스킵 0. 테스트 XML로 확인했다.
8. diff 검사에서 UpdateNoteRequest 끝의 불필요한 빈 줄을 발견해 제거했다. 동작 변경은 없었다.
9. 빌드된 jar를 별도 포트 28765로 실행했다. 실행 인수로 테스트 DB URL/사용자/비밀번호를 명시했다. `/private/tmp/seam_expected_version_examples.py`로 합성 Folder/Note를 생성해 실제 HTTP 요청·응답을 수집했다. 생성 0→PUT 1→빈 내용 PATCH 2→오래된 PUT 409→GET 전체 값 일치, null/음수/누락 400 확인. docs/examples/note-expected-version.json에 기록했다.
10. docs/design/folder-api.md의 현재 계약과 미구현 범위를 수정하고, 실제 요청/응답·다른 API 위험·프론트 충돌 해결 UX·13개 테스트 결과를 추가했다. 기존 10개 테스트 결과는 최초 Folder 개편 당시 기록임을 명시했다. 기존 트러블슈팅 후속 절과 목록 상태를 결과에 맞춰 갱신했다.
11. 임시 백엔드에 SIGTERM을 보내 graceful shutdown을 확인한 뒤 이번 PostgreSQL 컨테이너만 제거했다. 생성 보조 스크립트는 저장소에 추가하지 않았다.
12. 이 작업 이력에 실제 실행 순서와 파일별 변경을 확정하고, git diff 공백 검사와 문서 링크·예제 JSON·필요 파일 존재를 검증했다. 문서/EOF 공백 수정 뒤 동작 변경이 없어 전체 테스트를 추가 반복하지 않았다.

## 변경 파일과 검증 결과

이번 후속 작업에서 수정·생성한 파일은 아래 8개다. 이전 개편의 git diff 전체를 이번 변경으로 집계하지 않는다.

| 파일 | 구분 | 이번 변경 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/note/dto/UpdateNoteRequest.java` | 수정 | @NotNull/@PositiveOrZero Long expectedVersion, getter/setter 추가. title/content 검증 유지, 미사용 UUID import와 EOF 공백 정리 |
| `backend/src/main/java/com/seamnote/backend/note/service/NoteService.java` | 수정 | updateNote에서 내용 변경 전 Objects.equals(note.version, request.expectedVersion) 검사, 불일치 시 기존 VERSION_CONFLICT. 일치 시 기존 update/flush/DTO 반환 유지 |
| `backend/src/test/java/com/seamnote/backend/FolderNoteApiTests.java` | 수정 | 정상 수정·길이 검증 요청을 새 계약에 맞춤. 0→1→2, PUT/PATCH stale 409와 전체 값 보존, 필수·음수 및 내용 검증 추가. 동시성 테스트의 수동 version 증가를 제거하고 DB 잠금으로 실제 두 HTTP 요청의 경쟁 검증 |
| `docs/design/folder-api.md` | 수정 | PUT/PATCH 필수 expectedVersion 계약, 실제 JSON, 버전 흐름, 오류 구조, 이동/Folder 위험, 프론트 UX, 검증 결과 추가. 초기 검증 기록과 현재 상태 구분 |
| `docs/examples/note-expected-version.json` | 신규 | 격리 환경의 합성 원고로 수집한 9개 실제 HTTP 요청·응답 교환 기록 |
| `docs/troubleshooting/2026-10-25-backend-folder-contract.md` | 수정 | 기존 동일 문제 기록에 stale write 후속 재현·원인·수정·검증·후속 위험 추가 |
| `docs/troubleshooting/README.md` | 수정 | 조사 중 상태를 거쳐 Note expectedVersion까지 해결한 상태로 갱신 |
| `docs/worklogs/2026-10-25-note-expected-version.md` | 신규 | 이 작업의 순서, 파일별 변경, 재현 실패와 검증 결과 기록 |

DB 스키마·기존 Flyway·Note 엔티티·NoteResponse·컨트롤러·오류 코드/처리기·기존 잠금/EntityManager 구성·다른 변경 API·프론트엔드는 이번 작업에서 수정하지 않았다. version 컬럼을 직접 증가시키는 구현이나 테스트 SQL을 추가하지 않았다.

## 검증 명령과 결과

backend 디렉터리에서 공통 환경변수 `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_version_test`를 지정했다. Gradle 캐시와 Docker/로컬 네트워크 접근에는 확장 권한을 사용했다.

- 구현 전: `./gradlew test --tests '*FolderNoteApiTests.staleExpectedVersionPreservesServerNote' --offline` → 문제 재현에 따른 의도된 실패(1개, 기대 409/실제 200).
- 구현 후: `./gradlew test bootJar --offline` → 성공, tests 13/failures 0/errors 0/skipped 0. 테스트 XML은 backend/build/test-results/test, 실행 jar는 backend/build/libs/backend-0.0.1-SNAPSHOT.jar.
- 동시성: 두 요청 모두 같은 expectedVersion 0으로 검사 후 DB UPDATE 대기에 도달한 조건을 확인. 한 요청만 200/version 1, 다른 요청은 VERSION_CONFLICT 409. 최종 GET은 성공 응답 전체와 일치.
- 실제 JSON 확인: HTTP 상태 201/201/200/200/409/200/400/400/400, 버전 0→1→2. 원문은 [실제 JSON](../examples/note-expected-version.json).
- 최종 정적 검사: git diff --check, 문서 상대 링크와 파일 존재, JSON parse 및 요청/응답 값 일치 확인.

## 남은 범위

Note 이동·Folder 이동/이름 변경은 구조 잠금과 @Version만 있고 expectedVersion은 없다. 오래된 요청이 순차적으로 도착하면 최신 위치/이름을 덮어쓸 수 있으므로 각각 대상 엔티티의 버전 계약이 필요하다. 이번 구현에는 포함하지 않았다. Note 내용·이동이 같은 version을 공유하므로 이동 후 stale 내용 저장은 이번 검사로 거부된다.

프론트는 마지막 서버 버전을 전달하고 성공 응답으로 갱신해야 한다. 409 시 로컬 초안/Outbox를 보존하고 최신 서버 원고를 별도로 GET하여 비교·병합·사본 저장 UX를 제공해야 한다. 자동 덮어쓰기나 로컬 삭제를 구현하지 않았다. 공유 DB 적용·프론트 E2E·운영 규모 부하 검증은 수행하지 않았다.
