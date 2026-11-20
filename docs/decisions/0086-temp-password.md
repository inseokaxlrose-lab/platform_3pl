# 0086. 임시 비밀번호와 비밀번호 변경

- 날짜: 2026-11-20
- 상태: 채택
- 관련: 0010 (인증·권한 모델), 0015 (createAction), 0018 (사용자 관리), 0039 (운영사 등록 — "남은 일" 해결), 0081 (API 키 1회 표시 팝업)
- 코드: `src/lib/users/user-schema.ts` (규칙·방식·본인 변경 입력), `temp-password.ts` (`generateTempPassword`), `manage-user.ts` (`resetUserPassword`·`changeOwnPassword`), `src/lib/session.ts` (`passwordChangeRequired`·`PASSWORD_CHANGE_PATH`), `src/lib/actions/create-action.ts` (`allowWhilePasswordChange`), `src/app/account/password/`, `src/components/users/`
- 마이그레이션: `20261120070000_password_change` (`tb_user.password_change_req_yn`)

## 배경

- 사용자 계정은 관리자가 비밀번호를 직접 정해 만들고, 사용자가 바꿀 화면이 없었다 → 관리자가 계속 사용자의 비밀번호를 안다.
- 플랫폼에서 운영사를 등록하면 그 운영사 첫 관리자의 비밀번호가 모든 운영사에서 같았다(`.env SEED_ADMIN_PASSWORD`, 0039 "남은 일").
- 비밀번호 규칙은 8자 이상뿐이었다.

## 사용자 결정 (2026-11-20)

1. **처음 비밀번호: 자동 생성과 직접 입력 둘 다** — 기본은 자동 생성.
2. **처음 로그인 때 변경 강제** (추천안).
3. **규칙: 영문 + 숫자 포함 8자 이상, 아이디와 같으면 안 됨** (추천안).

## 결정

### 임시 비밀번호

- `tb_user.password_change_req_yn` = `'Y'`면 임시 비밀번호 상태. 다음 경우에 `'Y'`가 된다.
  - 사용자 관리에서 등록 (자동·직접 입력 모두)
  - 관리자의 [비밀번호 초기화] (자동·직접 입력 모두, 기존 로그인 모두 끊음)
  - 플랫폼의 운영사 등록 — 첫 관리자는 **운영사마다 자동 생성**
- 자동 생성: 12자, 영문 대·소문자 + 숫자(각 1자 이상), 헷갈리는 글자(0·O·o·1·l·I) 제외, `crypto.randomInt`.
- 자동 생성한 비밀번호만 서버 액션 결과로 **한 번** 돌려주고 화면은 `TempPasswordDialog`로 보여 준다(복사, "다시 볼 수 없음", 확인 체크해야 닫힘 — API 키 팝업 0081과 같은 모양). DB에는 암호화된 값만 남는다.
- `createUserAccount`의 `passwordChangeRequired`는 기본 `true`(안전한 쪽). **개발용 시드 계정만** `false`(.env 비밀번호를 그대로 쓰므로). `registerOperator(data, seedPassword?)`도 시드가 비밀번호를 넘길 때만 강제를 걸지 않는다.

### 변경 강제 (화면 + 서버 둘 다)

- 화면: `requireUser`(각 영역 레이아웃 입구)가 임시 비밀번호 상태면 `/account/password`로 보낸다.
- 서버: `createAction`이 임시 비밀번호 상태면 `FORBIDDEN`("비밀번호를 먼저 바꿔 주세요"). 그 상태를 벗어나는 액션만 `allowWhilePasswordChange: true`(지금은 본인 비밀번호 변경 하나).
- 상태는 세션에 담지 않고 `getCurrentUser`가 매 요청 DB에서 읽는다 — 관리자가 초기화하면 바로 반영된다.

### 내 비밀번호 변경 (`/account/password`)

- 모든 영역 공통 화면(로그인 화면과 같은 단독 카드). 상단 사용자 메뉴 [비밀번호 변경]으로 들어간다. 임시 비밀번호 상태면 [돌아가기] 대신 [로그아웃]만 있다.
- 현재 비밀번호를 확인(Better Auth `password.verify`)한 뒤 바꾼다. 새 비밀번호는 규칙 + 현재와 달라야 하고 아이디와 같으면 안 된다.
- 바꾸면 임시 표시를 풀고, **지금 쓰는 로그인만 남기고** 다른 기기의 로그인을 끊는다.
- 로그인 후 돌아갈 주소(`safeNextPath`)에 `/account/password`를 영역과 상관없이 허용한다.

## 버린 안

- **Better Auth `changePassword` API 그대로 쓰기**: 임시 표시를 같은 트랜잭션에서 풀 수 없고 규칙(아이디와 같음 등)을 따로 검사해야 해서, 같은 암호화 함수(`$context.password`)로 직접 처리했다.
- **임시 표시를 세션(Better Auth additionalFields)에 담기**: 세션 쿠키 캐시를 켜면 초기화가 늦게 반영된다. 매 요청 DB에서 읽는 운영사 상태 검사와 함께 읽으므로 추가 조회도 없다.
- **임시 비밀번호를 메일로 보내기**: 현장 작업자는 이메일이 없을 수 있고 알림 기능도 아직 없다. 관리자가 전달한다.
- **비밀번호 만료(주기적 변경)·실패 횟수 잠금**: 이번 범위 밖. 필요해지면 따로 결정한다.
