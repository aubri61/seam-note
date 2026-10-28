# Tiptap 원고 저장 계약

## 브랜치와 범위

- `feat/tiptap-editor`, 시작 `bb1a039` (최신 main, PR #3 merge).
- Tiptap React/PM/StarterKit 3.32.0. 문단·bold/italic·bullet/ordered list·hardBreak·undo/redo만 제공한다. 이미지·링크·heading·코드블록·협업 확장은 등록하지 않는다.
- 기존 폴더/노트 생성 자동 반영은 유지한다. NOTE_UPDATE 자동 서버 동기화는 추가하지 않는다. 원고 수정은 기존 전체 동기화/Command·Ctrl+S로 전송한다. Command·Ctrl+B는 기존 사이드바 토글이 우선하며 굵게는 툴바를 사용한다.

## 한 가지 저장 표현

`Note.content: string`에 JSON 문서 전체를 직렬화한다. title은 기존 별도 string이다.

```json
{"title":"1화","content":"{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"한글 원고\",\"marks\":[{\"type\":\"bold\"}]}]}]}","expectedVersion":2}
```

빈 본문은 빈 문자열이 아니라 `{"type":"doc","content":[{"type":"paragraph"}]}`이다. HTML/plain text 동시 지원·자동 변환·백필은 없다.

선택 이유: Draft/Outbox의 기존 문자열 snapshot, 동일 payload fingerprint, token CAS, expectedVersion, 성공 응답 검증을 유지할 수 있다. PostgreSQL은 기존 TEXT이며 JSONB/형식 컬럼/Flyway 변경이 필요 없다. 서버는 문자열을 다시 직렬화하거나 고치지 않아 Idempotency-Key의 요청/응답 일치 계약을 보존한다.

클라이언트 `richTextDocument.ts`가 허용된 구조를 검사하고 순서가 안정적인 JSON을 만든다. 서버 `@TiptapDocument`가 POST/PUT/PATCH content를 검사하며 잘못된 입력은 기존 INVALID_REQUEST/400/errors.content로 반환한다. 허용 node는 doc/paragraph/text/hardBreak/bulletList/orderedList/listItem, mark는 bold/italic, orderedList attrs는 start/type이다. 문단/목록의 자식 구조, 비어 있는 text, 알 수 없는 속성·노드·mark, 최대 깊이64/노드100000도 검사한다. 제목200자 계약은 유지한다.

## IndexedDB와 기존 테스트 데이터

테이블·스키마 v1~v4는 변경하지 않는다. 새 표준의 DB 이름은 `seam-note-tiptap-v1`, BroadcastChannel은 `seam-note-tiptap-drafts-v1`이다. 기존 `seam-note-local`/이전 채널은 열거나 삭제하지 않는다. 별도 저장 공간으로 기존 plain text 미확정 Outbox를 분리해 전송하지 않는다. 조회한 서버 Workspace는 새 DB에 캐시한다.

기존 PostgreSQL/다른 프로젝트/브라우저 프로필/이전 실증 결과는 삭제하지 않았다. 개발 DB의 구형 plain text 원고가 목록에 보일 수 있지만 에디터는 형식 오류를 명시하고 본문 편집을 차단한다. 새 원고부터 JSON 형식으로 작성한다. 새 포맷은 구버전 클라이언트와 호환되지 않으므로 오래 열린 구버전 앱과 혼용하지 않는다. 배포 시 테스트 데이터 정리가 필요하면 대상 DB/원고 UUID 및 해당 Ledger를 별도 확인해 정리해야 한다. 이번에는 실제 개발 DB 초기화를 실행하지 않았다.

## 입력부터 ACK까지

1. RichTextEditor의 한 노트용 useEditor 인스턴스가 ProseMirror 트랜잭션을 적용한다.
2. onUpdate에서 getJSON → serializeDocument → onEdit(noteId,{content})를 호출한다. HTML/plain text를 별도 편집 상태에 저장하지 않는다.
3. DraftSession이 React snapshot/revision을 갱신하고 기존 debounce/직렬 write를 수행한다.
4. IndexedDB readwrite 트랜잭션이 token/revision CAS 후 Draft와 NOTE_UPDATE 또는 로컬 생성 상태/작업을 원자 기록한다. 이 로직은 변경하지 않았다.
5. 사용자가 전체 동기화를 실행하면 기존 flush fence 뒤 작업을 claim한다. sendNoteSnapshot/생성 send는 JSON 유효성을 확인한 뒤 원래 snapshot과 operationId를 보낸다. 내용을 정규화하거나 수정해서 재시도하지 않는다.
6. Spring 검증·expectedVersion·Ledger 트랜잭션이 Note를 저장한다. JPA가 version을 증가시키며 응답은 원래 content 문자열이다.
7. 기존 verifySyncResponse/creation 검증 → acceptServerAck → IndexedDB ACK·후속 작업 rebase를 수행한다. 전송 중 추가 입력은 현재 Draft에 유지된다.
8. 네트워크 유실은 기존 key/payload를 보존하고, 로컬 CAS/서버409는 원고를 보존한 채 기존 충돌 처리로 진입한다.

## React·포커스·IME·성능

- 에디터는 NoteEditor의 noteId key로 노트 전환 때 교체하며 입력마다 다시 만들지 않는다. Undo 기록이 다른 노트로 섞이지 않는다. Draft는 상위 AppLayout에 계속 남는다.
- 마지막으로 emit한 JSON과 같은 props는 setContent하지 않는다. 외부 snapshot 변경만 emitUpdate:false로 적용해 update 루프와 불필요한 selection 초기화를 막는다.
- composing 상태에서는 외부 setContent를 미루며 기존 DraftSession의 dirty/recovery 보호를 유지한다. 노트 전환 시 자동 focus는 하지 않고 기존 새 원고 제목 focus/모바일 drawer 정책을 유지한다.
- shouldRerenderOnTransaction:false, useEditorState로 toolbar의 작은 boolean 상태만 구독한다. JSON 직렬화는 onUpdate에서 수행하므로 문서 크기에 비례하는 비용은 남는다. Draft는 기존 React 상위 구독 구조를 사용한다. 별도 전역 상태 라이브러리는 추가하지 않는다.
- 에디터 lazy chunk와 기존 PWA precache를 사용한다. 실제 크기/긴 원고 측정은 verification/worklog에 기록하며 측정하지 않은 성능 개선률은 주장하지 않는다.

## 충돌 비교

DiffView는 원본 JSON에서 읽기 전용 비교 텍스트를 만든다. 문단/줄바꿈/목록을 표시하고 bold는 `**표기**`, italic은 `_표기_`로 나타낸다. 텍스트가 같아도 JSON이 다르면 서식/구조 변경 안내를 제공한다. worker의 줄 Diff·가상화와 제목 Diff를 유지한다.

사용자가 버전을 선택할 때는 비교용 텍스트를 저장하지 않고 원래 JSON 전체를 기존 chooseConflict 트랜잭션에 전달한다. 복구 사본도 원래 JSON이다. 다른 서식의 선택/재충돌/로컬 CAS/즉시 서버 저장 계약은 그대로다.

## 검증 실행

```sh
pnpm --dir frontend lint
pnpm --dir frontend build
pnpm --dir frontend test
python3 scripts/manual-sync-lab.py --serve --ui-port 25201 --api-port 18801 --db-port 25501
# 위 명령이 출력한 새 fixture 경로를 사용한다.
SEAM_NOTE_LAB_FIXTURE=/private/tmp/.../fixture.json \
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/playwright \
node frontend/tests/browser/tiptapLive.cjs
```

브라우저 하네스는 별도25203에 production build를 serve하고 격리 Spring에만 API를 전달한다. 고유 UUID와 임시 Chrome 프로필을 사용한다. 별도의 테스트 DB를 지정해 백엔드 Gradle test를 실행한다. 자세한 실제 결과와 미검증 한계는 작업 이력 및 verification JSON을 참조한다.

공식 API 확인 자료: [Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react), [setContent/emitUpdate](https://tiptap.dev/docs/editor/api/commands/content/set-content), [React performance](https://tiptap.dev/docs/guides/performance). 실제 설치된3.32.0 타입·소스와 함께 확인했다.

과거 plaintext/textarea 기반 단독 브라우저 하네스는 새 UI 저장 계약의 실행 경로가 아니다. 이번 전환의 브라우저 회귀 기준은 tiptapLive와 JSON fixture로 갱신한 inFlightCrashRecovery이며, 옛 실증 결과는 삭제/덮어쓰지 않았다.
