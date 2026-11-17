import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getBaseUnits, getUnitForEdit } from '../queries'
import { UnitForm } from '../unit-form'

export const metadata: Metadata = { title: '단위 수정' }

// 단위 수정 (0078): 시스템 기본 단위는 읽기 전용, 다른 운영사의 단위는 "찾을 수 없음"
export default async function EditUnitPage({ params }: PageProps<'/admin/master/units/[id]'>) {
  if (!(await hasPermission('master.units.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [unit, baseUnits, canUpdate] = await Promise.all([
    getUnitForEdit(id, await getCurrentScope()),
    getBaseUnits(),
    hasPermission('master.units.update'),
  ])
  if (!unit) notFound()
  return (
    <UnitForm
      header={{
        title: `${unit.input.name} (${unit.code})`,
        actions: <BackToListButton listPath="/admin/master/units" />,
      }}
      unit={unit}
      baseUnits={baseUnits}
      readOnly={!canUpdate}
    />
  )
}
