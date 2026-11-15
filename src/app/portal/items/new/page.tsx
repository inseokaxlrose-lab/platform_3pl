import type { Metadata } from 'next'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getItemFormOptions } from '@/lib/items/item-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  createPortalItemAction,
  setPortalItemsActiveAction,
  updatePortalItemAction,
} from '../actions'

export const metadata: Metadata = { title: '품목 등록' }

// 화주 포털 · 품목 등록 (0041): 화주사는 자기 화주사로 고정, 외부 코드는 숨김
export default async function PortalNewItemPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('portal.items.create')) || scope.kind !== 'SHIPPER') {
    return <AccessDenied />
  }
  const options = await getItemFormOptions(scope)
  return (
    <ItemForm
      header={{
        title: '품목 등록',
        description: '품목코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다.',
        actions: <BackToListButton listPath="/portal/items" />,
      }}
      options={options}
      readOnly={false}
      basePath="/portal/items"
      fixedShipperId={String(scope.shipperId)}
      showExternalCodes={false}
      createAction={createPortalItemAction}
      updateAction={updatePortalItemAction}
      setActiveAction={setPortalItemsActiveAction}
    />
  )
}
