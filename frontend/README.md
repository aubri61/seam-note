# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```


## 노트 URL 라우팅

BrowserRouter를 사용한다. `/`는 Workspace의 첫 Note로 replace하며, `/notes/:noteId`는 해당 UUID의 원고를 연다. 없는 Note/잘못된 UUID는 다른 Note로 이동시키지 않는다. Draft는 라우트 공통 부모에서 편집하고 IndexedDB에 로컬 저장한다. 내부 Back/Forward에 유지되며 마지막 로컬 commit은 같은 브라우저·origin에서 새로고침 후 복원한다. 저장 완료 전 종료한 최신 입력은 복원되지 않을 수 있다.

Vite 개발 서버의 기존 API proxy를 유지했다. 운영 배포는 `/notes/...` document 요청을 **URL 변경 없이 index.html로 fallback**해야 한다. `/api/*`와 없는 JS/CSS를 SPA HTML로 바꾸면 안 된다. 이 저장소에 운영 웹서버 설정은 없어 실제 배포 변경은 하지 않았다. [상세 라우팅·배포 계약](../docs/design/note-routing.md)을 참고한다.


## 로컬 원고 저장

Dexie 4.4.7의 seam-note-local DB/schema v4를 사용한다(v1/v2/v3 선언 보존). 입력 후 약 400ms, 지속 입력 중 최대 약 2초마다 로컬 저장을 시도하며 노트 전환 시 flush를 요청한다. 로컬 commit과 서버 dirty는 별개다. 멀티탭 저장 기준이 다르면 현재 입력과 기존 DB를 보존하고 저장을 중단한다.

로컬 저장은 서버 동기화/백업이 아니며 브라우저 저장소 삭제·회수로 사라질 수 있다. 저장 실패/충돌 중 입력은 메모리에 남으므로 안내에 따라 텍스트를 보관해야 한다. Draft와 Outbox를 함께 기록하며, 서버 PUT은 현재 열린 정상 원고에서 사용자가 명시적으로 저장 버튼을 누를 때만 수행한다. 자동 전송·PWA는 없다. [스키마·복구·경쟁·확장 계약](../docs/design/local-draft-storage.md)을 참고한다.

## Outbox 기록 기반

Dexie v2는 v1 Draft를 보존하고 기존 dirty 원고를 pending 작업으로 백필한다. 이후 Draft CAS 저장과 Outbox 기록은 같은 transaction이다. 미전송 작업은 새 operationId로 병합하며, inFlight/conflict는 변경하지 않는다. 서버 자동 전송·재시도 엔진은 없고, 일반 원고의 명시적 수동 저장과 ack를 제공한다. 화면의 로컬 저장 표시는 서버 동기화 완료를 뜻하지 않는다. [전체 계약과 후속 엔진 경계](../docs/design/outbox-idempotency.md)를 참고한다.


## 수동 서버 저장

기존 `pnpm dev`의 localhost5173에서 원고를 열고 상단 로컬 저장 상태 옆 `서버에 저장`을 누른다. 개발·프로덕션 공통이며 실험 env/UUID/별도DB 설정은 필요 없다. `/api` 및 기존 Vite proxy를 그대로 쓴다.

미동기화 변경이 없으면 비활성화한다. 저장 중에는 최신 로컬 commit을 확인하며, 성공/실패와 남은 Outbox를 표시한다. 응답 유실은 같은 키로 명시적 재시도하고, conflict/복구 실패/확인된404는 전송을 차단해 원고를 보존한다. 자동 전송은 없다. [제품 저장 계약](../docs/design/manual-server-save.md)을 참고한다.

학습·회귀 실험에는 선택적으로 저장소 루트의 `python3 scripts/manual-sync-lab.py --serve`를 사용할 수 있다. 이는 신규 fixture를 만드는 별도 도구이며 일반 저장 기능의 요구사항이 아니다. [전체 저장 흐름·DevTools 실습](../docs/learning/2026-10-26-note-storage-flow.md)은 최초 통합 당시의 실증 기록이다.


## PWA 오프라인 실행

production 빌드는 앱 셸을 precache하고 Dexie v3에 마지막 성공 Workspace 목록을 저장한다. 로컬 commit된 본문이 있는 원고만 인터넷 없이 열고 편집할 수 있다. 미열람 원고는 목록만 제공하고 본문 이용 불가를 표시한다. 온라인 복귀 후 자동 PUT은 하지 않는다.

저장소 루트에서 `pnpm --dir frontend build`, `pnpm --dir frontend exec vite preview --host localhost --port 4173 --strictPort`로 실습한다. 온라인 첫 방문에서 앱 캐시와 각 원고의 로컬 저장을 준비해야 한다. Chrome 설치 메뉴를 사용할 수 있으며 development5173에는 SW를 등록하지 않는다. **5173과4173은 다른 origin이므로 미동기화 로컬 원고가 자동 이동하지 않는다.** 기존 개발 서버를 종료/교체하지 않았다.

업데이트는 모든 앱 창을 닫은 다음 실행할 때 적용한다. 열린 에디터를 강제 reload하지 않는다. [구조·지원 범위·재현·한계](../docs/design/pwa-offline.md)를 참고한다.


## 오프라인 폴더·노트 생성

기존 + 메뉴는 온라인에서도 먼저 로컬에 생성한다. 새 폴더는 사이드바에서 바로 이름을 입력해 Enter/포커스 이동으로 확정하고(Escape 취소), `새 최상위 폴더` 메뉴로 최상위 생성도 지원한다. 새 노트는 해당 폴더 아래 생성 후 즉시 편집한다. 로컬 표시가 있는 항목은 아직 서버에 없다. 인터넷 없이 닫고 다시 열어도 같은 origin/profile의 commit된 entity/Draft/생성 의도를 복원한다.

온라인 복귀 후 원고의 `서버에 저장`은 필요한 부모부터 POST하고, 생성 ACK 뒤 필요하면 기존 expectedVersion PUT을 수행한다. 폴더만 선택했을 때는 사이드바 `폴더 서버에 저장`을 사용한다. 자동 전송은 없다. local note 삭제/오프라인 이동·이름변경은 제공하지 않는다.

새 서버 POST 멱등성 계약에는 Flyway V4가 필요하다. backend를 새 코드로 실행해야 하며 구 서버의 응답 검증을 우회하지 않는다. [생성 데이터 흐름·실패 복구·재현](../docs/design/offline-creation.md), [실제 작업/검증](../docs/worklogs/2026-10-26-offline-creation.md)을 참고한다.
