# 3PL 관리 플랫폼

3PL 운영사·화주사를 위한 입고·재고 관리 B2B 웹 솔루션.

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

# 5. 개발용 슈퍼 계정 만들기 (.env의 SEED_ADMIN_PASSWORD를 먼저 채운다)
npm run db:seed
```

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
npm run db:seed    # 개발용 슈퍼 계정·권한그룹 (여러 번 실행해도 안전, 새 메뉴 권한도 반영)
```

## 문제 해결

- **CSS(색상 등)를 고쳤는데 화면에 반영되지 않을 때**: 개발 서버가 이전 빌드 결과(`.next` 폴더)를 재사용하는 경우가 있다. 개발 서버를 끄고 `rm -rf .next` 후 `npm run dev`로 다시 시작한다.
- **개발 중 "Hydration failed" 오류에 `open-incognito-widget` 같은 낯선 요소가 보일 때**: 브라우저 확장 프로그램이 페이지에 요소를 끼워 넣은 것이다. 확장 프로그램을 끈 창(시크릿 모드 등)에서 확인한다.
- **DB 구조를 바꾼 뒤(`prisma migrate dev`) 개발 서버에서 "Unknown field" 같은 Prisma 오류가 날 때**: 실행 중인 개발 서버가 이전 Prisma 코드를 쓰고 있는 것이다. 개발 서버를 끄고 `rm -rf .next` 후 다시 시작한다.
