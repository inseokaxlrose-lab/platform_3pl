# 0004. Next.js 프로젝트 생성 설정

- 날짜: 2026-11-13
- 상태: 채택

## 결정

`create-next-app@latest` (Next.js 16.4)로 아래 옵션을 사용해 생성했다.

| 옵션 | 값 | 이유 |
|---|---|---|
| 라우터 | App Router | 0001 결정 |
| `src/` 폴더 | 사용 | 코드와 설정 파일을 분리. `src/components/data-grid/` 경로 규칙과 맞춤 |
| Tailwind / ESLint | 생성 시 포함 | 공식 기본 경로. 세부 규칙(Prettier, shadcn/ui)은 이후 작업에서 설정 |
| import 별칭 | `@/*` | `@/components/...`처럼 짧게 import |
| Cache Components | 끔 | 초기에는 단순한 렌더링 모델로 시작. 캐싱이 필요해지면 다시 검토 |
| React Compiler | 끔 | 안정성 우선. 필요 시 나중에 켬 |
| AGENTS.md 생성 (`--no-agents-md`) | 끔 | 생성 도구가 기존 `CLAUDE.md`를 덮어쓰지 않도록 |

## 참고

- 기존 문서가 있는 폴더에는 바로 생성할 수 없어, 임시 폴더에 만든 뒤 복사했다.
- `next dev`는 AI 도구가 감지되면 `AGENTS.md`에 Next.js 안내 블록을 자동으로 추가한다 (`CLAUDE.md`는 건드리지 않음).
  내용이 유익해 그대로 커밋한다. 끄려면 `next.config.ts`에 `agentRules: false`를 설정한다.
