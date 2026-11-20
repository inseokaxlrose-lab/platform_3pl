import { z } from 'zod'
import { CARRIER_STATUS } from '@/lib/carriers/carrier-codes'
import { idField, optionalIdSchema } from '@/lib/id'
import { oneOf, optionalText, optionalTime, requiredText } from '@/lib/validation/common-fields'

// 배송 코스 입력 규칙 — 화면·서버 공용 (docs/decisions/0095)
// 센터·코스 코드는 등록할 때만 (코드는 센터 안에서 고유, 등록 후 불변)

export const routeCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '코스 코드를 입력해 주세요.')
  .max(20, '20자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9_-]+$/, '코드는 영문·숫자·하이픈·밑줄입니다.')

// 요일 7글자 (월~일 Y/N)
export const weekdaysField = z
  .string()
  .regex(/^[YN]{7}$/, '요일을 골라 주세요.')
  .refine((value) => value.includes('Y'), '요일을 하나 이상 골라 주세요.')

const shape = {
  custCode: optionalText(50),
  name: requiredText('코스명을 입력해 주세요.', 100),
  carrierId: optionalIdSchema,
  runDays: weekdaysField,
  cutoffTime: optionalTime,
  vehicleTon: optionalText(20),
  destHub: optionalText(100),
  status: oneOf(CARRIER_STATUS.values, '상태를 골라 주세요.'),
  sortOrder: z.number().int().min(0).max(9999),
  remark: optionalText(1000),
}

export const routeSchema = z.object(shape)
export const routeCreateSchema = z.object({
  centerId: idField('센터를 골라 주세요.'),
  code: routeCodeField,
  ...shape,
})

export type RouteInput = z.input<typeof routeSchema>
export type RouteData = z.output<typeof routeSchema>
export type RouteCreateInput = z.input<typeof routeCreateSchema>
export type RouteCreateData = z.output<typeof routeCreateSchema>
