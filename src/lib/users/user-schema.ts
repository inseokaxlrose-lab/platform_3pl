import { z } from 'zod'
import { rowVersionField } from '@/lib/row-version'
import { affiliationIssues } from './affiliation'
import { idSchema } from '@/lib/id'
import { optionalPhone, optionalText } from '@/lib/validation/common-fields'

// 사용자 입력 규칙 — 화면·서버 공용 (docs/decisions/0018)

export const USER_TYPES = ['OPERATOR', 'CENTER', 'SHIPPER'] as const
export type UserTypeValue = (typeof USER_TYPES)[number]

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,30}$/, '아이디는 영문·숫자·점·밑줄·하이픈 3~30자입니다.')

// 비밀번호 규칙 (0086): 8~128자, 영문과 숫자를 모두 넣는다
export const PASSWORD_RULE_TEXT = '영문·숫자를 모두 넣어 8자 이상'
export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상입니다.')
  .max(128, '비밀번호는 128자 이하입니다.')
  .regex(/[A-Za-z]/, '비밀번호에 영문을 넣어 주세요.')
  .regex(/[0-9]/, '비밀번호에 숫자를 넣어 주세요.')

// 아이디와 같은 비밀번호는 쓸 수 없다 (대소문자 무시) — 아이디를 아는 쪽(등록·재설정·본인 변경)에서 검사
export const isPasswordSameAsUsername = (password: string, username: string) =>
  password.trim().toLowerCase() === username.trim().toLowerCase()
export const SAME_AS_USERNAME_MESSAGE = '아이디와 같은 비밀번호는 쓸 수 없습니다.'

// 처음 비밀번호 정하는 방식: 시스템 자동 생성(기본) / 관리자 직접 입력 (0086)
export const PASSWORD_MODES = ['AUTO', 'MANUAL'] as const
export type PasswordMode = (typeof PASSWORD_MODES)[number]

// 직접 입력일 때만 비밀번호·확인을 검사한다 (자동이면 서버가 만든다)
export const passwordChoiceShape = {
  passwordMode: z.enum(PASSWORD_MODES).default('AUTO'),
  password: z.string().max(128).default(''),
  passwordConfirm: z.string().default(''),
}
export function checkPasswordChoice(
  data: { passwordMode: PasswordMode; password: string; passwordConfirm: string },
  ctx: z.RefinementCtx,
  username?: string,
) {
  if (data.passwordMode !== 'MANUAL') return
  const parsed = passwordSchema.safeParse(data.password)
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: parsed.error.issues[0].message })
    return
  }
  if (username && isPasswordSameAsUsername(data.password, username)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: SAME_AS_USERNAME_MESSAGE })
    return
  }
  if (data.password !== data.passwordConfirm) {
    ctx.addIssue({
      code: 'custom',
      path: ['passwordConfirm'],
      message: '비밀번호가 서로 다릅니다.',
    })
  }
}

// 본인 비밀번호 변경 (화면·서버 공용): 현재 비밀번호 확인 + 새 비밀번호 규칙 + 현재와 달라야 함
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.').max(128),
    newPassword: passwordSchema,
    newPasswordConfirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword === data.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: '현재 비밀번호와 다른 비밀번호를 넣어 주세요.',
      })
    }
    if (data.newPassword !== data.newPasswordConfirm) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPasswordConfirm'],
        message: '비밀번호가 서로 다릅니다.',
      })
    }
  })
export type ChangePasswordInput = z.input<typeof changePasswordSchema>

export const nameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(50)

// 비어 있으면 undefined (없는 사용자는 서버가 내부용 주소를 채운다)
export const emailSchema = z
  .union([z.literal(''), z.email('이메일 형식이 아닙니다.')])
  .optional()
  .transform((value) => value || undefined)

// 연락처·부서·직책·사번 (선택, 0093) — 전화는 숫자만 저장
export const profileShape = {
  phone: optionalPhone.default(''),
  deptName: optionalText(50).default(''),
  positionName: optionalText(50).default(''),
  empNo: optionalText(30).default(''),
}

// 소속·권한그룹 (센터 직원 → 센터, 화주사 사용자 → 화주사)
export const affiliationShape = {
  centerIds: z.array(idSchema).max(50).default([]),
  shipperId: z
    .union([z.literal(''), idSchema])
    .optional()
    .transform((value) => value || undefined),
  permissionGroupIds: z.array(idSchema).max(50).default([]),
}

// 유형별 소속 규칙을 칸 오류로 (centerIds / shipperId)
function checkAffiliation(
  data: { userType: UserTypeValue; centerIds: bigint[]; shipperId?: bigint },
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
    ...profileShape,
    ...passwordChoiceShape,
    ...affiliationShape,
  })
  .superRefine((data, ctx) => checkPasswordChoice(data, ctx, data.username))
  .superRefine(checkAffiliation)

// 수정 (서버): 아이디·유형은 바꿀 수 없다. 소속 규칙은 서버가 저장된 유형으로 확인한다
export const updateUserSchema = z.object({
  id: idSchema,
  // 화면이 불러온 버전 (동시 수정 막기)
  rowVersion: rowVersionField,
  name: nameSchema,
  email: emailSchema,
  ...profileShape,
  ...affiliationShape,
})

// 수정 (화면): 지금 유형으로 소속 규칙까지 먼저 확인한다 (id·유형은 화면이 들고 있는 값)
export const updateUserFormSchema = z
  .object({
    userType: z.enum(USER_TYPES),
    name: nameSchema,
    email: emailSchema,
    ...profileShape,
    ...affiliationShape,
  })
  .superRefine(checkAffiliation)

// 화면 입력값 (등록·수정 같은 모양)
export type UserFormValue = {
  username: string
  name: string
  userType: UserTypeValue
  email: string
  phone: string
  deptName: string
  positionName: string
  empNo: string
  passwordMode: PasswordMode
  password: string
  passwordConfirm: string
  centerIds: string[]
  shipperId: string
  permissionGroupIds: string[]
}
