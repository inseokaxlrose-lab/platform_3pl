import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
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
  // 기준정보 준비가 되는 센터(준비중·운영중)만
  const centers = await getCenterOptions(await getCurrentScope(), { setupOnly: true })
  const { centerId } = await searchParams
  // 고를 수 있는 센터일 때만 미리 고른다 (범위 밖 id를 넣어도 무시)
  const initialCenterId =
    typeof centerId === 'string' && centers.some((c) => c.id === centerId) ? centerId : undefined

  return (
    <WarehouseForm
      header={{
        actions: <BackToListButton listPath="/admin/master/warehouses" />,
        title: '창고 등록',
        description: '창고코드는 센터 안에서 겹치지 않게 정하며, 등록 후에는 바꿀 수 없습니다.',
      }}
      mode="create"
      centers={centers}
      initialCenterId={initialCenterId}
    />
  )
}
