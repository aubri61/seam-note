# Seam Note UI scaffolding

문서·폴더 생성, 노트 선택, 제목·본문 입력, 검색, 트리 드래그 이동을 연결했습니다. 상태는 현재 세션의 React 메모리에만 존재하고 새로고침하면 초기화됩니다. API, IndexedDB, 자동 저장, 실제 동기화는 연결하지 않았습니다. 저장 상태 배지는 기존 UI 미리보기입니다. 현재 기능과 검증은 [FOLDERS_UI.md](FOLDERS_UI.md)를 참고하세요.

## 구조와 책임

```text
src/
  app/AppLayout.tsx                 # 단일 sidebarOpen, 반응형 정책, 폴더 탐색 상태
  app/AppHeader.tsx                 # 사이드바 토글, 경로, 저장 상태, 옵션 버튼
  app/sidebar/Sidebar.tsx             # 재사용 가능한 브랜드·워크스페이스·폴더 UI
  app/sidebar/DesktopSidebar.tsx      # 데스크톱 고정 사이드바와 너비 전환
  app/sidebar/SidebarDrawer.tsx       # Radix Dialog 모달, Portal, Overlay, Content
  hooks/useMediaQuery.ts            # useState + useEffect 기반 matchMedia 구독
  components/Icon.tsx               # SVG 아이콘
  components/primitives.ts          # 공통 버튼과 라벨
  features/
    folders/FolderTree.tsx          # React Arborist 트리, 검색, 선택, 이름 변경, 드래그
    folders/folderModel.ts          # 트리 구성, 현재 생성 위치, 안전한 이동
    folders/useFolders.ts           # 세션 내 문서·검색·선택·폴더 상태
    folders/FolderSection.tsx       # 이전 폴더 UI 보존 (현재 미사용)
    workspaces/WorkspacePicker.tsx # 실제 워크스페이스 선택 UI (전환 미연결)
    notes/NoteEditor.tsx            # 제목·본문 입력과 새 문서 버튼 (서식 도구는 미연결)
    notes/notes.ts                  # 더미 노트와 고정 선택 데이터
    notes/NoteList.tsx              # 이전 목록 컴포넌트 보존 (현재 미사용)
    sync/SyncStatus.tsx             # 저장 상태의 시각적 표시
  styles/
    theme.ts                       # 색상, 간격, 모서리, breakpoint, Motion Scale
    emotion.d.ts                   # Emotion Theme 타입
    GlobalStyles.tsx                # 리셋, 포커스, reduced-motion
```

`main.tsx`에서 ThemeProvider와 GlobalStyles를 적용합니다. 내부 import는 `@/` 별칭을 사용하며, Emotion은 `styled.div(({ theme }) => ({ ... }))` 객체 스타일을 사용합니다. 기존 Vite 샘플 CSS·이미지는 미사용 상태로 보존합니다.

## 사이드바 정책과 접근성

- 최초 접속 시 모든 너비에서 닫힌 상태로 시작합니다.
- `sidebarOpen` boolean 하나로 두 표현을 제어합니다. 사용자가 토글할 때만 엽니다.
- `theme.breakpoints.tablet`(현재 1100px) 초과는 고정형, 이하는 왼쪽 모달 Drawer입니다.
- 브레이크포인트를 어느 방향으로 넘어가든 닫습니다. 화면 확대 시 자동으로 펼치지 않습니다.
- 이전 모드 값은 전환 감지용이며 별도 열림 상태가 아닙니다. 새 표현을 렌더링하기 전에 닫아 일시적인 모달 표시를 막습니다.
- `useMediaQuery`는 matchMedia로 초기 상태를 정하고, useEffect에서 change 리스너를 등록·해제합니다. query 변경 시 현재 matches를 다시 동기화하며, window가 없는 SSR 초기값은 false입니다. query가 같으면 effect를 다시 실행하지 않습니다.
- 모바일 모달의 포커스 진입·Tab 순환·Escape·외부 클릭·배경 상호작용 차단은 Radix가 담당합니다.
- 외부 AppHeader 버튼은 Dialog.Trigger가 아니므로 `onCloseAutoFocus`에서 해당 ref로 포커스를 복원합니다. 별도의 포커스 트랩이나 Escape 리스너는 없습니다.
- 데스크톱의 닫힌 영역과 접힌 폴더는 Radix 모달 외부이므로 `inert`/`aria-hidden`을 유지합니다.
- 전환 시 기존 에디터 포커스는 유지하고, 제거된 사이드바 때문에 body로 빠졌을 때만 토글로 복원합니다.
- 문서·폴더·선택·검색·폴더 펼침 상태는 AppLayout에서 사용하는 useFolders에 두어 Drawer 재마운트와 화면 전환에도 보존합니다.
- 에디터는 모드 분기 바깥의 같은 위치에 유지하며 key를 변경하지 않습니다. 레이아웃 변경으로 에디터를 재마운트하지 않습니다.
- 워크스페이스 선택 팝업의 열림은 일시적 UI이므로 Sidebar가 다시 마운트되면 닫힌 상태입니다.

## Motion Scale

숫자 키는 밀리초가 아닌 디자인 단계입니다.

| 토큰 | 값 | 사용 |
| --- | --- | --- |
| duration[100] | 120ms | 버튼·워크스페이스 hover |
| duration[200] | 200ms | 폴더 화살표 (트리 목록 배치는 Arborist가 담당) |
| duration[300] | 320ms | 고정 사이드바 너비, Drawer와 Overlay |
| duration[400] | 480ms | 느린 전환이 필요할 때 재사용 가능 |

`easing.standard`, `enter`, `exit`를 재사용합니다. Drawer는 CSS keyframes와 Radix Presence를 사용해 닫힘 애니메이션 종료 후 DOM에서 제거됩니다. `transition: all`은 사용하지 않습니다. `prefers-reduced-motion: reduce`에서는 전환과 keyframes를 제거합니다.

## 실행 및 검증

`frontend` 디렉터리에서 `pnpm dev`, `pnpm build`, `pnpm lint`를 실행합니다. build는 `tsc -b && vite build`로 타입 검사도 수행합니다. 순수 트리 모델 테스트는 `pnpm test`로 실행하며 Node 기본 테스트 러너를 사용합니다. 실제 브라우저 회귀 검증 결과와 재검증 절차는 `REFACTOR_VALIDATION.md`에 기록합니다.

사용한 UI 의존성은 `@radix-ui/react-dialog`, `react-arborist`, `react-dnd`, `react-dnd-html5-backend`입니다. 기본 테마나 새 UI 디자인은 도입하지 않았으며, 백엔드와 API·Query·IndexedDB·자동 저장·동기화 로직은 수정하지 않았습니다.
