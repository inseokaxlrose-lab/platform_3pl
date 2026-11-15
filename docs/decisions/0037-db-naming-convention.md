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

## 1b. 내부 키 BIGINT (2026-11-15 적용)

- 모든 표의 키·참조 칸을 글자(cuid) → BIGINT 자동 증가로. 마이그레이션 `20261115083253_bigint_keys`:
  표마다 등록 순서대로 1, 2, 3… 번호를 다시 매기고(외래키 ON UPDATE CASCADE로 자식 칸도 함께), 외래키가 없는 외부 코드 `entity_id`는 종류별로 직접 바꾼 뒤, 형식을 BIGINT로 바꾸고 시퀀스를 최댓값 다음부터 시작. 로그인 세션은 비운다(모두 다시 로그인).
- Better Auth: `generateId: 'serial'`. 아이디·비밀번호 계정의 상대 키(`provider_account_id`)는 사용자 키 글자.
- 코드 규칙: 서버·DB는 bigint, 화면·주소·서버 액션 입출력은 글자. 경계 처리는 `src/lib/id.ts`(`parseId`·`idSchema`·`idField`·`textIds`)와 `createAction`(결과 자동 변환) — 표는 `docs/db-conventions.md`.
- 검증: 개발 데이터 복사본·빈 DB 모두 적용 후 스키마 차이 없음, 관계(사용자↔화주사·센터·권한그룹) 보존, 시드(빈 DB) 정상, 전체 테스트 467개, 빌드, 브라우저(로그인·목록·수정 화면 `/centers/1`·검색 조건·저장·잘못된 주소 404).

## 1c. 예/아니오 칸 CHAR(1) Y/N (2026-11-15 적용)

- `_yn` 칸 6개를 BOOLEAN → CHAR(1) `'Y'`/`'N'` + 검사 조건으로 (기존 true → Y, false → N). 마이그레이션 `_yn_char`.
- `is_active`는 바꾸지 않았다: 2단계에서 `status_cd`(사용/중지)로 대체되므로 두 번 바꾸지 않기 위해.
- 코드: 화면·입력 규칙은 true/false, DB 경계에서 `toYn`/`isYes` (`src/lib/yn.ts`). Prisma 타입이 `string`이라 참/거짓 검사는 반드시 `isYes` — 놓치면 `'N'`이 참이 된다(단위·공통코드 "시스템" 검사에서 실제로 발견해 고침).
- 검증: 데이터 복사본·빈 DB 적용 후 스키마 차이 없음, 값 보존(가나식품 Y/Y, 다라전자 N/N, 시스템 단위 EA·BOX·PLT), 전체 테스트 469개, 브라우저(로트 Y 검색, 화주사 토글, 단위 "시스템" 표시).
- 주의: `prisma generate` 뒤에는 개발 서버를 다시 시작해야 새 클라이언트를 쓴다 (옛 클라이언트로 'Y' 검색이 0건이었다).

## 주의

- 원시 SQL을 쓸 때는 새 이름(`tb_…`, snake_case)을 쓴다. 지금 원시 SQL은 시퀀스 번호 발급·테스트 DB 비우기뿐이라 영향 없음.
