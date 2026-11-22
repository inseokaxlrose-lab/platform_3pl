import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { SHIPPER_SCOPE } from './item-list'

// 세트 구성품으로 고를 수 있는 품목 (0098): 같은 화주사의 세트가 아닌 품목
// 사용 중지·단종 품목도 보인다(이미 넣은 구성품이 목록에서 사라지지 않게) — 상태는 설명에 붙인다
export async function getSetComponentOptions(shipperId: bigint, scope: DataScope) {
  const shipper = await prisma.shipper.findFirst({
    where: { AND: [{ id: shipperId }, scopeFilter(scope, SHIPPER_SCOPE)] },
    select: { id: true },
  })
  if (!shipper) return []
  const items = await prisma.item.findMany({
    where: { shipperId, itemType: { not: 'SET' } },
    select: {
      id: true,
      code: true,
      name: true,
      spec: true,
      status: true,
      baseUnit: { select: { code: true } },
    },
    orderBy: { code: 'asc' },
  })
  return textIds(
    items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      spec: item.spec,
      status: item.status,
      baseUnit: item.baseUnit.code,
    })),
  )
}

export type SetComponentOption = Awaited<ReturnType<typeof getSetComponentOptions>>[number]
