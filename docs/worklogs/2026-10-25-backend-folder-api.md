# 2026-10-25 — Folder 중심 DB·API 개편 작업 이력

## 기록 기준

- 작업자: 이 채팅에서 작업한 Codex.
- 대상: `/Users/jueon/Desktop/seam-note`의 백엔드 DB 구조 및 API 개편.
- 이 문서는 실제 실행한 도구 호출과 현재 파일, 테스트 결과를 바탕으로 작업 후 정리했다. 아래 번호는 수행 순서이며, 기록되지 않은 개별 파일 저장 시각은 추정하지 않는다.
- 여러 파일을 한 번의 생성 스크립트로 작성한 단계는 **같은 구현 묶음**으로 표시했다. 그 사이에 별도 빌드나 검증을 했다고 해석하면 안 된다.
- 기존 분석·API 계약·ERD: [설계 및 완료 보고서](../design/folder-api.md).
- 문제 근거·대응·남은 위험: [트러블슈팅 기록](../troubleshooting/2026-10-25-backend-folder-contract.md).
- 커밋하거나 공유 DB에 적용한 이력이 아니라, 작업 디렉터리에서 생성·수정하고 임시 환경에서 검증한 이력이다.

## 1. 수행 순서

### 1) 지시서와 작업 규칙 확인

첨부된 백엔드 개편 지시서와 루트 `AGENTS.md`를 읽었다. 데이터 보존, 기존 Flyway 파일 유지, 빈 원고 허용, Folder/Note 분리, 변경 전 분석, 트러블슈팅 기록 의무를 확인했다.

`git status --short`로 초기 상태를 확인했다. 이 시점부터 `AGENTS.md`와 `docs/`는 이미 미추적 상태였다. 따라서 최종 상태에서 미추적이라고 해서 모두 이번 작업에서 만든 파일은 아니다. 기존 프론트엔드 트러블슈팅 문서는 유지했다.

### 2) 기존 백엔드·프론트엔드 실제 파일 조사

다음 파일을 읽고 현재 구조를 확인했다. 이 단계에서는 코드를 수정하지 않았다.

