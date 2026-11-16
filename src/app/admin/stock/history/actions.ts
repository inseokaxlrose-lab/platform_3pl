'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listStockHistory } from '@/lib/stock/history-list'

// 재고 이력 조회 서버 액션 (docs/decisions/0062) — 권한 stock.history.*, 데이터 범위는 재고와 같다
export const listStockHistoryAction = createAction({
  permission: 'stock.history.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('stock.history.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listStockHistory(input, scope)
  },
})
