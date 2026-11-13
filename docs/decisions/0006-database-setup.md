# 0006. 데이터베이스 실행 방법과 Prisma 설정

- 날짜: 2026-11-13
- 상태: 채택 (DB 위치는 임시 — 클라우드 전환 예정)

## 배경

0001에서 "로컬 DB 실행 방법은 M0에서 결정"으로 남겨두었다. Docker는 설치되어 있지 않다.

## 결정

### DB 위치: 지금은 PC마다 로컬 PostgreSQL (Homebrew)

- `brew install postgresql@18` + `brew services start postgresql@18`
- 앱 전용 사용자 `platform_3pl` (마이그레이션 검사용 임시 DB 생성을 위해 `CREATEDB` 권한)
- DB 2개: `platform_3pl_dev`(개발), `platform_3pl_test`(테스트)
- 여러 PC 작업: 코드는 Git, DB 구조는 마이그레이션, 개발 데이터는 시드 스크립트(M1)로 재현한다. PC마다 직접 입력한 데이터는 공유되지 않는다.

검토한 대안:

| 대안 | 결과 |
|---|---|
| Supabase | 무료 요금제 프로젝트 2개를 이미 사용 중이라 보류 |
| Neon | 브랜치 기능으로 개발/테스트 DB 분리가 쉬움 → **클라우드 전환 시 1순위 후보** |
| Postgres.app | 수동 설치 필요, Homebrew와 기능 차이 없음 |

### 연결 주소를 두 개로 분리

| 변수 | 사용처 | 클라우드 전환 시 |
|---|---|---|
| `DATABASE_URL` | 앱 실행 (`src/lib/prisma.ts`) | 풀러(pooler) 주소 |
| `DIRECT_URL` | Prisma 명령어 (`prisma.config.ts`, 마이그레이션) | 직접 주소 |

로컬에서는 두 값이 같다. 마이그레이션은 연결을 오래 붙잡고 작업하므로 풀러를 거치면 실패한다 (Prisma 공식 문서 권장 구성). **클라우드로 옮길 때는 `.env`만 바꾸면 된다.**

### Prisma 7.10.1 고정

- 2026-11 기준 npm `latest` 태그가 `8.0.0-rc`(출시 후보)를 가리킨다. 정식 버전인 7.10.1을 정확한 버전으로 고정한다.
- 연결은 `@prisma/adapter-pg` 드라이버 어댑터, 생성 코드는 `src/generated/prisma` (Git 제외, `postinstall`에서 생성).

## 참고

- `prisma init`이 AI 스킬 폴더(`.claude/skills` 등)와 `prisma7.config.ts`를 함께 만들었다. 요청한 범위가 아니어서 스킬은 삭제하고 설정 파일은 표준 이름 `prisma.config.ts`로 바꿨다.
