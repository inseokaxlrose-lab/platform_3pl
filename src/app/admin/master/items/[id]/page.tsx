import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatDate } from '@/components/data-grid'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { createItemAction, setItemsActiveAction, updateItemAction } from '../actions'
import { getItemForEdit, getItemFormOptions } from '../queries'

export const metadata: Metadata = { title: '품목 수정' }

// 품목 수정 (범위 밖이면 "찾을 수 없음", 0041)
export default async function ItemPage({ params }: PageProps<'/admin/master/items/[id]'>) {
  if (!(await hasPermission('master.items.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [item, options, canUpdate] = await Promise.all([
    getItemForEdit(id, scope),
    getItemFormOptions(scope),
    hasPermission('master.items.update'),
  ])
  if (!item) notFound()
  const audit = await prisma.item.findUniqueOrThrow({
    where: { id },
    select: { updatedBy: true, updatedAt: true },
  })

  return (
    <ItemForm
      header={{
        title: `${item.input.name} (${item.input.code})`,
        description: item.shipper,
        meta: `마지막 수정: ${await actorLabel(audit.updatedBy)} · ${formatDate(audit.updatedAt, true)}`,
        actions: <BackToListButton listPath="/admin/master/items" />,
      }}
      options={options}
      item={item}
      readOnly={!canUpdate}
      basePath="/admin/master/items"
      canToggleActive={canUpdate}
      createAction={createItemAction}
      updateAction={updateItemAction}
      setActiveAction={setItemsActiveAction}
    />
  )
}
