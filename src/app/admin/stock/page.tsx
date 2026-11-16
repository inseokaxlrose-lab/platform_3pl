import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { StockList } from '@/components/stock'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listStockAction } from './actions'

export const metadata: Metadata = { title: '재고 조회' }

// 재고 조회 (0060): 위치별 / 품목별 / 로트·유통기한별
export default async function StockPage() {
  if (!(await hasPermission('stock.inventory.read'))) return <AccessDenied />
  const [options, canExport] = await Promise.all([
    getStockFilterOptions(await getCurrentScope()),
    hasPermission('stock.inventory.export'),
  ])
  return (
    <StockList
      gridId="stock-inventory"
      title="재고 조회"
      description="지금 재고입니다 (기본단위). 보기 기준을 바꿔 위치별·품목별·로트·유통기한별로 봅니다."
      options={options}
      canExport={canExport}
      listAction={listStockAction}
    />
  )
}
