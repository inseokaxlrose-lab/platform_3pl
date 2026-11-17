import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getBaseUnits, nextUnitSortOrder } from '../queries'
import { UnitForm } from '../unit-form'

export const metadata: Metadata = { title: '단위 추가' }

// 단위 추가 (운영사 추가 단위, 0078). 시스템 기본 단위는 마이그레이션으로만 추가한다
export default async function NewUnitPage() {
  if (!(await hasPermission('master.units.create'))) return <AccessDenied />
  const scope = await getCurrentScope()
  const [baseUnits, nextSortOrder] = await Promise.all([getBaseUnits(), nextUnitSortOrder(scope)])
  return (
    <UnitForm
      header={{
        title: '단위 추가',
        description:
          '시스템 기본 단위에 없는 단위만 추가합니다. 코드·유형은 등록 후 바꿀 수 없습니다.',
        actions: <BackToListButton listPath="/admin/master/units" />,
      }}
      baseUnits={baseUnits}
      nextSortOrder={nextSortOrder}
      readOnly={false}
    />
  )
}
