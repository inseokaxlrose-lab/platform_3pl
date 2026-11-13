# 0007. 테스트 구성 (Vitest)

- 날짜: 2026-11-13
- 상태: 채택

## 결정

### 파일 이름으로 테스트 종류를 구분한다

| 종류 (project) | 파일 이름 | 환경 | 용도 |
|---|---|---|---|
| `unit` | `*.test.ts` | Node | 순수 로직 (단위 환산, 권한 계산 등) |
| `component` | `*.test.tsx` | jsdom | 화면 부품 (DataGrid 등) |
| `db` | `*.db.test.ts` | Node + 테스트 DB | DB를 쓰는 로직 (재고 변경 함수 등) |

- 테스트 파일은 대상 파일 옆에 둔다 (예: `src/lib/prisma.ts` ↔ `src/lib/prisma.db.test.ts`).
- 설정: `vitest.config.mts`의 `projects`. 특정 종류만 실행: `npx vitest run --project db`

### 테스트 DB 안전장치

- DB 테스트는 `.env`의 `TEST_DATABASE_URL`로 `DATABASE_URL`·`DIRECT_URL`을 바꿔 끼운다 (`vitest.db-setup.ts`).
- **DB 이름이 `_test`로 끝나지 않으면 테스트를 시작하지 않는다.** 데이터를 지우는 테스트가 개발·운영 DB를 건드리는 사고를 막는다.
- DB 테스트 파일은 동시에 실행하지 않는다 (`fileParallelism: false`).

### 버전·구성 메모

- Vitest 5.1 (Vite 8). 경로 별칭 `@/...`은 Vite 기본 기능 `resolve.tsconfigPaths`로 처리 → `vite-tsconfig-paths` 불필요.
- `@vitejs/plugin-react`는 선택 의존성이 Babel 8을 요구해 shadcn CLI(Babel 7)와 설치 충돌 → 제외. Vite 8 내장 변환기(Oxc)가 tsconfig의 `jsx: react-jsx` 설정으로 JSX를 처리하므로 테스트에는 불필요.
  - 검토: 5.2.0(Babel 7 사용)은 충돌 없이 설치 가능하지만, 이 플러그인의 주 기능(개발 서버 즉시 갱신)은 Next.js가 담당해 쓰지 않고, 이전 세대 버전에 묶이게 되므로 채택하지 않음.
- `@types/node`를 24로 상향 (실행 Node 버전 24와 일치, Vitest 요구사항).

## 나중에 할 일

- M1에서 모델이 생기면, DB 테스트 전에 테스트 DB에 마이그레이션을 적용하는 단계(`prisma migrate deploy`)를 추가한다.
- 브라우저 전체 흐름 테스트(Playwright)는 M7.
