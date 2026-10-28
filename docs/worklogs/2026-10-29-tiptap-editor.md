# Tiptap 리치 텍스트 전환

## 브랜치·실제 변경 순서

1. AGENTS.md 및 Git 상태를 확인했다. main이 깨끗했고 origin/main을 fast-forward 확인 후 `bb1a039`에서 `feat/tiptap-editor`를 만들었다. 중간 사용자 중단 뒤 해당 브랜치와 package/lock 변경(직전 도구로 실행한 설치 결과)을 확인해 이어갔다. 사용자 미커밋 변경을 덮어쓰지 않았다.
2. NoteEditor/툴바, DraftSession/React Draft, Dexie v1~v4/CAS, 생성·수정 Outbox, SyncCoordinator/ACK/멱등성, PWA/Workspace 복구, Diff/선택, Java Note DTO/엔티티/TEXT 필드 및 테스트를 읽었다.
3. Tiptap React/PM/StarterKit3.32.0을 설치했다. 기존 `content:string`의 JSON 직렬화 계약을 선택해 PostgreSQL TEXT/기존 API envelope/Outbox snapshot 타입을 유지했다. 신규 Flyway·JPA 엔티티 변경은 없다.
4. richTextDocument.ts에 단일 JSON parser/validator/canonical serializer와 비교용 텍스트 projection을 추가했다. 빈 본문은 빈 doc paragraph다. 허용 node/mark/attrs 및 구조·깊이·노드 수를 제한했다.
5. RichTextEditor.tsx에 useEditor/useEditorState, 기존 Emotion/IconButton 툴바, 굵게/기울임/두 목록/Undo/Redo, 문단/Shift+Enter를 연결했다. onUpdate JSON만 Draft로 전달한다. noteId key로 노트 전환 시 인스턴스/undo를 격리하고 입력마다 재생성하지 않는다. 동일 echo는 무시하며 외부 setContent는 emitUpdate:false, IME composing 중에는 적용을 미룬다.
6. NoteEditor.tsx에서 textarea/비활성 툴바를 대체하고 오류 복사·다운로드의 읽기용 내용도 JSON 원문이 아닌 텍스트로 바꿨다. lazy import로 에디터 chunk를 분리했다.
7. useFolders.ts 새 원고 content를 EMPTY_DOCUMENT로 바꿨다. localDraftTypes.ts의 DB/채널 이름을 Tiptap 전용 namespace로 바꿔 구 plain text의 미확정 큐를 격리했다. 기존 schema1~4와 저장 트랜잭션 코드는 수정하지 않았다. 구 DB/사용자 저장소를 삭제하지 않았다.
8. manualSync.ts/creationSync.ts의 실제 전송 경계에서 JSON을 검사한다. 검사만 하고 frozen snapshot/operationId는 바꾸지 않는다. ACK/CAS/rebase 알고리즘은 그대로다.
9. DiffView.tsx에서 읽기용 문단·목록·서식 표기로 worker에 보내고 제목 Diff/가상화를 유지했다. 같은 비교문장이라도 JSON이 다르면 서식/구조 변경을 알린다. ConflictDialog의 버전 선택/복구 사본은 원래 JSON 전체를 유지한다.
10. AppLayout.tsx의 기존 Command/Ctrl+B sidebar listener를 capture에서 처리해 Tiptap bold 기본키와 중복 실행되지 않게 했다. 사용자 지정 사이드바 동작을 유지하며 bold는 툴바로 제공한다. 저장 단축키는 기존 Workspace run을 사용한다.
11. Java @TiptapDocument validator를 추가하고 Create/UpdateNoteRequest content에 적용했다. 구조가 잘못된 POST/PUT/PATCH는400 INVALID_REQUEST/content error로 거부한다. 서버에서 JSON을 재직렬화하지 않아 요청 fingerprint/성공 snapshot 일치가 유지된다.
12. 백엔드 기존 fixture4개 파일을 JSON 문서로 갱신하고 TiptapFixtures 및 실제 API의 JSON 거부/서식 echo 검증을 추가했다. expectedVersion 누락/null/음수 테스트에는 유효 content를 넣어 버전 검증이 계속 독립적으로 보장되게 했다.
13. manual-sync-lab.py의 합성 원고 seed도 JSON으로 바꿨다. 새 cluster/DB/UI25201/API18801/PG25501에서만 시험했다. 실제 개발 PG15439/API18765/일반 브라우저 프로필은 건드리지 않았다.
14. 단위 codec6개와 tiptapLive.cjs를 추가했다. 실제 production build를25203에 serve하고 격리 Spring/PostgreSQL/실제 SW/별도 영속 Chrome 프로필로13개 통합 묶음을 통과했다.
15. 기존 inFlightCrashRecovery의 plain text fixture만 bold/italic JSON으로 갱신해 동일 SIGKILL/ACK rollback 보호 시나리오4개(실제 SIGKILL5회)도 통과했다. B 부재는 인위적 fault injection으로 명시하고 자연 발생 버그로 주장하지 않는다.
16. 문서/기록을 갱신하고 기능 검증 완료 후 지정 메시지로 commit한다. push/main merge는 하지 않는다.

## 실제 검증 결과

