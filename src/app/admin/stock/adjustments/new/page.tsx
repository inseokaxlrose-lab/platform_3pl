import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { AdjustForm } from '@/components/stock'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { createAdjustAction, listAdjustStockOptionsAction } from '../actions'

export const metadata: Metadata = { title: '실사·조정 등록' }

// 재고 실사·조정 등록 (0061): 등록만으로는 재고가 바뀌지 않는다
export default async function NewAdjustmentPage() {
  if (!(await hasPermission('stock.adjustments.create'))) return <AccessDenied />
  const options = await getStockFilterOptions(await getCurrentScope())
  return (
    <AdjustForm
      header={{
        title: '실사·조정 등록',
        description: '등록한 뒤 관리자가 확정하면 재고가 바뀝니다. 사유는 꼭 고릅니다.',
        actions: <BackToListButton listPath="/admin/stock/adjustments" />,
      }}
      centers={options.centers}
      loadStocks={listAdjustStockOptionsAction}
      createAction={createAdjustAction}
    />
  )
}
