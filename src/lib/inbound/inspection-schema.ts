import { z } from 'zod'
import { idField } from '@/lib/id'
import { optionalText } from '@/lib/validation/common-fields'
import { optionalDate } from './asn-schema'

// 입고 검수 입력 규칙 — 화면·서버 공용 (docs/decisions/0053)
// 수량은 고른 단위로 (기본단위 환산·소수 자리·로트 필수 여부는 서버가 품목을 보고 검사)

const qtyText = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+(\.\d{1,6})?$/.test(value), message)
    .transform((value) => value || '0')

export const inspectionSchema = z
  .object({
    asnLineId: idField('검수할 품목(ASN 줄)을 골라 주세요.'),
    unit: z.string().trim().min(1, '단위를 골라 주세요.'),
    // 검수 수량(정상)·불량 수량: 비우면 0, 둘 중 하나는 0보다 커야 한다
    qty: qtyText('검수 수량은 0 이상의 숫자로 넣어 주세요.'),
    defectQty: qtyText('불량 수량은 0 이상의 숫자로 넣어 주세요.'),
    lotNo: optionalText(50),
    expiryOn: optionalDate,
    // 불량 사유 (공통코드 DEFECT_REASON): 불량 수량이 있으면 필수 (0087)
    defectReasonCd: z.string().trim().max(20).default(''),
    remark: optionalText(200),
  })
  .refine((v) => /[1-9]/.test(v.qty) || /[1-9]/.test(v.defectQty), {
    message: '검수 수량이나 불량 수량을 넣어 주세요.',
    path: ['qty'],
  })
  .refine((v) => !/[1-9]/.test(v.defectQty) || v.defectReasonCd !== '', {
    message: '불량 사유를 골라 주세요.',
    path: ['defectReasonCd'],
  })

export type InspectionInput = z.input<typeof inspectionSchema>
export type InspectionData = z.output<typeof inspectionSchema>

export const EMPTY_INSPECTION: InspectionInput = {
  asnLineId: '',
  unit: '',
  qty: '',
  defectQty: '',
  lotNo: '',
  expiryOn: '',
  defectReasonCd: '',
  remark: '',
}

// 검수할 수 있는 ASN 상태 (마감·삭제 제외)
export const INSPECTABLE_STATUSES = ['PLANNED', 'INSPECTING', 'PARTIAL', 'COMPLETED'] as const