- `backend/build.gradle`, `backend/gradle/wrapper/gradle-wrapper.properties`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/db/migration/V1__create_notes.sql`
- `backend/src/main/java/com/seamnote/backend/note/`의 엔티티·Repository·Service·Controller·생성/수정/응답 DTO
- `backend/src/main/java/com/seamnote/backend/common/`의 예외·오류 DTO
- `backend/src/test/java/com/seamnote/backend/BackendApplicationTests.java`
- `docker-compose.yml`, 루트 `README.md`
- `frontend/package.json`, `frontend/vite.config.ts`
- `frontend/src/features/notes/notes.ts`, `NoteEditor.tsx`
- `frontend/src/features/folders/folderModel.ts`, `useFolders.ts`
- `frontend/src/App.tsx`, `frontend/src/app/AppLayout.tsx`
- `docs/troubleshooting/README.md`, `_template.md`

`rg`로 프론트엔드의 `fetch`, `axios`, `/api/`, `useQuery` 사용을 검색했다. 현재 화면은 API를 호출하지 않고 샘플 데이터를 React 상태로 관리한다는 것을 확인했다. 선택적으로 검색한 `.agents` 디렉터리는 존재하지 않아 해당 검색 명령이 비정상 종료했지만, 필요한 프로젝트 파일 조회는 계속했다.

### 3) 실행 환경 확인 및 분석·설계 보고

Java 21, Gradle 캐시, 프론트엔드 node_modules, pnpm, Docker, psql의 사용 가능 여부를 확인했다. 로컬에 설치된 PostgreSQL 도구는 14였으므로 이를 PostgreSQL 17 검증 결과로 사용하지 않았다.

분석 결과와 구현 계획을 채팅에 먼저 보고했다. 핵심 선택은 별도 Folder 테이블, 데이터 보존 V2, 명시적 persist, 정수 sortOrder, @Version, DB 트랜잭션 잠금, 기존 PUT/전체 목록 유지, 신규 폴더별 요약 응답이었다.

### 4) 설계 문서와 발견 시점의 문제 기록 작성

먼저 아래 문서를 작성·갱신했다.

| 파일 | 작업 | 당시 기록한 내용 |
| --- | --- | --- |
| `docs/design/folder-api.md` | 신규 생성 | 기존 구조 분석, ERD, 설계 결정, 마이그레이션 순서, 검증 계획, 공유 DB 적용 주의사항, 후속 동기화 범위 |
| `docs/troubleshooting/2026-10-25-backend-folder-contract.md` | 신규 생성 | 빈 제목 거부, Folder 부재, NOT NULL 전환·수동 UUID·동시 이동의 예상 위험과 근거. 상태는 개선 중으로 시작 |
| `docs/troubleshooting/README.md` | 수정 | 기존 목록을 유지하고 신규 백엔드 문제 기록 링크 추가 |

### 5) 첫 구현 묶음: 스키마 → 모델 → DTO → 저장소 → 서비스 → 컨트롤러 → 예외

`/private/tmp/seam_backend_generate.py`에 생성 보조 스크립트를 작성해 실행했다. 이 스크립트는 저장소의 기능 코드가 아니며, 아래 소스 파일을 쓰는 데 사용했다. 같은 도구 호출에서 별도의 Python 편집으로 기존 예외 코드도 수정했다.

실제 작성 순서는 다음과 같다. **이 묶음 내부에서는 단계별 빌드 없이 파일을 연속 작성했다.**

1. 신규 V2 마이그레이션 SQL.
2. Folder 엔티티 생성, Note 엔티티 수정.
3. Note 생성/수정/이동 요청 DTO, Folder 생성/수정/이동 요청 DTO.
4. FolderResponse, NoteResponse, NoteSummaryResponse.
5. FolderRepository, NoteRepository.
6. FolderStructureLock.
7. FolderService, NoteService.
8. NoteController, FolderController.
9. ErrorCode, GlobalExceptionHandler.

각 파일의 변경 전후와 이유는 아래 2절에 전부 기록했다.

### 6) 최초 빌드 시도와 환경 제한 해결

- 루트에서 `./gradlew -p backend test --offline`을 실행했으나 루트에 wrapper가 없어 실패했다. 올바른 wrapper는 `backend/gradlew`였다.
- backend 디렉터리에서 `./gradlew test --offline`을 다시 실행했으나 샌드박스가 사용자 Gradle 캐시의 lock 파일 쓰기를 차단했다.
- Docker 조회도 최초에는 socket 접근이 차단됐다.
- 해당 명령들을 확장 권한으로 실행해 환경 제한을 해결했다. 라이브러리나 빌드 도구 버전을 바꾸지 않았다.
- 확장 권한의 Docker 조회로 기존 `seam-note-db`가 PostgreSQL 17 이미지임을 확인했다. DB 안의 데이터나 Flyway 이력을 조회한 것은 아니다.

### 7) 격리된 PostgreSQL 17 준비 및 첫 컴파일

`seam-note-api-verification`이라는 일회용 컨테이너를 생성했다. PostgreSQL 17, 별도 DB `seam_note_test`, 로컬 포트 `25439`를 사용했다. 기존 DB 컨테이너나 기존 볼륨을 연결하지 않았다.

backend에서 `./gradlew compileJava compileTestJava --offline`을 실행해 성공했다. 이 명령 시작 시점에는 새 통합 테스트 파일을 아직 작성하기 전이었다. 따라서 이 결과를 신규 API 테스트 통과로 보고하지 않았다.

### 8) 테스트 전용 설정과 검증 코드 작성

다음 순서로 파일을 생성·수정했다.

1. `backend/src/test/resources/application-test.yml` 생성: TEST_DB_URL을 명시해야만 테스트 DB에 연결하도록 설정.
2. `BackendApplicationTests.java` 수정: test 프로필 적용.
3. `FolderNoteApiTests.java` 생성: RANDOM_PORT 실제 HTTP 서버로 CRUD·검증·동시 이동·동시 생성 검증.
4. `FolderMigrationTests.java` 생성: 별도 schema에서 실제 V1을 먼저 적용하고 V2로 전환하는 빈 DB/기존 데이터 테스트.

### 9) 첫 전체 검증

아래 두 검증 작업은 독립적으로 실행했다.

| 명령 | 결과 |
| --- | --- |
| backend에서 `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_test ./gradlew test bootJar --offline` | 당시 작성된 백엔드 테스트 및 실행 jar 빌드 성공 |
| frontend에서 `pnpm build && pnpm lint && pnpm test` | 빌드·린트 성공, 기존 테스트 13개 통과 |

마이그레이션은 단순한 최신 스키마 생성으로 대체하지 않았다. V1 데이터의 ID/title/content/created_at/updated_at을 보관한 뒤 V2 이후 행별 값과 비교했다.

### 10) 버전 충돌과 이름 공백 처리 보강

첫 검증 뒤 추가로 수정했다.

- `GlobalExceptionHandler.java`: Spring DAO 예외 외에 직접 `EntityManager.flush()`에서 발생할 수 있는 JPA OptimisticLockException, Hibernate ConstraintViolationException도 공통 오류 응답으로 처리하도록 추가했다. 사용하지 않는 import/지역 변수/주석 잔여물도 정리했다.
- `FolderService.java`: 이름의 앞뒤 공백 제거를 `trim()`에서 `strip()`으로 바꿨다.
- `FolderNoteApiTests.java`: DataSource를 주입하고 DB 행 잠금으로 동시 내용 수정 충돌을 강제하는 테스트를 추가했다. HTTP 409, VERSION_CONFLICT, 먼저 저장된 내용 보존까지 검증했다.

백엔드 `test bootJar --offline`을 재실행해 성공했다. 최종 테스트 구성은 API 7개, 마이그레이션 2개, context 1개로 총 10개가 됐다.

### 11) 입력 경계 테스트와 API 문서 보강

- `FolderNoteApiTests.java`: 유효한 folderId가 있는 상태에서도 title/content 각각의 누락·null을 거부하는지 추가 검증했다. PUT의 제목 201자 거부도 추가했다.
- `docs/design/folder-api.md`: 모든 endpoint의 Method/URL/요청/응답/성공 상태, 필드 의미, 오류 코드 표, 검증 실행 방법을 추가했다.
- `git diff --check`에서 CreateNoteRequest의 빈 줄에 남은 공백을 발견했다. 최초 공백 정리 스크립트는 backend 작업 디렉터리에서 상대경로를 중복 지정해 대상 파일을 찾지 못했으므로, 루트에서 다시 실행해 정리했다.
- 백엔드 `test --offline` 재실행 성공, `git diff --check` 통과를 확인했다.

### 12) 최종 소스 검토와 문서 갱신

FolderService, NoteService, Folder/Note 엔티티와 diff를 다시 읽었다. 생성자 대입·persist/flush 등의 줄바꿈과 패키지/import 사이 간격을 정리했다. 동작 변경을 위한 새 기능은 추가하지 않았다.

- `docs/design/folder-api.md`: 최종 결과, 미검증 사항, 프론트엔드 API 연결이 남아 있다는 점, 전체 변경 파일 목록 추가.
- 백엔드 트러블슈팅 문서: 실제 검증 명령·결과, 실행 경로 오류와 권한 제한 해결, 후속 위험을 갱신.
- `docs/troubleshooting/README.md`: 해당 문제의 상태를 해결로 갱신.

### 13) 최종 검증과 임시 환경 정리

- backend에서 `TEST_DB_URL=jdbc:postgresql://127.0.0.1:25439/seam_note_test ./gradlew test bootJar --offline` 성공.
- 테스트 XML에서 총 10개, failures/errors/skipped 모두 0임을 확인했다.
- `git diff --check` 통과.
- `git diff --name-only -- frontend backend/src/main/resources/db/migration/V1__create_notes.sql`의 결과가 비어 있음을 확인했다. 프론트엔드 소스와 V1은 변경하지 않았다.
- 이번에 생성한 `seam-note-api-verification` 컨테이너만 삭제했다. 기존 `seam-note-db`와 볼륨은 변경하지 않았다.
- 기존 작업 완료 결과를 채팅에 보고했다.

