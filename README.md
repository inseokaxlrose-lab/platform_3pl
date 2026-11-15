# 3PL 관리 플랫폼

3PL 운영사·화주사를 위한 입고·재고 관리 B2B 웹 솔루션. 여러 운영사가 함께 쓰는 플랫폼 구조이고, 운영사끼리는 데이터가 분리된다.

- 제품 설명: `docs/PRD.md`
- 진행 상황: `docs/ROADMAP.md`
- 작업 규칙: `CLAUDE.md`

## 처음 준비 (PC마다 한 번)

```bash
# 1. PostgreSQL 설치 및 실행 (컴퓨터를 켤 때 자동 실행)
brew install postgresql@18
brew services start postgresql@18

# 2. 앱 전용 사용자와 DB 만들기 (개발용 + 테스트용)
/opt/homebrew/opt/postgresql@18/bin/psql -h localhost -d postgres \
  -c "CREATE ROLE platform_3pl WITH LOGIN PASSWORD 'platform_3pl' CREATEDB;" \
  -c "CREATE DATABASE platform_3pl_dev OWNER platform_3pl;" \
  -c "CREATE DATABASE platform_3pl_test OWNER platform_3pl;"

# 3. 환경변수 파일 만들기 (DB 주소는 로컬 기본값이 채워져 있음)
cp .env.example .env
#    .env의 BETTER_AUTH_SECRET에 아래 명령의 결과를 넣는다 (로그인 정보 암호화 열쇠)
openssl rand -base64 32

# 4. 패키지 설치 (Prisma 코드도 자동 생성) + 개발 DB에 표 만들기 + 연결 확인
npm install
npx prisma migrate dev
npm run db:check

# 5. 개발용 운영사·계정 만들기 (.env의 SEED_ADMIN_PASSWORD, SEED_PLATFORM_PASSWORD, SEED_SAMPLE_PASSWORD를 먼저 채운다)
npm run db:seed
```

### 개발용 운영사와 계정

시드는 견본 운영사 2곳을 만든다: **예시물류(주)** `DEMO`, **나라물류(주)** `NARA` (운영사끼리 서로의 데이터가 보이지 않는 것을 확인하는 용도).

| 아이디 | 비밀번호(.env) | 역할 | 운영사 · 소속 | 로그인 후 |
|---|---|---|---|---|
| `admin` (`SEED_ADMIN_USERNAME`) | `SEED_ADMIN_PASSWORD` | 운영사 관리자 (슈퍼 관리자 그룹) | 예시물류 | `/admin`, 모든 메뉴 |
| `admin.nara` | `SEED_ADMIN_PASSWORD` (운영사 첫 관리자 공통 처음 비밀번호) | 운영사 관리자 | 나라물류 | `/admin` |
| `platform` (`SEED_PLATFORM_USERNAME`) | `SEED_PLATFORM_PASSWORD` | 플랫폼 관리자 | 운영사 없음 | `/platform`, 운영사 등록·편집·상태 변경·전환 |
| `ops.admin` | `SEED_SAMPLE_PASSWORD` | 운영사 관리자 (슈퍼 관리자 그룹) | 예시물류 | `/admin`, 모든 메뉴 |
| `center.manager` | `SEED_SAMPLE_PASSWORD` | 센터 운영자 | 예시물류 · 이천센터 | `/admin`, 시스템 메뉴 제외 |
| `center.worker` | `SEED_SAMPLE_PASSWORD` | 센터 작업자 | 예시물류 · 이천센터 | `/admin`, 검수·라벨·확정·적치·재고 조회·실사 등록 |
| `shipper.user` | `SEED_SAMPLE_PASSWORD` | 화주사 사용자 | 예시물류 · 가나식품 | `/portal` |

- `SEED_PLATFORM_PASSWORD`·`SEED_SAMPLE_PASSWORD`가 비어 있으면 그 계정은 만들지 않는다. 운영 환경(`NODE_ENV=production`)에서는 견본 계정과 나라물류를 만들지 않는다.
- 운영사의 기본 공통코드·단위·권한그룹 정의는 `src/config/defaults/`(권한그룹은 `roles.ts`)에 있고, 시드를 실행할 때마다 견본 운영사의 기본 권한그룹 권한이 이 정의와 같아진다. 견본 계정 정의는 `prisma/seed-samples.ts`.
- 계정은 없을 때만 만들어서, 화면에서 바꾼 비밀번호·소속은 그대로 남는다. 비밀번호를 바꾸려면 화면(사용자 관리)에서 바꾼다.
- 플랫폼 관리자로 확인할 때는 지금 브라우저의 로그인이 바뀌지 않도록 **시크릿 창**을 쓰면 편하다.

DB 구조가 바뀐 코드를 받았을 때(`git pull` 후)는 `npx prisma migrate dev`를 다시 실행한다. 테스트 DB는 `npm run test` 때 자동으로 맞춰진다.

## 실행

```bash
npm install     # 패키지 설치
npm run dev     # 개발 서버 (http://localhost:3000)
npm run build   # 배포용 빌드
npm run lint    # 코드 규칙 검사
npm run format  # 코드 모양 자동 정리
npm run db:check   # DB 연결 확인
npm run test       # 전체 테스트 한 번 실행 (DB 테스트는 platform_3pl_test 사용)
npm run test:watch # 파일을 고칠 때마다 테스트 자동 실행
npm run db:studio  # DB 내용을 브라우저에서 보기
npm run db:seed    # 개발용 견본 운영사 2곳·계정·기본값 (여러 번 실행해도 안전, 새 메뉴 권한도 반영)
```

## 문제 해결

- **CSS(색상 등)를 고쳤는데 화면에 반영되지 않을 때**: 개발 서버가 이전 빌드 결과(`.next` 폴더)를 재사용하는 경우가 있다. 개발 서버를 끄고 `rm -rf .next` 후 `npm run dev`로 다시 시작한다.
- **개발 중 "Hydration failed" 오류에 `open-incognito-widget` 같은 낯선 요소가 보일 때**: 브라우저 확장 프로그램이 페이지에 요소를 끼워 넣은 것이다. 확장 프로그램을 끈 창(시크릿 모드 등)에서 확인한다. 예전에는 이때 "Encountered a script tag" 경고도 함께 났는데, 다크 모드 스크립트 처리(`src/components/theme-provider.tsx`)로 없앴다.
- **DB 구조를 바꾼 뒤(`prisma migrate dev`) 개발 서버에서 "Unknown field" 같은 Prisma 오류가 날 때**: 실행 중인 개발 서버가 이전 Prisma 코드를 쓰고 있는 것이다. 개발 서버를 끄고 `rm -rf .next` 후 다시 시작한다.
