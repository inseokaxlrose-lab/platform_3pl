'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listStock } from '@/lib/stock/stock-list'
import { changeStatusOfStock } from '@/lib/stock/stock-status'
import { stockStatusChangeSchema } from '@/lib/stock/stock-status-schema'

// 재고 조회 서버 액션 (docs/decisions/0060) — 권한 stock.inventory.*, 데이터 범위: 센터 직원은 소속 센터
export const listStockAction = createAction({
  permission: 'stock.inventory.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('stock.inventory.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listStock(input, scope)
  },
})

// 재고상태 변경 (0088): 정상 ↔ 보류·불량·격리, 권한 stock.inventory.update
export const changeStockStatusAction = createAction({
  permission: 'stock.inventory.update',
  input: stockStatusChangeSchema,
  handler: async ({ input, scope }) => changeStatusOfStock(input, scope),
})
