# 화주 연동 API 오류코드

화주 시스템은 **오류코드(`error.code`, 건별 `errors[].code`)로 분기**합니다. 코드는 한 번 정하면 바꾸지 않고, 문구는 바뀔 수 있습니다.
코드의 출처는 `src/lib/api/api-errors.ts`이고, 이 문서와 코드가 다르면 테스트(`src/lib/api/api-docs.test.ts`)가 실패합니다. 결정 기록: `docs/decisions/0081-shipper-api.md`.

## 응답 모양

```json
{ "requestId": "req_20261117_8f3a1c2b4d5e6f70", "result": "FAIL",
  "error": { "code": "SCOPE_REQUIRED", "message": "이 API는 ITEM_WRITE 권한이 필요합니다.", "category": "권한" } }
```

- 요청 자체가 처리되면 **200**입니다(전체 성공·부분 성공 모두). 건별 오류는 `items[].errors[]`에 들어갑니다.
- 문의할 때는 `requestId`(응답 헤더 `X-Request-Id`)를 알려 주세요.

## 코드 목록

| 코드 | HTTP | 분류 | 뜻 · 화주 쪽 처리 |
| --- | --- | --- | --- |
| `API_KEY_MISSING` | 401 | 인증 | `X-API-Key` 헤더가 없음 |
| `API_KEY_INVALID` | 401 | 인증 | 키 형식이 틀리거나 없는 키 (어느 쪽인지는 알려주지 않음) |
| `API_KEY_REVOKED` | 401 | 인증 | 폐기된 키 → 운영사에 새 키 요청 |
| `API_KEY_EXPIRED` | 401 | 인증 | 만료된 키 → 운영사에 새 키 요청 |
| `HTTPS_REQUIRED` | 403 | 권한 | HTTP로 호출함 → HTTPS로 |
| `IP_NOT_ALLOWED` | 403 | 권한 | 키에 허용되지 않은 IP |
| `API_DISABLED` | 403 | 권한 | 화주의 API 사용이 꺼져 있음 |
| `OPERATOR_DISABLED` | 403 | 권한 | 운영사 이용이 중지됨 |
| `CLIENT_NOT_ACTIVE` | 403 | 권한 | 준비중 화주가 LIVE 키로 호출 → TEST 키로 검증 |
| `CLIENT_SUSPENDED` | 403 | 권한 | 일시정지 화주의 LIVE 쓰기 호출 (조회는 됨) |
| `CLIENT_TERMINATED` | 403 | 권한 | 해지된 화주 |
| `SCOPE_REQUIRED` | 403 | 권한 | 키에 이 API의 권한이 없음 |
| `INVALID_JSON` | 400 | 형식 | 본문이 JSON이 아님 |
| `VALIDATION_FAILED` | 400 | 형식 | 입력값 오류 (`field`에 칸 위치) — 건별 오류로도 옴 |
| `NOT_FOUND` | 404 | 참조 없음 | 대상(거래처·품목·ASN·주문)을 찾을 수 없음 — 건별 오류로도 옴 |
| `STATUS_NOT_ALLOWED` | 409 | 상태 불가 | 지금 상태에서는 할 수 없음 (예: 입고 시작된 ASN 수정) |
| `DUPLICATE` | 409 | 중복 | 이미 있는 문서번호 (ASN번호·주문번호) — 건별 결과 |
| `POLICY_VIOLATION` | 422 | 정책 위반 | 화주 정책에 맞지 않음 (예: 미등록 품목 주문 불허) |
| `IDEMPOTENCY_CONFLICT` | 409 | 중복 | 같은 `Idempotency-Key`로 다른 본문을 보냄 |
| `TOO_MANY_ITEMS` | 413 | 한도 | 한 번에 보낼 수 있는 건수(500) 초과 |
| `RATE_LIMITED` | 429 | 한도 | 분당 호출 한도 초과 → `Retry-After`초 뒤 다시 |
| `INTERNAL_ERROR` | 500 | 서버 | 서버 오류 → `requestId`로 문의 |
