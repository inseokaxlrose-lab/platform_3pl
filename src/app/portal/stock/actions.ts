'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listStock } from '@/lib/stock/stock-list'

// 화주 포털 · 내 재고 (docs/decisions/0063) — 권한 portal.stock.*, 데이터 범위: 자기 화주사의 재고만
export const listPortalStockAction = createAction({
  permission: 'portal.stock.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (scope.kind !== 'SHIPPER')
      throw new ActionError('FORBIDDEN', '화주사 사용자만 쓸 수 있습니다.')
    if (input.exportAll && !permissions.has('portal.stock.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    // 화주사 조건은 데이터 범위가 정한다 (화면이 보낸 화주사 값은 쓰지 않는다)
    const { shipper, ...filters } = input.filters
    void shipper
    return listStock({ ...input, filters }, scope)
  },
})
