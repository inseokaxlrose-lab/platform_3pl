import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { AdjustsList } from '@/components/stock'
import { Button } from '@/components/ui/button'
import { getStockFilterOptions } from '@/lib/stock/stock-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listAdjustsAction } from './actions'

export const metadata: Metadata = { title: '실사·조정' }

// 재고 실사·조정 목록 (0061)
export default async function AdjustmentsPage() {
  if (!(await hasPermission('stock.adjustments.read'))) return <AccessDenied />
  const [options, canCreate] = await Promise.all([
    getStockFilterOptions(await getCurrentScope()),
    hasPermission('stock.adjustments.create'),
  ])
  return (
    <AdjustsList
      centers={options.centers}
      listAction={listAdjustsAction}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/stock/adjustments/new">
              <PlusIcon />
              실사·조정 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
