#!/bin/bash
# 브라우저 테스트(e2e) 준비 (docs/decisions/0065): e2e DB 만들기 → 마이그레이션 → 시드 → 테스트용 데이터
# DB 주소는 .env의 DATABASE_URL에서 DB 이름 뒤에 '_e2e'를 붙여 만든다 (주소는 출력하지 않는다)
# 사용: npm run e2e:prepare  (여러 번 실행해도 안전)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

E2E_URL=$(npx tsx -e "import('./e2e/e2e-env.ts').then((m) => console.log(m.e2eDatabaseUrl()))")
# psql용: 쿼리 문자열(?schema=…)을 뺀 주소와 관리용(postgres) 주소
PLAIN=$(python3 -c "import sys,urllib.parse as u;p=u.urlsplit(sys.argv[1]);print(u.urlunsplit(p._replace(query='')))" "$E2E_URL")
ADMIN=$(python3 -c "import sys,urllib.parse as u;p=u.urlsplit(sys.argv[1]);print(u.urlunsplit(p._replace(path='/postgres',query='')))" "$E2E_URL")
NAME=$(python3 -c "import sys,urllib.parse as u;print(u.urlsplit(sys.argv[1]).path.lstrip('/'))" "$E2E_URL")

if ! psql "$ADMIN" -Atc "SELECT 1 FROM pg_database WHERE datname = '$NAME'" | grep -q 1; then
  psql "$ADMIN" -qc "CREATE DATABASE \"$NAME\"" >/dev/null
  echo "e2e DB 만듦: $NAME"
fi
psql "$PLAIN" -qc "SELECT 1" >/dev/null

echo "[마이그레이션]"
DIRECT_URL="$E2E_URL" DATABASE_URL="$E2E_URL" npx prisma migrate deploy 2>&1 | grep -E "applied|No pending|Error" || true
echo "[시드]"
DIRECT_URL="$E2E_URL" DATABASE_URL="$E2E_URL" npx prisma db seed 2>&1 | grep -v "^$" | tail -5
echo "[테스트용 데이터]"
DIRECT_URL="$E2E_URL" DATABASE_URL="$E2E_URL" npx tsx e2e/setup-data.ts
