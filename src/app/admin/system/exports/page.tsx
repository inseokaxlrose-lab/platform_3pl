import type { Metadata } from 'next'
import { AppPage } from '@/components/app-page'
import { AccessDenied } from '@/components/permission'
import { ExportsPanel } from '@/components/reports'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { buildReportAction } from './actions'

export const metadata: Metadata = { title: '자료 추출' }

// 정산·보고용 자료 추출 (0064): 기간별 입고 실적·재고 수불·현재 재고 엑셀
export default async function ExportsPage() {
  if (!(await hasPermission('system.exports.read'))) return <AccessDenied />
  const [options, canExport] = await Promise.all([
    getStockFilterOptions(await getCurrentScope()),
    hasPermission('system.exports.export'),
  ])
  return (
    <AppPage
      title="자료 추출"
      description="정산·보고에 쓰는 자료를 엑셀로 내려받습니다. 수량은 기본단위입니다."
    >
      <ExportsPanel
        centers={options.centers}
        shippers={options.shippers}
        canExport={canExport}
        buildAction={buildReportAction}
      />
    </AppPage>
  )
}
