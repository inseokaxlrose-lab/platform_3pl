import { z } from 'zod'
import { optionalDecimal, optionalText, requiredText } from '@/lib/validation/common-fields'

// 팔레트 종류 입력 규칙 — 화면·서버 공용 (docs/decisions/0083). 규격은 cm·kg

// 필수 양수 (소수 2자리)
const requiredSize = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => /^\d{1,6}(\.\d{1,2})?$/.test(value.replace(/,/g, '')),
      `${label}를 0보다 큰 숫자로 입력해 주세요.`,
    )
    .transform((value) => value.replace(/,/g, ''))
    .refine((value) => Number(value) > 0, `${label}는 0보다 커야 합니다.`)

export const palletCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '코드를 입력해 주세요.')
  .max(20, '20자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9_-]+$/, '코드는 영문·숫자·하이픈·밑줄입니다.')

const shape = {
  name: requiredText('이름을 입력해 주세요.', 50),
  widthCm: requiredSize('가로'),
  depthCm: requiredSize('세로'),
  heightCm: requiredSize('높이'),
  weightKg: z
    .string()
    .trim()
    .refine(
      (value) => /^\d{1,6}(\.\d{1,2})?$/.test(value.replace(/,/g, '')),
      '자체 중량을 0 이상 숫자로 입력해 주세요.',
    )
    .transform((value) => value.replace(/,/g, '')),
  maxLoadHeightCm: optionalDecimal(8, 2),
  maxLoadWeightKg: optionalDecimal(10, 2),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  sortOrder: z.number().int().min(0).max(9999),
  remark: optionalText(1000),
}

const heightRule = (
  value: { heightCm: string; maxLoadHeightCm: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.maxLoadHeightCm !== null && Number(value.maxLoadHeightCm) <= Number(value.heightCm)) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxLoadHeightCm'],
      message: '권장 최대 적재 높이는 팔레트 높이보다 커야 합니다 (팔레트 포함 높이).',
    })
  }
}

export const palletTypeSchema = z.object(shape).superRefine(heightRule)
export const palletTypeCreateSchema = z
  .object({ code: palletCodeField, ...shape })
  .superRefine(heightRule)

export type PalletTypeInput = z.input<typeof palletTypeSchema>
export type PalletTypeData = z.output<typeof palletTypeSchema>
export type PalletTypeCreateInput = z.input<typeof palletTypeCreateSchema>
