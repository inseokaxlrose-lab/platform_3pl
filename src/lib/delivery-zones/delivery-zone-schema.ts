import { z } from 'zod'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import { optionalText, requiredText, userCodeField } from '@/lib/validation/common-fields'
import { isRegionCode, overlapsWithin, regionLabel } from './regions'
import { idField } from '@/lib/id'

// 배송권역 입력 규칙 — 화면·서버 공용 (docs/decisions/0033)

export const MAX_ZONE_REGIONS = 300

export const deliveryZoneSchema = z.object({
  // 등록 후 바꿀 수 없다 (수정에서는 무시)
  centerId: idField('센터를 골라 주세요.'),
  // 사용자 코드: 같은 센터 안에서 중복 금지, 비우면 시스템 코드
  code: userCodeField('권역 코드'),
  name: requiredText('권역명을 입력해 주세요.', 50),
  description: optionalText(200),
  regionCodes: z
    .array(z.string())
    .min(1, '담당 지역을 1곳 이상 골라 주세요.')
    .max(MAX_ZONE_REGIONS, `담당 지역은 ${MAX_ZONE_REGIONS}곳까지입니다.`)
    .refine((codes) => codes.every(isRegionCode), '알 수 없는 지역이 섞여 있습니다.')
    // 같은 권역 안에서 겹침 금지 (예: 서울 전체 + 서울 종로구)
    .superRefine((codes, ctx) => {
      const [pair] = overlapsWithin([...new Set(codes)])
      if (pair) {
        ctx.addIssue({
          code: 'custom',
          message: `${regionLabel(pair[0])}와(과) ${regionLabel(pair[1])}이(가) 겹칩니다. 하나만 고르세요.`,
        })
      }
    })
    .transform((codes) => [...new Set(codes)]),
  externalCodes: externalCodesSchema,
})

export type DeliveryZoneInput = z.input<typeof deliveryZoneSchema>
export type DeliveryZoneData = z.output<typeof deliveryZoneSchema>
