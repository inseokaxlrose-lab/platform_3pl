import { z } from 'zod'
import { optionalIdSchema } from '@/lib/id'
import { oneOf, optionalText, requiredText } from '@/lib/validation/common-fields'
import { HOLIDAY_DAY_TYPE } from './holiday-codes'

// 운영사 개별 휴일 입력 규칙 — 화면·서버 공용 (docs/decisions/0096)
// 센터를 비우면 운영사 전체. 같은 범위(운영사 전체 / 센터)에 같은 날짜는 한 건

export const requiredDateText = z
  .string()
  .trim()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)),
    '날짜를 입력해 주세요.',
  )

export const operatorHolidaySchema = z.object({
  centerId: optionalIdSchema,
  holidayOn: requiredDateText,
  name: requiredText('휴일 이름을 입력해 주세요.', 100),
  dayType: oneOf(HOLIDAY_DAY_TYPE.values, '구분을 골라 주세요.'),
  remark: optionalText(1000),
})

export type OperatorHolidayInput = z.input<typeof operatorHolidaySchema>
export type OperatorHolidayData = z.output<typeof operatorHolidaySchema>
