import { z } from 'zod'
import { optionalIdSchema } from '@/lib/id'
import { requiredText } from '@/lib/validation/common-fields'

// 구역 입력 규칙 (docs/decisions/0075) — 창고 수정 화면의 "구역" 표 한 줄
// 표의 칸은 모두 글자로 주고받고(EditableSubTable), 숫자 칸은 여기서 숫자로 바꾼다

export const ZONE_TYPE_GROUP = 'ZONE_TYPE'
export const EMPTY_ZONE = {
  id: '',
  code: '',
  name: '',
  type: 'STORAGE',
  pickSeq: '',
  sortOrder: '10',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  // 화면 표시용 (저장하지 않음)
  locationCount: 0,
}
export type ZoneRow = typeof EMPTY_ZONE

const seqText = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .refine(
      (value) => (required ? /^\d{1,4}$/ : /^\d{0,4}$/).test(value),
      `${label}는 0~9999 숫자입니다.`,
    )
    .transform((value) => (value === '' ? null : Number(value)))

export const zoneRowSchema = z.object({
  // 숨은 줄 키: 있으면 그 구역을 고치고, 없으면 새로 만든다
  id: optionalIdSchema.default(null),
  // 구역코드: 영문 대문자·숫자 1~10자, 창고 안 중복 금지, 저장 후에는 바꿀 수 없다 (로케이션 코드 앞자리)
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, '구역코드를 입력해 주세요.')
    .max(10, '10자 이하입니다.')
    .regex(/^[A-Z0-9]*$/, '영문 대문자·숫자만 씁니다.'),
  name: requiredText('구역명을 입력해 주세요.', 100),
  // 공통코드 ZONE_TYPE (서버가 확인)
  type: z.string().trim().min(1, '구역 유형을 골라 주세요.'),
  pickSeq: seqText('피킹 순서', false),
  sortOrder: seqText('정렬순서', true).transform((value) => value ?? 10),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  locationCount: z.number().optional(),
})

// 같은 표 안에서 구역코드 중복 금지
export const zonesSchema = z.array(zoneRowSchema).superRefine((rows, ctx) => {
  const seen = new Map<string, number>()
  rows.forEach((row, index) => {
    const code = row.code.trim().toUpperCase()
    if (seen.has(code)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'code'],
        message: '같은 구역코드가 이미 있습니다.',
      })
    }
    seen.set(code, index)
  })
})

export type ZoneData = z.output<typeof zoneRowSchema>
