# 거래처 API 필드 대응표

화주 연동 API의 **거래처(customer)·납품처(shipTo)** 필드가 화면의 어느 칸, DB의 어느 칼럼과 같은지 정리합니다.
연동에서는 정의서 이름(`customer`)을 쓰고, 화면·DB는 `거래처`(`tb_customer`)입니다. 결정 기록: `docs/decisions/0082-customer-ship-to.md`.
요청 규칙(Zod)의 출처는 `src/lib/customers/customer-upsert.ts`(`apiCustomerSchema`·`apiShipToSchema`)입니다.

- 쓰기 규칙: **보낸 칸만** 고칩니다. 안 보낸 칸은 그대로, `null`은 값 지우기입니다 (필수 칸은 지울 수 없음).
- 엑셀 업로드도 같은 규칙입니다. 비운 칸은 "안 보냄"입니다 (엑셀로는 값을 지울 수 없음).
- 전화·사업자번호는 하이픈을 넣어 보내도 되고, 숫자만 저장합니다. 조회 응답은 숫자만입니다.

## 거래처 (`POST /customers` 본문 한 건)

| API 필드 | 화면 칸 | 엑셀 제목 | DB 칼럼 (`tb_customer`) | 비고 |
| --- | --- | --- | --- | --- |
| `customerCd` | 거래처코드 | 거래처코드 | `customer_cd` | 연동 조회 키가 우리 코드(기본)면 **필수**·업무 키. 사용자 정의 코드 화주는 선택(비우면 자동 체번). 바꿀 수 없음. 영문·숫자·`-`·`_` 30자 (소문자는 대문자로) |
| `customerCustCd` | 사용자 정의 코드 | 거래처사용자정의코드 | `customer_cust_cd` | 화주 시스템의 거래처코드. 연동 조회 키가 사용자 정의 코드면 **필수**·업무 키(대소문자 그대로). 50자, 화주 안에서 고유 |
| `customerNm` | 거래처명 | 거래처명 | `customer_nm` | 새 거래처는 필수 |
| `shortNm` | 약칭 | 약칭 | `customer_short_nm` | |
| `customerType` | 거래처 유형 | 거래처유형 | `customer_type_cd` | 공통코드 `CUSTOMER_TYPE`의 코드 |
| `customerGroup` | 거래처 그룹 | 거래처그룹 | `customer_group_cd` | |
| `bizRegNo` | 사업자등록번호 | 사업자등록번호 | `biz_reg_no` | 숫자만 저장 |
| `ceoNm` | 대표자 | 대표자 | `ceo_nm` | |
| `orderAddrMode` | 주문 주소 사용 | — | `order_addr_mode_cd` | `SHIP_TO`(납품처 지정, 기본) · `ORDER_ADDR`(주문 수령인 주소) |
| `telNo` | 대표 전화 | 대표전화 | `tel_no` | 숫자만 저장 |
| `faxNo` | 팩스 | 팩스 | `fax_no` | 숫자만 저장 |
| `email` | 이메일 | 이메일 | `email` | |
| `zipCd` | 주소(우편번호) | 우편번호 | `raw_zip_cd` | 원본. 정제 결과는 `zip_cd` |
| `addr1` | 주소 | 주소 | `raw_addr` | 원본. 정제 결과는 `addr1`, 등급은 `addr_grade` |
| `addr2` | 상세주소 | 상세주소 | `addr2` | |
| `minShelfDays` | 최소 잔여 유통기한 | 최소잔여유통기한(일) | `min_shelf_days` | 정수(일) |
| `minShelfRatio` | 최소 잔여 비율 | — | `min_shelf_ratio` | 0~100 (%) |
| `status` | 상태 | 거래상태 | `status_cd` | `ACTIVE`(거래중) · `SUSPENDED`(거래중지 — 신규 출고요청 반려) |
| `remark` | 비고 | — | `remark` | |
| `shipTos[]` | 납품처 섹션 | 납품처 칸들 | `tb_ship_to` | 아래 표. **보낸 납품처만** 추가·수정 |
| (응답) `addrGrade` | 정제 등급 | — | `addr_grade` | A~F |
| (응답) `source` | 등록 경로 | — | `source_cd` | `SCREEN`·`PORTAL`·`API`·`UPLOAD`·`ORDER_AUTO` |
| (응답) `lastIfAt` | 마지막 연동 | — | `last_if_at` | 연동·업로드로 고친 시각 |

담당자(`tb_customer_contact`)는 API로 다루지 않습니다 (화면에서만).

## 납품처 (`shipTos[]`, `POST /customers/{customerCd}/ship-tos` 본문 한 건)

