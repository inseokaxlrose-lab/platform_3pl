import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { StockList } from '@/components/stock'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listPortalStockAction } from './actions'

export const metadata: Metadata = { title: '내 재고' }

// 화주 포털 · 내 재고 (0063): 우리 회사가 맡긴 재고만, 위치별·품목별·로트·유통기한별
export default async function PortalStockPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('portal.stock.read')) || scope.kind !== 'SHIPPER') {
    return <AccessDenied />
  }
  const [options, canExport] = await Promise.all([
    getStockFilterOptions(scope),
    hasPermission('portal.stock.export'),
  ])
  return (
    <StockList
      gridId="portal-stock"
      title="내 재고"
      description="센터에 맡긴 우리 회사 재고입니다 (기본단위). 보기 기준을 바꿔 품목별 합계·유통기한별로 봅니다."
      options={{ centers: options.centers, warehouses: options.warehouses, shippers: null }}
      canExport={canExport}
      listAction={listPortalStockAction}
    />
  )
}