### 14) 사용자 요청에 따라 상세 작업 이력 추가 — 이번 후속 작업

- 기존 설계·트러블슈팅 문서, 현재 git 상태, Folder DTO/Repository, 빌드 산출물과 테스트 XML을 다시 확인했다.
- 이 문서 `docs/worklogs/2026-10-25-backend-folder-api.md`를 신규 작성했다.
- 설계 및 트러블슈팅 문서에 상세 이력으로 가는 링크를 추가했다.
- 문서 링크/파일 목록과 `git diff --check`를 확인했다. 이번 후속 작업은 문서 변경만 수행하므로 애플리케이션 테스트를 다시 실행하지 않는다.

## 2. 파일별 변경 내역 전체

아래 경로는 저장소 루트 기준이다. 단계 번호는 위 수행 순서와 대응한다.

### DB 마이그레이션

| 파일 | 구분 / 최초 단계 | 변경 내용과 이유 |
| --- | --- | --- |
| `backend/src/main/resources/db/migration/V2__add_folders_and_note_ownership.sql` | 신규 / 5 | folders 테이블, 자기 부모 금지 CHECK, 부모 FK, 부모별/root별 정렬 unique 인덱스 추가. notes에는 folder_id를 처음에는 nullable로 추가하고 sort_order/version 추가. 기존 원고가 있을 때만 기본 폴더 생성 후 전체 원고 연결. created_at/id 기준 row_number로 기존 순서 초기화. 마지막에 notes 폴더 FK·NOT NULL·정렬 CHECK/unique 적용. 기존 5개 원고 필드와 V1은 유지. |

