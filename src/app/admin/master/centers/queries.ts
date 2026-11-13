import 'server-only'
import type { CenterInput } from '@/lib/centers/center-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'

// 수정 화면용 센터 한 건 (데이터 범위 밖이면 null → 화면은 "찾을 수 없음")
export async function getCenterForEdit(id: string, scope: DataScope) {
  if (!isInScope(scope, { id }, { center: 'id' })) return null
  const center = await prisma.center.findUnique({
    where: { id },
    include: {
      warehouses: {
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          type: true,
          isActive: true,
          _count: { select: { locations: true } },
        },
        orderBy: [{ type: 'desc' }, { code: 'asc' }],
      },
    },
  })
  if (!center) return null
  const text = (value: string | null) => value ?? ''
  const input: CenterInput = {
    code: center.code,
    name: center.name,
    phone: text(center.phone),
    fax: text(center.fax),
    managerName: text(center.managerName),
    managerPhone: text(center.managerPhone),
    zipCode: text(center.zipCode),
    address: text(center.address),
    addressDetail: text(center.addressDetail),
    externalCodes: await getExternalCodes('CENTER', id),
  }
  return {
    id: center.id,
    systemCode: center.systemCode,
    isActive: center.isActive,
    input,
    warehouses: center.warehouses.map(({ _count, ...w }) => ({
      ...w,
      locationCount: _count.locations,
    })),
  }
}

export type CenterForEdit = NonNullable<Awaited<ReturnType<typeof getCenterForEdit>>>