- pnpm lint / build(TypeScript 포함) / test175개 통과(기존169 + codec6).
- backend Gradle test36개 통과. 새 `seam_note_manual_test` DB만 사용했다. 버전409/동시수정/같은키 동시재시도/응답유실/트랜잭션 rollback/Workspace 쿼리 수/기존 migration 회귀를 유지했다.
- Production Chrome13개 묶음 통과: 서식/목록/undo/redo/로컬복원/노트전환, 빈문단·hardBreak·한글·paste, 기존 노트 PUT/ACK, inFlight 추가입력/rebase, 응답유실+reload+동일키/payload, 서버409 양쪽선택/제목Diff/JSON미노출/서식보존/복구사본, 두 탭 local CAS Diff/선택, 오프라인 폴더·노트 생성/앱종료·동일프로필 재실행/리치복구·추가입력, 온라인 생성부모순서+전체ACK,GET503시로컬보존, 긴 한국어42500자 편집/동일Editor DOM/노트왕복.
- 기존 Command+S가 첫 JSON PUT/ACK를 실행하며 Command/Control+B가 사이드바만 토글하고 bold 서식은 바꾸지 않는 것을 통합 테스트에 포함했다.
- SW API cache0건, 실제 개발 DB 쓰기0건. 원시 요청은 synthetic UUID/key/expectedVersion/hash/status만 기록했다.
- 긴 원고1회 측정:42500자 bulk 입력→IndexedDB commit758ms, 마지막 추가 입력→commit469ms, 노트 왕복185ms. 실제 UI·직렬화·기존 debounce·IDB를 포함한다. p95나 성능개선률/프레임 지표로 해석하지 않는다.
- 초기 단일 앱 chunk904.48KB/minified에서 lazy 분리 후 앱410.71KB + RichTextEditor403.13KB. gzip각130.37/127.85KB. 전체 precache는 약2000.91KiB/27개로 Tiptap 추가 비용이 존재한다. 압축 전후 숫자는 초기 구현과 분할 구현의 빌드 결과이며 구버전 대비 성능개선률이 아니다.
- 실제 결과: docs/verification/2026-10-29-tiptap-live.json, 2026-10-29-tiptap-crash.json. 합성 화면은 2026-10-29-tiptap-editor.png에 보존했다.

## 발견·수정한 문제

- 최초 frontend 단위 실패는 Axios 테스트의 plain fixture와 snapshot assertion을 JSON으로 바꾸는 과정의 누락2건 및 새 createOperation test의 localRevision 누락이었다. fixture를 바로잡고 보호 assertion을 유지했다.
- backend Workspace POST fixture1곳의 plaintext 누락으로400 실패했다. JSON으로 갱신한 뒤36개 통과했다.
- production 하네스에서 모달이 배경을 aria-hidden 처리하자 getByRole로 배경 동기화 버튼을 찾지 못했다. 완료 상태만 CSS locator로 확인하고 실제 모달 접근성은 유지했다. local Diff는 비동기 준비를 기다린 뒤 검사하도록 보완했다.
- 응답을 단순 socket destroy한 첫 실험은 Chrome이 요청을 투명하게 다시 처리해 ACK까지 끝난 상태였다(테스트의 inFlight 기대 실패). 서버 응답을 보류하고 offline+reload로 클라이언트 미수신 경계를 확정한 뒤 동일키 수동 재시도를 검증했다. 데이터 유실 제품 버그로 주장하지 않는다.
- 실제 적용한 예방: 오래된 plain text 큐의 새 API 전송을 namespace 분리/전송 JSON 검증으로 방어, 에디터 echo setContent·IME 중 외부교체·노트간 undo 혼재·B키 중복방어. 과거 운영 사고가 있었다고 표현하지 않는다.

## 한계와 후속

native macOS 한글 IME 후보창 입력은 자동화하지 않았다. 실제 Chrome 한글 insertText 및 composition DOM event를 검증했으며 배포 전 실제 입력기로 추가 확인이 필요하다. Safari·전원차단/스토리지회수는 미검증이다. 성능 수치는1회 실증이며 큰 문서의 매입력 JSON 직렬화 O(n) 비용은 남는다.

구 plain text 테스트 원고/이전 origin의 앱/SW/IndexedDB는 자동 변환·초기화하지 않는다. 기존 DB 내용을 유지할 필요는 없지만 범위를 확인하지 않은 삭제를 수행하지 않았다. 새 원고부터 사용하고 구 원고는 형식 오류를 표시한다. 기존 로컬 큐는 새 namespace에서 읽지 않는다. 자동 NOTE_UPDATE 전송은 추가하지 않았다.

## 브라우저 하네스 범위

과거 textarea/plaintext API/구 IndexedDB namespace를 직접 가정하는 수동 브라우저 스크립트를 모두 재실행했다고 주장하지 않는다. 새 JSON/UI 계약의 tiptapLive13묶음이 리치 입력·복원·라우팅·생성·PWA·전체ACK·서버/로컬충돌을 검증하며, 기존 inFlightCrashRecovery4조건은 JSON fixture로 직접 갱신했다. Node test175개와 backend test36개는 전체를 실행했다. 과거 검증 결과 파일은 역사적 근거로 유지하며 새 결과로 덮어쓰지 않았다.