### Folder 모델·DTO

| 파일 | 구분 / 최초 단계 | 변경 내용과 이유 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/folder/entity/Folder.java` | 신규 / 5 | UUID 수동 ID, nullable LAZY parent, name(200), sortOrder, @Version Long, 생성/수정 Instant. 이름 변경과 이동 메서드 추가. 양방향 자식 컬렉션과 삭제 cascade는 추가하지 않음. |
| `backend/src/main/java/com/seamnote/backend/folder/dto/CreateFolderRequest.java` | 신규 / 5 | 선택 id/parentId, @NotBlank·@Size(200) name. 서버/클라이언트 ID와 최상위/하위 생성 수용. |
| `backend/src/main/java/com/seamnote/backend/folder/dto/UpdateFolderRequest.java` | 신규 / 5 | 필수 name과 200자 검증. 이름 변경과 이동 계약 분리. |
| `backend/src/main/java/com/seamnote/backend/folder/dto/MoveFolderRequest.java` | 신규 / 5 | targetParentId 값 외에 setter 호출 여부 저장. @AssertTrue로 필드 누락은 거부하고 명시적 null은 root 이동으로 구분. |
| `backend/src/main/java/com/seamnote/backend/folder/dto/FolderResponse.java` | 신규 / 5 | id/parentId/name/sortOrder/version/createdAt/updatedAt 응답. 엔티티 직접 반환 방지. |

### Folder 조회·동시성·API

| 파일 | 구분 / 최초 단계 | 변경 내용과 이유 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/folder/repository/FolderRepository.java` | 신규 / 5 | JpaRepository, 직접 자식/root 정렬 조회, 하위 폴더 존재 검사, 부모별 maxOrder 조회. 재귀 전체 트리 조회 없이 필요한 범위만 처리. |
| `backend/src/main/java/com/seamnote/backend/folder/service/FolderStructureLock.java` | 신규 / 5 | MANDATORY 트랜잭션에서 공통 PostgreSQL advisory transaction lock 획득. 여러 요청의 구조 변경을 DB 단위로 직렬화. |
| `backend/src/main/java/com/seamnote/backend/folder/service/FolderService.java` | 신규 / 5, 보강 10·12 | 폴더 조회 경계, root/직접 자식 조회, 중복 ID 검사, 명시적 persist/flush 생성, 이름 변경, 조상 경로 반복 검사로 순환 방지, 부모 변경 시 끝 순서 배정, 같은 부모 이동 no-op, 비어 있을 때만 삭제. 쓰기 전 공통 잠금. 최초 trim을 strip으로 보강. DTO 변환은 트랜잭션 안에서 수행. |
| `backend/src/main/java/com/seamnote/backend/folder/controller/FolderController.java` | 신규 / 5 | /api/folders CRUD·children·notes·move API. parentId 생략/root와 UUID 구분. 생성 201/Location, 삭제 204, 조회/변경 200. |

### 기존 Note 모델·요청/응답 변경

