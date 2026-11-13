# 0015. 서버 액션 공통 틀 (서버 권한 검사)

- 날짜: 2026-11-13
- 상태: 채택
- 관련: CLAUDE.md 절대 규칙 "권한 검사는 화면 + 서버 둘 다", 0014 (화면 권한)
- 코드: `src/lib/actions/`

## 결정

### 데이터를 바꾸는 모든 서버 액션은 `createAction`으로 만든다

```ts
export const closeAsnAction = createAction({
  permission: 'inbound.asn.close',
  input: z.object({ asnId: z.string(), reason: z.string().trim().min(1) }),
  handler: async ({ user, input, permissions }) => { /* 처리 */ },
})
```

- 검사 순서: ① 로그인(사용 중지 포함) → ② 권한 → ③ 입력(Zod) → ④ 처리
- **권한을 입력보다 먼저** 검사한다: 권한 없는 사람에게 입력 규칙 힌트를 주지 않는다.
- 화면 버튼(`<Can>`)과 **같은 권한 코드**를 쓴다.

### 결과를 돌려준다 (던지지 않는다)

- `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`
- 이유: Next.js는 운영 환경에서 서버 오류 메시지를 숨긴다 → 던지면 화면에 정확한 안내를 할 수 없다.
- 오류 코드: `UNAUTHENTICATED` · `FORBIDDEN` · `VALIDATION`(칸별 메시지) · `NOT_FOUND` · `CONFLICT` · `UNKNOWN`
- 처리 중 업무 오류는 `throw new ActionError('CONFLICT', '이미 마감된 ASN입니다.')` → 메시지가 그대로 사용자에게.
- 예상 못 한 오류는 일반 문구만 돌려주고, 자세한 내용은 `console.error`(서버 기록)에만 남긴다 (내부 정보 노출 방지).
- 화면에서 "실패 = 예외"가 필요하면 `unwrap(result)` (예: `ConfirmDialog`의 `onConfirm`).

### 빠뜨림 방지 테스트

- `server-actions-guard.test.ts`: `'use server'` 파일의 모든 export가 `createAction`인지 검사. 예외는 로그인·로그아웃뿐.
- 권한 검사 없는 임시 액션 파일을 넣어 파일·이름과 함께 실패하는 것을 확인했다.

### 보완 (0021): 로그인만 필요한 개인 설정

- `permission: 'signed-in'`이면 메뉴 권한 없이 로그인만 검사한다. 그리드 설정처럼 **본인 것만** 다루는 액션용.
- 이 경우 handler는 반드시 `context.user.id`의 데이터만 다룬다 (입력으로 받은 사용자 id를 쓰지 않는다).

## 다음

- 데이터 범위(소속 센터·화주사)는 "데이터 범위 장치" 작업에서 `ActionContext`에 추가한다.
