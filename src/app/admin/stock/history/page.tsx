import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { HistoryList } from '@/components/stock'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listStockHistoryAction } from './actions'

export const metadata: Metadata = { title: '재고 이력' }

// 재고 이력 조회 (0062)
export default async function StockHistoryPage() {
  if (!(await hasPermission('stock.history.read'))) return <AccessDenied />
  const [options, canExport] = await Promise.all([
    getStockFilterOptions(await getCurrentScope()),
    hasPermission('stock.history.export'),
  ])
  return <HistoryList options={options} canExport={canExport} listAction={listStockHistoryAction} />
}
