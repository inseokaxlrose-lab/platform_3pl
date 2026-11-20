# 0090. 공급처 — 거래처 역할 구분 (M8 A4)

- 날짜: 2026-11-20
- 상태: 채택
- 관련: 0082 (거래처·납품처), 0050 (ASN), 0084 (코드 3층), 기준정보 누락 검토 1-1·3-7
- 코드: `src/lib/customers/customer-codes.ts` (`CUSTOMER_ROLE`·`SUPPLIER_ROLES`), `customer-schema.ts`·`customers.ts`·`customer-upsert.ts`·`customer-upload.ts`, `src/lib/inbound/asns.ts` (`assertSupplier`), `asn-queries.ts`·`asn-upload.ts`
- 마이그레이션: `20261120110000_supplier`

## 배경

거래처(tb_customer)는 출고 때 물건을 **받는** 곳만 다뤘다. 입고 때 물건을 **보내는** 곳(제조사·수입처·협력사)을 둘 곳이 없어 공급처별 입고 실적·불량률·공급처 반송을 볼 수 없었다.

## 사용자 결정 (2026-11-20)

- **거래처 표에 역할 구분**을 둔다 (추천안). 한 회사가 공급처이자 납품처인 경우가 많고, 주소 정제·담당자·API·엑셀을 그대로 쓸 수 있다.

## 결정

- `tb_customer.customer_role_cd`: `SALES` 매출처(기본) / `PURCHASE` 매입처(공급처) / `BOTH` 둘 다. 상수 `CUSTOMER_ROLE` + DB 검사.
- **매입처만**(`PURCHASE`)인 거래처는 기본 납품처를 만들지 않고, 주소·납품처가 없어도 등록·수정할 수 있다. 매출처·둘 다는 이전 규칙 그대로(납품처 1곳 이상, 없으면 거래처 주소로 기본 납품처).
- `tb_asn.supplier_id` → `tb_customer`(선택). 같은 화주사의 매입처·둘 다 거래처만, 새로 고를 때는 거래중이어야 한다(이미 저장된 공급처는 거래중지여도 유지).
- ASN 공급처로 쓰인 거래처는 **지울 수 없다**(`findUsedCustomerIds`, 지운 ASN 포함).
- 화면: 거래처 등록·수정에 **거래처 역할**, 목록에 역할 열·조건. ASN 등록(운영사·포털)에 **공급처** 고르기(화주사의 매입처·둘 다), ASN 목록에 공급처 열.
- 연동: 거래처 API `customerRole`, 거래처 엑셀 `거래처역할`(매출처/매입처/둘다), ASN 엑셀 `공급처코드`.

## 버린 안

- **별도 공급처 표(tb_supplier)**: 거래처와 같은 모양(코드 3층·주소·담당자·API)을 한 벌 더 만들어야 하고, 매출·매입을 겸하는 회사가 두 번 등록된다.