| API 필드 | 화면 칸 (납품처 드로어) | 엑셀 제목 | DB 칼럼 (`tb_ship_to`) | 비고 |
| --- | --- | --- | --- | --- |
| `shipToCd` | 납품처코드 | 납품처코드 | `ship_to_cd` | 연동 조회 키가 우리 코드(기본)면 **필수**·업무 키. 사용자 정의 코드 화주는 선택(비우면 `{거래처코드}-01`부터 자동). 거래처 안에서 고유, 바꿀 수 없음 |
| `shipToCustCd` | 사용자 정의 코드 | 납품처사용자정의코드 | `ship_to_cust_cd` | 화주 시스템의 납품처코드. 연동 조회 키가 사용자 정의 코드면 **필수**·업무 키. 50자, 거래처 안에서 고유 |
| `shipToNm` | 납품처명 | 납품처명 | `ship_to_nm` | 새 납품처는 필수 |
| `default` | 기본(라디오) | 기본납품처 (Y/N) | `default_yn` | 거래처당 1곳. `true`로 보내면 다른 납품처는 기본 해제 |
| `addrSync` | 거래처 주소와 동기화 | — | `addr_sync_yn` | 기본 납품처만. 켜면 주소 칸 대신 거래처 주소 |
| `zipCd` | 주소(우편번호) | 납품처우편번호 | `raw_zip_cd` | 원본 (6자리 구 우편번호도 받음) |
| `addr1` | 주소 | 납품처주소 | `raw_addr` | 원본 (지번 주소도 받음) |
| `addr2` | 상세주소 | 납품처상세주소 | `addr2` | |
| `receiverNm` | 수령 담당자 | 수령담당자 | `receiver_nm` | 요청 로그에서 가림 |
| `receiverTelNo` | 수령 연락처 | 수령연락처 | `receiver_tel_no` | 요청 로그에서 가림 |
| `receiverTelNo2` | 수령 연락처2 | — | `receiver_tel_no2` | |
| `deliveryMemo` | 배송 메모 | 배송메모 | `delivery_memo` | |
| `centerCd` | 배송센터 | 배송센터코드 | `delivery_center_id` | 있으면 그 센터(지정 구분 `IF`), `null`이면 권역 자동, 안 보내면 지금 지정 그대로 |
| `status` | 상태 | 납품처상태 (사용/사용중지) | `status_cd` | `ACTIVE` · `INACTIVE` |
| `remark` | 비고 | — | `remark` | |
| (응답) `refinedZipCd`·`refinedAddr` | 주소 아래 표시 | — | `zip_cd`·`addr1` | 정제 결과 |
| (응답) `addrGrade` | 정제 등급 | — | `addr_grade` | A~F |
| (응답) `centerAssignType` | 지정 구분 | — | `center_assign_type_cd` | `IF`(연동) · `AUTO`(권역 자동) · `MANUAL`(화면) |
| (응답) `centerAssignStatus` | 지정 상태 | — | `center_assign_status_cd` | `ASSIGNED` · `NEED_CONFIRM` |
| (응답) `confirmReason` | 확인 필요 사유 | — | `center_confirm_reason_cd` | `ADDR_NOT_RESOLVED`·`REGION_UNASSIGNED`·`REGION_MIXED`·`NOT_SHIPPER_CENTER`·`CENTER_INACTIVE`·`INVALID_CENTER_CD` |
| (응답) `regionMismatch` | 권역 불일치 ⚠ | — | `region_mismatch_yn` | 권역 기준 센터와 다른 센터로 지정됨 |

## 배송센터를 정하지 못했을 때 (화주 정책 `ship_to_center_policy_cd`)

| 정책 | `centerCd` 없음 + 자동 지정 실패 | 이용 센터가 아닌 `centerCd` |
| --- | --- | --- |
| `AUTO_HOLD` (기본) | 저장, `NEED_CONFIRM` + `confirmReason` | 저장, `NEED_CONFIRM` (`NOT_SHIPPER_CENTER`) |
| `AUTO_REJECT` | 그 납품처만 FAIL (`ADDRESS_NOT_RESOLVED`·`REGION_UNASSIGNED`·`REGION_MIXED`) | 그 납품처만 FAIL (`NOT_SHIPPER_CENTER`) |
| `REQUIRED` | `centerCd`가 없으면 FAIL (`CENTER_REQUIRED`) | 그 납품처만 FAIL (`NOT_SHIPPER_CENTER`) |

반려 때문에 기본 납품처가 없어지는 **새 거래처**는 거래처도 FAIL입니다. 운영사 화면·엑셀 업로드는 정책을 쓰지 않고 늘 `NEED_CONFIRM`으로 저장합니다.
