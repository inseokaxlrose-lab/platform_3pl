import { z } from 'zod'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import { requiredText, userCodeField } from '@/lib/validation/common-fields'
import { STORAGE_CONDITIONS } from './warehouse-labels'

// 창고 입력 규칙 — 화면·서버 공용 (docs/decisions/0027)
// 유형은 입력받지 않는다: 사용자가 만드는 창고는 항상 일반, 입고대기는 센터 등록 때 자동으로만

const warehouseFields = {
  // 사용자 코드: 같은 센터 안에서 중복 금지, 비우면 시스템 코드
  code: userCodeField('창고 코드'),
  name: requiredText('창고명을 입력해 주세요.', 50),
  storageCondition: z.enum(STORAGE_CONDITIONS, '보관 조건을 골라 주세요.'),
  externalCodes: externalCodesSchema,
}

// 등록: 어느 센터의 창고인지 함께 (등록 후에는 센터를 바꿀 수 없다)
export const createWarehouseSchema = z.object({
  centerId: z.string().min(1, '센터를 골라 주세요.'),
  ...warehouseFields,
})

export const updateWarehouseSchema = z.object(warehouseFields)

export type WarehouseCreateInput = z.input<typeof createWarehouseSchema>
export type WarehouseUpdateInput = z.input<typeof updateWarehouseSchema>
export type WarehouseUpdateData = z.output<typeof updateWarehouseSchema>
