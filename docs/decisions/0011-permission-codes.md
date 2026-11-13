# 0011. 메뉴·버튼 권한 코드

- 날짜: 2026-11-13
- 상태: 채택
- 관련: 0003 결정 7, 0010 (권한 DB 모델)
- 코드: `src/config/permissions.ts` (유일한 출처), `src/config/navigation.ts` (메뉴별 필요 권한)

## 결정

### 형식: `{메뉴}.{동작}`

- 예: `inbound.asn.create` = ASN [등록] 버튼, `stock.adjustments.confirm` = 재고 조정 확정
- **`read`(조회) = 메뉴 접근 권한.** 모든 메뉴에 있고, 없으면 메뉴 자체가 보이지 않는다.
- 동작: 조회 `read` · 등록 `create` · 수정 `update` · 삭제 `delete` · 확정 `confirm` · 잔량 마감 `close` · 출력 `print` · 엑셀 `export`
- 메뉴 이름은 소문자, 단어 사이는 하이픈 (`master.delivery-zones`).

### 영역 분리

- 운영사 화면 메뉴와 화주 포털 메뉴(`portal.*`)는 코드를 나눈다. 같은 "ASN"이라도 `inbound.asn.*`와 `portal.asn.*`는 다른 권한이다 → 화주 담당자에게 운영사 화면 권한이 섞이지 않는다.
- 홈(`/admin`, `/portal`)은 권한 코드가 없다. 그 영역에 들어올 수 있는 사람은 누구나 본다 (영역 접근은 사용자 유형으로 정한다).

### 업무 규칙이 반영된 권한

- ASN 잔량 마감은 `inbound.asn.close`로 별도 권한 (PRD: 권한 필요).
- 실사·조정은 등록(`create`)과 확정(`confirm`)을 나눈다: 작업자가 등록하고 관리자가 확정하는 2단계.
- 입고 확정(`inbound.confirm`)과 적치(`inbound.putaway`)는 별도 메뉴·권한.

### 타입으로 오타 방지

- 목록에서 `PermissionCode` 타입을 자동으로 만든다. 목록에 없는 코드(`inbound.asn.creat`)는 타입 오류.
- DB·요청에서 읽은 값은 `isPermissionCode()`로 검사한다 (권한그룹 저장 시 등).

### 메뉴 ↔ 권한 일관성 테스트

- `src/config/navigation.test.ts`: 메뉴마다 권한이 있는지, 같은 영역인지, 권한 목록의 모든 메뉴가 사이드바에 있는지 검사.
- 메뉴를 추가하고 권한을 빠뜨리면 메뉴 주소와 함께 실패한다 (일부러 빠뜨려 실패하는 것을 확인함).

## 처음 목록

76개 코드 (운영사 화면 21개 메뉴 + 포털 3개 메뉴). 화면을 만들며 동작이 더 필요하면 이 목록에 추가한다.
