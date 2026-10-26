# 폴더 생성·빈 원고 생성·원고 삭제 UI

> 원고 편집 후속 단계: 현재 제목·본문은 React Draft로 편집하고 IndexedDB에 로컬 저장한다. [로컬 저장 계약](local-draft-storage.md)을 참고한다. 아래 읽기 전용 설명은 이 문서 작성 단계의 동작이다. 현재 상태·재조회·이탈 규칙은 [React 원고 Draft](note-drafts.md)를 따른다.

2026-10-25 사용자 피드백에 따라 기존 `+` 드롭다운과 선택 위치 기준 생성을 복원했다. 이전의 별도 추가 버튼·생성 위치/이름 Dialog 설계는 폐기했다. 변경 순서와 과거 구현은 [작업 이력](../worklogs/2026-10-25-create-delete-ui.md)에 남긴다.

## 현재 생성 동작

- 사이드바 `+` → `새 폴더` / `새 문서` 메뉴다. 원래 details/summary 스타일, 외부 포커스 이동 시 닫기, Escape 닫기 동작을 복원했다.
- 트리에서 선택한 Folder가 있으면 그 **안에** 생성한다. Note를 선택하면 그 Note와 **같은 Folder**에 생성한다. 유효한 트리 선택이 없으면 에디터의 활성 Note 부모를 사용한다. 이전 folderModel.getCreationParent와 같은 규칙이다.
- 트리의 선택(폴더/문서)과 에디터의 활성 Note는 구분한다. Folder 선택 후 Note를 선택하면 예전 Folder를 생성 대상으로 계속 사용하지 않는다. Folder/Note의 같은 UUID도 kind로 구분한다.
- 부모가 없으면 Folder는 최상위에 만든다. Note는 서버 계약상 Folder가 필수여서 폴더 생성/선택 안내를 표시하고 POST하지 않는다. 임의의 Folder를 고르지 않는다.
- Folder는 `새 폴더` 이름으로 실제 POST한 뒤 서버 성공 시 트리 안에 이름 입력을 표시한다. Enter 또는 blur로 비공백·최대 200자를 검사하고 기존 PATCH로 저장한다. Escape는 이름 입력을 닫고 서버에 이미 생성된 `새 폴더`는 유지한다. 같은 이름이면 PATCH를 생략한다. 이름 저장 실패 시 서버 이름을 바꾸지 않고 입력/오류를 유지해 Enter로 수동 재시도할 수 있다.
- 빈 Note는 UUID, folderId, title="", content=""로 POST한다. 서버 성공 후 자동 선택하고 상세 응답을 캐시에 넣는다. 에디터 제목·본문은 계속 readOnly다.
- 성공한 Folder를 다음 생성 대상으로 선택하고 조상을 펼친다. Note 생성 후 다음 생성은 그 Note의 부모다. 새 항목이 보이도록 검색을 해제한다.
- 모바일 Folder 생성은 Drawer 안에서 이름을 입력하며, Note 생성 성공은 Drawer를 닫고 에디터로 돌아간다. 생성 실패 안내는 열린 모바일 Drawer 안에도 표시한다.

## 실제 API 계약

FolderController/NoteController 및 DTO를 확인했으며 백엔드 소스·엔티티·마이그레이션은 이번 복원에서 변경하지 않았다.

| 함수 | 요청 | 응답 |
| --- | --- | --- |
| createFolder | POST /api/folders, `{id,parentId,name:"새 폴더"}` | 201 Folder |
| renameFolder | PATCH /api/folders/{id}, `{name}` | 200 Folder |
| createNote | POST /api/notes, `{id,folderId,title:"",content:""}` | 201 Note |
| deleteNote | DELETE /api/notes/{id}, body 없음 | 204, body 없음 |

UUID는 crypto.randomUUID()다. parentId=null은 최상위다. 폴더 이름 입력의 실제 저장에 필요한 기존 PATCH만 연결했다. Note 내용 수정/자동 저장/이동/폴더 삭제는 추가하지 않았다. 공통 Axios 계층은 ApiError의 status/code/message/errors/responseBody를 보존하며 DELETE 204를 JSON으로 파싱하지 않는다.

## Mutation과 캐시

모든 쓰기는 useMutation, retry:false, networkMode:always와 동기 ref guard를 사용한다. 자동 재시도나 오프라인 쓰기 대기는 없다. 서버 성공 전에 가짜 항목/선택을 만들지 않는다.

