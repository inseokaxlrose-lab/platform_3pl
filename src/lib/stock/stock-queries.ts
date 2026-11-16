import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY } from '@/lib/status'

// 재고 화면의 검색 선택지 (docs/decisions/0060): 범위 안의 센터·창고·화주사
export async function getStockFilterOptions(scope: DataScope) {
  const [centers, warehouses, shippers] = await Promise.all([
    prisma.center.findMany({
      where: { AND: [scopeFilter(scope, { center: 'id', shipper: 'shippers.some.shipperId' })] },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.warehouse.findMany({
      where: {
        AND: [
          scopeFilter(scope, { center: 'centerId', shipper: 'center.shippers.some.shipperId' }),
        ],
      },
      select: { id: true, code: true, name: true, centerId: true },
      orderBy: [{ centerId: 'asc' }, { code: 'asc' }],
    }),
    prisma.shipper.findMany({
      where: {
        AND: [scopeFilter(scope, { center: 'centers.some.centerId', shipper: 'id' }), ACTIVE_ONLY],
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ])
  return textIds({ centers, warehouses, shippers })
}

export type StockFilterOptions = Awaited<ReturnType<typeof getStockFilterOptions>>
