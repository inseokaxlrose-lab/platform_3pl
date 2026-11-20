# 0084. 코드 체계(체번) — 체번 규칙·현재값 표, 운영사·날짜별 문서번호

- 날짜: 2026-11-20
- 상태: 채택 (① 체번 기반 완료 — ② 코드 3층(sys_cd 삭제·자동 체번·사용자 정의 코드)부터는 다음 단계)
- 관련: 0025 (기준정보 코드 3층 — ②에서 갱신), 0047 (문서 번호 — 대체), 0039 (멀티테넌트)
- 정의서: `docs/specs/system_code.md` (테이블 정의서 검토 + 체번 반영안)
- 코드: `src/lib/numbering/` (`numbering-codes.ts` 값·번호 모양, `numbering.ts` 발급), `src/lib/documents/doc-no.ts`
- 마이그레이션: `20261120000000_numbering`

## 사용자 결정 (2026-11-20, 모두 추천안)

| 항목 | 결정 |
| --- | --- |
| 작업 나누기 | 5단계로 나눠 병합 — ① 체번 기반 ② 코드 3층 ③ 용어·타입 ④ 중간 항목(이름·ENUM) ⑤ 로케이션 바코드·정의서 한글명·규칙 문서 |
| location / loc | `location`으로 통일 (④) |
| 공통코드 항목 칼럼 | `code_cd`·`code_nm`으로 줄임 (④) |
| 운영사 중량·길이 단위 | id(FK)로 (③) |
| 정의서 7장 결정 | 그대로 — 로케이션 바코드 `창고코드.로케이션코드`, 용어 shipper·customer, ENUM → VARCHAR+CHECK, 전면 재체번, 문서번호 하이픈 유지, sys_cd 삭제 |

## ① 체번 기반

### 표

- `tb_numbering_rule` (체번 규칙): 대상마다 번호 모양. `operator_id` NULL = 시스템 기본, 값이 있으면 그 운영사의 재정의(운영사 행이 이긴다 — 단위·팔레트 종류와 같은 공유 방식, `SHARED_SYSTEM_MODELS`).
  - 대상당 하나: 부분 고유 인덱스 2개 (운영사 행 `(operator_id, target_cd)`, 시스템 행 `(target_cd)`) — 정의서의 `NULLS NOT DISTINCT`를 Prisma가 표현할 수 있는 모양으로.
  - 값은 상수(`numbering-codes.ts`) + DB 검사 조건 (0040).
- `tb_numbering_seq` (체번 현재값): PK (운영사, 대상, 범위 키, 주기 키). 카운터라 FK를 두지 않는다.

### 번호 모양

`접두어 + 구분 문자 + 날짜 + 구분자 + 일련번호(0 채움)`

| 대상 | 접두어 | 예 | 범위 | 초기화 |
| --- | --- | --- | --- | --- |
| SHIPPER | `SH` | `SH0001` | 운영사 | 없음 |
| CUSTOMER | 화주 `code_prefix` + `C` | `ABC000123` | 화주사 | 없음 |
| SHIP_TO | 거래처코드 + `-` | `ABC000123-01` | 거래처 | 없음 |
| ITEM | 화주 `code_prefix` + `S` | `ABS000123` | 화주사 | 없음 |
| ASN · RECEIPT · ADJUST | `AS` · `RC` · `AJ` + YYMMDD + `-` | `AS261120-0001` | 운영사 | 매일 |
| LABEL | `LB` + YYMMDD + `-` | `LB261120-000001` (6자리) | 운영사 | 매일 |

- 날짜·주기는 **운영사 타임존**(`tb_operator.timezone`) 기준 등록일.
- 자리수를 넘으면 잘라 내지 않고 길어진다 (예: `AS261120-12345`).
- 거래처·납품처·품목 규칙은 시스템 기본만 넣어 두고, 화주 `code_prefix`·상위 코드 찾기는 ②에서 연결한다.

### 발급 (`numbering.ts`)

- `issueCodes(db, target, ctx, n)`: `INSERT … ON CONFLICT DO UPDATE SET last_seq = last_seq + n RETURNING last_seq` **한 문장**으로 원자적으로 n개 범위를 받는다 (MAX()+1 금지). 값은 모두 바인딩.
- `issueCode`: 한 건. `isAutoPattern`: 직접 입력한 코드가 자동 체번 모양인지 (②에서 직접 입력 거부에 쓴다).
- 등록과 같은 트랜잭션에서 받는다. 트랜잭션이 실패하면 결번이 생길 수 있다 (허용).

### 문서번호 (0047 대체)

- `nextDocumentNumber`는 체번을 부른다 (운영사는 출입증의 운영사). 옛 종류별 DB 시퀀스(`doc_no_*_seq`)와 `src/config/document-numbers.ts`는 지웠다.
- **H1**: 문서번호 UNIQUE를 전역 → `(operator_id, 번호)`로 (`tb_asn`·`tb_inbound_receipt`·`tb_inbound_label`·`tb_stock_adjust`). 운영사마다 같은 날 같은 번호가 나올 수 있으므로.

## 버린 안

- **종류별 DB 시퀀스 유지 (0047)**: 운영사·날짜별로 1부터 시작할 수 없고, 운영사마다 자리수·접두어를 바꿀 수 없다.
- **`MAX(번호)+1`**: 동시에 등록하면 같은 번호가 나온다.
- **`NULLS NOT DISTINCT` 고유 인덱스 하나**: Prisma 스키마로 표현되지 않아 스키마와 DB가 어긋난다 — 부분 인덱스 2개로.
