'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { adjustSchema } from '@/lib/stock/adjust-schema'
import { getAdjustStockOptions, listAdjusts } from '@/lib/stock/adjust-queries'
import {
  assertAdjustsInScope,
  cancelAdjust,
  confirmAdjust,
  createAdjust,
} from '@/lib/stock/adjusts'

// 재고 실사·조정 서버 액션 (docs/decisions/0061) — 등록 stock.adjustments.create, 확정 stock.adjustments.confirm

export const listAdjustsAction = createAction({
  permission: 'stock.adjustments.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    if (input.exportAll) throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    return listAdjusts(input, scope)
  },
})

// 등록 화면: 센터를 고르면 그 센터의 재고 줄을 불러온다
export const listAdjustStockOptionsAction = createAction({
  permission: 'stock.adjustments.create',
  input: z.object({ centerId: idSchema }),
  handler: async ({ input, scope }) => getAdjustStockOptions(input.centerId, scope),
})

export const createAdjustAction = createAction({
  permission: 'stock.adjustments.create',
  input: adjustSchema,
  handler: async ({ input, scope }) => createAdjust(input, scope),
})

// 확정: 재고가 바뀐다 (관리자)
export const confirmAdjustAction = createAction({
  permission: 'stock.adjustments.confirm',
  input: z.object({ id: idSchema }),
  handler: async ({ input, scope }) => {
    await assertAdjustsInScope([input.id], scope)
    return confirmAdjust(input.id)
  },
})

// 취소: 등록 상태만 (등록 권한)
export const cancelAdjustAction = createAction({
  permission: 'stock.adjustments.create',
  input: z.object({ id: idSchema }),
  handler: async ({ input, scope }) => {
    await assertAdjustsInScope([input.id], scope)
    return cancelAdjust(input.id)
  },
})
