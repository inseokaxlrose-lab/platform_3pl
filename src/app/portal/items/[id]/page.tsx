import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getItemForEdit, getItemFormOptions } from '@/lib/items/item-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  createPortalItemAction,
  setPortalItemsActiveAction,
  updatePortalItemAction,
} from '../actions'

export const metadata: Metadata = { title: '품목 수정' }

// 화주 포털 · 품목 수정 (0041): 자기 화주사 품목만 (다른 화주사 키면 "찾을 수 없음")
export default async function PortalItemPage({ params }: PageProps<'/portal/items/[id]'>) {
  if (!(await hasPermission('portal.items.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  if (scope.kind !== 'SHIPPER') return <AccessDenied />
  const [item, options, canUpdate] = await Promise.all([
    getItemForEdit(id, scope),
    getItemFormOptions(scope),
    hasPermission('portal.items.update'),
  ])
  if (!item) notFound()

  return (
    <ItemForm
      header={{
        title: `${item.input.name} (${item.input.code})`,
        actions: <BackToListButton listPath="/portal/items" />,
      }}
      options={options}
      item={item}
      readOnly={!canUpdate}
      basePath="/portal/items"
      canToggleActive={canUpdate}
      showExternalCodes={false}
      createAction={createPortalItemAction}
      updateAction={updatePortalItemAction}
      setActiveAction={setPortalItemsActiveAction}
    />
  )
}
