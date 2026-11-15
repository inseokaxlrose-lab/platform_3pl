import { z } from 'zod'
import { affiliationIssues } from './affiliation'

// 사용자 입력 규칙 — 화면·서버 공용 (docs/decisions/0018)

export const USER_TYPES = ['OPERATOR', 'CENTER', 'SHIPPER'] as const
export type UserTypeValue = (typeof USER_TYPES)[number]

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,30}$/, '아이디는 영문·숫자·점·밑줄·하이픈 3~30자입니다.')

export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상입니다.')
  .max(128, '비밀번호는 128자 이하입니다.')

export const nameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(50)

// 비어 있으면 undefined (없는 사용자는 서버가 내부용 주소를 채운다)
export const emailSchema = z
  .union([z.literal(''), z.email('이메일 형식이 아닙니다.')])
  .optional()
  .transform((value) => value || undefined)

// 소속·권한그룹 (센터 직원 → 센터, 화주사 사용자 → 화주사)
export const affiliationShape = {
  centerIds: z.array(z.string().min(1)).max(50).default([]),
  shipperId: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  permissionGroupIds: z.array(z.string().min(1)).max(50).default([]),
}

// 유형별 소속 규칙을 칸 오류로 (centerIds / shipperId)
function checkAffiliation(
  data: { userType: UserTypeValue; centerIds: string[]; shipperId?: string },
  ctx: z.RefinementCtx,
) {
  for (const issue of affiliationIssues(data.userType, data.centerIds, data.shipperId)) {
    ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
  }
}

// 등록: 아이디·유형·초기 비밀번호까지
export const createUserSchema = z
  .object({
    username: usernameSchema,
    name: nameSchema,
    userType: z.enum(USER_TYPES),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    ...affiliationShape,
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 서로 다릅니다.',
  })
  .superRefine(checkAffiliation)

// 수정 (서버): 아이디·유형은 바꿀 수 없다. 소속 규칙은 서버가 저장된 유형으로 확인한다
export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: nameSchema,
  email: emailSchema,
  ...affiliationShape,
})

// 수정 (화면): 지금 유형으로 소속 규칙까지 먼저 확인한다 (id·유형은 화면이 들고 있는 값)
export const updateUserFormSchema = z
  .object({
    userType: z.enum(USER_TYPES),
    name: nameSchema,
    email: emailSchema,
    ...affiliationShape,
  })
  .superRefine(checkAffiliation)

// 화면 입력값 (등록·수정 같은 모양)
export type UserFormValue = {
  username: string
  name: string
  userType: UserTypeValue
  email: string
  password: string
  passwordConfirm: string
  centerIds: string[]
  shipperId: string
  permissionGroupIds: string[]
}