| 파일 | 구분 / 최초 단계 | 변경 전 → 변경 후와 이유 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/note/entity/Note.java` | 수정 / 5 | @GeneratedValue UUID → 생성자에 명시적 UUID 전달. 필수 LAZY Folder, sortOrder, @Version 추가. 기존 title/content/Instant 유지. move 메서드 추가. 클라이언트 ID와 폴더 소속 지원. |
| `backend/src/main/java/com/seamnote/backend/note/dto/CreateNoteRequest.java` | 수정 / 5, 정리 11·12 | title @NotBlank → @NotNull + @Size(200). content @NotNull 유지. 선택 UUID id와 필수 folderId 추가. 빈 원고 허용과 null 구분. 후속으로 빈 줄 공백 정리. |
| `backend/src/main/java/com/seamnote/backend/note/dto/UpdateNoteRequest.java` | 수정 / 5 | title @NotBlank → @NotNull + @Size(200), content @NotNull 유지. title/content 모두 필수인 내용 교체 의미를 유지하면서 빈 문자열 허용. |
| `backend/src/main/java/com/seamnote/backend/note/dto/MoveNoteRequest.java` | 신규 / 5 | @NotNull UUID targetFolderId. 잦은 내용 저장과 폴더 이동 계약 분리. |
| `backend/src/main/java/com/seamnote/backend/note/dto/NoteResponse.java` | 수정 / 5 | 기존 id/title/content/createdAt/updatedAt에 folderId/sortOrder/version 추가. 기존 상세·전체 목록의 본문 필드는 유지. |
| `backend/src/main/java/com/seamnote/backend/note/dto/NoteSummaryResponse.java` | 신규 / 5 | id/folderId/title/updatedAt/sortOrder/version만 포함하는 클래스 DTO. 폴더별 목록에서 긴 본문 제외. |

### 기존 Note 저장소·서비스·컨트롤러 변경

| 파일 | 구분 / 최초 단계 | 변경 전 → 변경 후와 이유 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/note/repository/NoteRepository.java` | 수정 / 5 | 기본 JpaRepository에 폴더별 존재 검사, maxOrder, 요약 DTO 생성자 projection 쿼리 추가. 목록 SQL에서도 content를 선택하지 않음. |
| `backend/src/main/java/com/seamnote/backend/note/service/NoteService.java` | 수정 / 5 | save() 신규 생성 → UUID 중복·폴더 검증 후 persist/flush. 구조 변경에 공통 잠금 사용. 이동·폴더별 요약 조회 추가. 서비스 반환을 엔티티에서 DTO로 바꿔 변환을 트랜잭션 안으로 이동. 내용 수정 dirty checking과 물리 삭제 유지. |
| `backend/src/main/java/com/seamnote/backend/note/controller/NoteController.java` | 수정 / 5 | 컨트롤러의 엔티티→DTO 변환 제거 후 서비스 DTO 반환. 기존 GET/POST/PUT/DELETE 경로 유지, PATCH 내용 수정과 PATCH /{id}/move 추가. title/content 교체 의미를 PUT/PATCH에 동일 적용. 생성 Location 및 삭제 204 유지. |

### 공통 예외 처리

| 파일 | 구분 / 최초 단계 | 변경 전 → 변경 후와 이유 |
| --- | --- | --- |
| `backend/src/main/java/com/seamnote/backend/common/exception/ErrorCode.java` | 수정 / 5 | 기존 코드 유지. FOLDER_NOT_FOUND(404), FOLDER_NOT_EMPTY/FOLDER_CYCLE_DETECTED/DUPLICATE_ENTITY_ID/VERSION_CONFLICT/DATA_CONFLICT(409) 추가. |
| `backend/src/main/java/com/seamnote/backend/common/exception/GlobalExceptionHandler.java` | 수정 / 5, 보강 10 | BusinessException/DTO 검증 처리에 JSON 형식(400), UUID 타입·IllegalArgumentException(400), optimistic locking(409), 무결성 충돌(409) 처리 추가. 10단계에서 JPA/Hibernate 직접 예외 유형도 보강. 기존 code/message/errors 형식 유지, 불필요 변수/import/잔여 주석 정리. |

### 테스트와 테스트 환경