| 작업 | 성공 이후 |
| --- | --- |
| Folder 생성 | 확정 tree upsert, Folder 상세 seed, 생성 Folder 선택·펼침, tree와 부모 자식/root 목록 invalidate |
| 생성 Folder 이름 입력 | 확정 tree Folder 교체, 상세 seed, tree와 부모 목록 invalidate |
| Note 생성 | 요약만 tree upsert, 실제 Note 상세 seed, 자동 선택, tree와 해당 Folder Note 목록 invalidate |
| Note 삭제 | tree/상세 GET 취소, tree 제거, 다음/이전 Note 선택, 상세 exact remove, tree와 Note 목록 invalidate |

Infinity metadata도 invalidateQueries로 다시 조회한다. 성공 후 GET 실패는 쓰기 실패로 바꾸지 않으며 확정 캐시를 유지하고 목록 갱신 오류를 표시한다. 늦은 이전 GET은 취소해 확정 결과를 되돌리지 못하게 한다.

## 삭제 확인과 실패 처리

삭제는 기존 Dialog를 유지한다. 대상 제목, 서버 물리 삭제·복구 불가, 취소/영구 삭제 버튼을 표시하고 최초 포커스는 취소다. 취소는 요청하지 않는다. 중복 submit을 막고 실패는 기존 목록·선택·상세를 유지한다. 성공 시 정렬된 전체 트리의 다음 Note, 없으면 이전 Note를 선택하고 조상을 펼친다. 마지막 Note를 삭제하면 빈 에디터다.

생성 실패는 팝업 대신 화면의 오류 안내와 목록 새로고침/같은 요청 다시 시도 버튼을 제공한다. 같은 요청 재시도는 원래 UUID와 부모를 유지한다. 메뉴/FAB의 새로운 생성 동작은 새 UUID다. 서버 반영 후 응답만 유실되면 같은 UUID 재전송은 409 DUPLICATE_ENTITY_ID이며 원래 성공 응답 재생이 아니다. 자동 성공 처리하지 않는다. 먼저 목록을 확인해야 한다. 새로고침/종료 후 요청 ID는 복원되지 않는다. DELETE 응답 유실 뒤 목록 확인이 필요하며 재DELETE는 404일 수 있다.

Folder PATCH에는 expectedVersion 요청 계약이 없어 오래된 이름 저장을 사전에 검증하지 못한다. 이는 기존 백엔드 계약의 한계이며 이번에 변경하지 않았다. 이름 저장 응답 유실 시에도 실제 서버 이름은 바뀌었을 수 있다. Note 본문 readOnly/expectedVersion Mutation 제외는 유지한다.

## 검증

- pnpm build(tsc -b/Vite), pnpm lint 성공.
- pnpm test: 기존 45개 유지 + 생성 위치/이름 PATCH 테스트 2개 = **47개 통과**, 실패/스킵 0.
- mock Chrome 생성·삭제 회귀: 기존 `+` 메뉴, 활성 Note 옆/선택 Folder 내부 생성, 선택을 Note로 바꾼 뒤 위치 변경, 이름 inline 검증·실패·저장·Escape, 빈 공간 최상위 Folder/첫 Note, POST 실패/같은 UUID 재시도, 응답 유실/409, 자동 선택/readOnly, Infinity 갱신, 중복 클릭, 삭제 취소/실패/성공/마지막 Note, 모바일.
- 기존 조회 전용 Chrome 회귀도 통과했다. 모든 /api 요청을 intercept하며 실제 개발 DB 쓰기는 없다.
- 이번 복원은 frontend만 변경해 backend 테스트를 다시 실행하지 않았다. 이전 생성·삭제 단계의 격리 PostgreSQL 17 검증은 기존 15개/bootJar 성공이며 이번 결과와 구분한다.

```sh
cd frontend
pnpm build
pnpm lint
pnpm test
# 별도 검증용 서버: pnpm exec vite --host 127.0.0.1 --port 25173 --strictPort
# 저장소 root에서 기존 제공 Playwright 사용:
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceCreateDelete.cjs
SEAM_NOTE_PLAYWRIGHT_MODULE=/path/to/existing/playwright node frontend/tests/browser/workspaceReadonly.cjs
```

사용자 개발 서버는 http://localhost:5173/ 이며 [::1]에 바인딩되어 있다. 검증용 25173만 따로 실행/종료한다. 파일별 작업 이력은 [worklog](../worklogs/2026-10-25-create-delete-ui.md), 문제 근거·해결·한계는 [트러블슈팅](../troubleshooting/2026-10-25-create-delete-selection-cache.md)에 기록한다.
