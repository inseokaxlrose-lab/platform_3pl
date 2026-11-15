import { z } from 'zod'

// 권한그룹 입력 규칙 — 화면·서버 공용 (docs/decisions/0017)

export const ROLE_AREAS = ['ADMIN', 'PORTAL'] as const

const name = z.string().trim().min(1, '이름을 입력해 주세요.').max(50, '50자 이하로 입력해 주세요.')
const description = z.string().trim().max(200, '200자 이하로 입력해 주세요.').optional()
const permissionCodes = z.array(z.string().max(100)).max(500)

// 등록 (화면은 등록·수정 모두 이 모양으로 검사한다: 수정에서 영역은 바뀌지 않는 값)
export const roleSchema = z.object({
  name,
  area: z.enum(ROLE_AREAS),
  description,
  permissionCodes,
})

// 수정 (서버): 영역은 등록 후 바꿀 수 없다
export const updateRoleSchema = z.object({
  id: z.string().min(1),
  name,
  description,
  permissionCodes,
})

export type RoleFormValue = z.input<typeof roleSchema>
