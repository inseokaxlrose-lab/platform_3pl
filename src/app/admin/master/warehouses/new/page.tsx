import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from '../queries'
import { WarehouseForm } from '../warehouse-form'

export const metadata: Metadata = { title: '창고 등록' }

// 창고 등록: ?centerId= 로 들어오면 그 센터를 미리 고른다 (센터 상세의 [창고 추가])
export default async function NewWarehousePage({
  searchParams,
}: PageProps<'/admin/master/warehouses/new'>) {
  if (!(await hasPermission('master.warehouses.create'))) return <AccessDenied />
  const centers = await getCenterOptions(await getCurrentScope())
  const { centerId } = await searchParams
  // 고를 수 있는 센터일 때만 미리 고른다 (범위 밖 id를 넣어도 무시)
  const initialCenterId =
    typeof centerId === 'string' && centers.some((c) => c.id === centerId) ? centerId : undefined

  return (
    <>
      <PageHeader
        title="창고 등록"
        description="창고 코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다."
      />
      <WarehouseForm mode="create" centers={centers} initialCenterId={initialCenterId} />
    </>
  )
}
