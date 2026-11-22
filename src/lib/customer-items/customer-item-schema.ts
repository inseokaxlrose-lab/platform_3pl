import { z } from 'zod'
import { idField, optionalIdSchema } from '@/lib/id'
import {
  optionalCount,
  optionalDecimal,
  optionalText,
  requiredText,
} from '@/lib/validation/common-fields'

// 거래처별 품목코드 입력 규칙 — 화면·서버 공용 (docs/decisions/0098)
// 같은 화주사의 거래처(매출처)와 품목, 거래처 품목코드는 거래처 안에서 고유 (서버가 확인)
export const customerItemSchema = z.object({
  customerId: idField('거래처를 골라 주세요.'),
  itemId: idField('품목을 골라 주세요.'),
  // 거래처의 상품코드 (영문·숫자 외 글자도 쓰는 곳이 있어 글자 종류는 막지 않는다)
  custItemCode: requiredText('거래처 품목코드를 입력해 주세요.', 50),
  custItemName: optionalText(200),
  custBarcode: optionalText(50),
  // 납품 단위: 품목의 단위 중 하나 (비우면 품목의 기본 주문단위)
  deliveryUnitId: optionalIdSchema,
  // 최소 잔여 유통기한 — 이 품목만 거래처 값과 다를 때 (거래처 화면과 같은 범위)
  minShelfDays: optionalCount.refine((v) => v === null || v <= 9999, '9999일 이하입니다.'),
  minShelfRatio: optionalDecimal(5, 2).refine(
    (v) => v === null || Number(v) <= 100,
    '100% 이하입니다.',
  ),
  isActive: z.boolean(),
  remark: optionalText(1000),
})

export type CustomerItemInput = z.input<typeof customerItemSchema>
export type CustomerItemData = z.output<typeof customerItemSchema>

export const EMPTY_CUSTOMER_ITEM: CustomerItemInput = {
  customerId: '',
  itemId: '',
  custItemCode: '',
  custItemName: '',
  custBarcode: '',
  deliveryUnitId: '',
  minShelfDays: null,
  minShelfRatio: '',
  isActive: true,
  remark: '',
}
