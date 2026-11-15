# 0037. DB 명명 규칙 — tb_ 표 이름, snake_case 칸, 접미사

- 날짜: 2026-11-15
- 상태: 채택 (1a 이름 바꾸기 적용, 1b·1c는 M2.5에서 이어서)
- 관련: `docs/db-conventions.md` (규칙·표·칸 대응표), 0003 (도메인 모델), 0029 (번호는 숫자만)

## 배경

운영사(tb_operator) 컬럼 정의서가 표 `tb_` 접두사, snake_case 칸, 접미사(`_id`·`_cd`·`_nm`·`_no`·`_yn`·`_dt`·`_at`·`_cnt`·`_amt`)를 쓴다. 지금 DB는 Prisma 기본값(모델 이름 그대로, camelCase 칸)이라, 운영사 표만 다르게 두면 표마다 규칙이 섞인다. 업무 표(품목·재고·입고)가 생기기 전에 바꾸는 편이 가장 싸다.

## 결정 (사용자 결정)

- 정의서 규칙을 **모든 표**에 적용한다 (25개 표, 197개 칸 — 대응표는 `docs/db-conventions.md`).
- **코드 쪽 이름은 camelCase 그대로**: Prisma `@@map`(표)·`@map`(칸)으로 DB 이름만 바꾼다. 화면·서버 코드는 바뀌지 않는다.
- 데이터 보존: 마이그레이션은 `ALTER TABLE … RENAME`·`RENAME COLUMN`·인덱스·제약 RENAME만 쓴다 (지우고 다시 만들지 않음). 직접 만든 검사 조건·부분 고유 인덱스도 새 이름으로 (`tb_user_shipper_matches_type`, `tb_warehouse_one_inbound_per_center`).
- 겹치는 이름 정리: Better Auth `account`의 `id` → `acct_id`, `accountId` → `provider_account_id`.
- 이어서 할 것 (같은 결정, 단계만 나눔): 내부 키 BIGINT(1b), `_yn`은 CHAR(1) `'Y'`/`'N'`(1c). 단계마다 브랜치를 나누고 빈 DB 재구성 + 개발 DB 적용 + 전체 테스트 + 브라우저 확인 후 다음으로.

## 검증

- 빈 DB에 마이그레이션 전부 적용 → `prisma migrate diff --from-config-datasource --to-schema` 차이 없음.
- 개발 DB(백업 후) 적용: 기존 데이터·로그인 세션 유지, 주요 화면 10곳 정상, 전체 테스트 463개 통과, 빌드 통과.

## 주의

- 원시 SQL을 쓸 때는 새 이름(`tb_…`, snake_case)을 쓴다. 지금 원시 SQL은 시퀀스 번호 발급·테스트 DB 비우기뿐이라 영향 없음.
