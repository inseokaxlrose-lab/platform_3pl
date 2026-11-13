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

# 3. 환경변수 파일 만들기 (로컬 기본값이 이미 채워져 있음)
cp .env.example .env

# 4. 패키지 설치 (Prisma 코드도 자동 생성) + DB 연결 확인
npm install
npm run db:check
```

## 실행

```bash
npm install     # 패키지 설치
npm run dev     # 개발 서버 (http://localhost:3000)
npm run build   # 배포용 빌드
npm run lint    # 코드 규칙 검사
npm run format  # 코드 모양 자동 정리
npm run db:check   # DB 연결 확인
npm run db:studio  # DB 내용을 브라우저에서 보기
```