| 파일 | 구분 / 최초 단계 | 변경 내용과 이유 |
| --- | --- | --- |
| `backend/src/test/resources/application-test.yml` | 신규 / 8 | 명시적 TEST_DB_URL, 테스트 사용자/비밀번호 환경변수, devtools restart 비활성화. 테스트가 기본 개발 DB URL을 사용하지 않도록 분리. |
| `backend/src/test/java/com/seamnote/backend/BackendApplicationTests.java` | 수정 / 8 | 기존 contextLoads 유지, @ActiveProfiles("test") 적용. |
| `backend/src/test/java/com/seamnote/backend/FolderMigrationTests.java` | 신규 / 8 | 빈 V1/기존 데이터 V1 각각 실제 Flyway V2 전환. 기존 원고 3개의 UUID·빈/한글 제목·긴 본문·줄바꿈·마이크로초 시각 보존 비교. 유효 폴더 연결, version/order 초기화, FK/NOT NULL/정렬 unique 제약, 재실행 no-op 확인. |
| `backend/src/test/java/com/seamnote/backend/FolderNoteApiTests.java` | 신규 / 8, 보강 10·11 | 실제 HTTP API로 Folder/Note CRUD, 빈 원고, 제목 길이, 이름 공백, 입력 누락/null, UUID/JSON 오류, Location/응답 DTO, 중복 ID 보존, 직접 자식·요약·정렬, 이동/삭제 제약 검증. 동시 폴더 상호 이동과 원고 8개 생성 검증. 후속으로 강제 버전 충돌과 필드별 입력 경계 보강. 최종 7개 테스트 메서드. |

### 문서

| 파일 | 구분 / 최초 단계 | 변경 내용과 이유 |
| --- | --- | --- |
| `docs/design/folder-api.md` | 신규 / 4, 갱신 11·12·14 | 분석·ERD·선택 근거에서 시작해 API 계약, 오류 표, DB 적용 주의사항, 실행 방법, 검증 결과·한계, 전체 변경 파일 목록으로 확장. 이번 후속 작업에서 상세 이력 링크 추가. |
| `docs/troubleshooting/2026-10-25-backend-folder-contract.md` | 신규 / 4, 갱신 12·14 | 문제 발견 당시 근거를 먼저 기록하고 구현·검증·환경 오류 해결·남은 위험으로 갱신. 이번 후속 작업에서 상세 이력 링크 추가. |
| `docs/troubleshooting/README.md` | 수정 / 4·12 | 기존 항목을 보존하고 신규 문제 링크 추가, 검증 뒤 해결 상태 반영. |
| `docs/worklogs/2026-10-25-backend-folder-api.md` | 신규 / 14 | 현재 문서. 수행 순서, 모든 변경 파일의 내용·이유·후속 수정, 실행 오류와 해결, 검증 근거 및 미수행 항목 기록. |

## 3. 검증 근거와 생성 산출물

최종 백엔드 테스트 결과 파일:

| 파일 | tests / failures / errors / skipped |
| --- | --- |
| `backend/build/test-results/test/TEST-com.seamnote.backend.BackendApplicationTests.xml` | 1 / 0 / 0 / 0 |
| `backend/build/test-results/test/TEST-com.seamnote.backend.FolderMigrationTests.xml` | 2 / 0 / 0 / 0 |
| `backend/build/test-results/test/TEST-com.seamnote.backend.FolderNoteApiTests.xml` | 7 / 0 / 0 / 0 |

실행 jar는 `backend/build/libs/backend-0.0.1-SNAPSHOT.jar`에 생성됐다. 프론트엔드 빌드는 `frontend/dist/`를 생성했다. 빌드·테스트 산출물은 소스 변경 목록과 구분하며, 재실행 시 덮어써질 수 있다. 생성 보조 스크립트는 `/private/tmp/seam_backend_generate.py`에 작성했고 저장소에 추가하지 않았다.

이번 후속 문서 변경은 실제 파일 존재, 설계 문서의 변경 목록과 이 문서의 파일 목록 일치, 문서 간 링크 대상, `git diff --check`로 확인한다.

## 4. 변경하지 않았거나 실행하지 않은 범위

- `AGENTS.md`, 기존 프론트엔드 트러블슈팅 문서, 문제 기록 양식은 변경하지 않았다.
- V1, application.yml, build.gradle, Gradle wrapper, docker-compose.yml, 의존성/lockfile은 변경하지 않았다.
- 프론트엔드 소스·디자인은 변경하지 않았다. 새 원고 버튼의 서버 연결도 구현하지 않았다.
- 공유 DB의 데이터 조회·마이그레이션·초기화·백업·복구 리허설은 실행하지 않았다. 검증에 사용한 원고는 일회용 DB의 합성 테스트 데이터다.
- IndexedDB/Outbox/operationId 멱등 처리/expectedVersion 기반 오래된 요청 차단/Tombstone/수동 정렬 API/계정 권한은 구현하지 않았다.
- 실제 운영 데이터 규모의 성능 수치와 다중 서버 부하는 측정하지 않았다.
- Git commit, push, PR 생성, 배포는 수행하지 않았다.
