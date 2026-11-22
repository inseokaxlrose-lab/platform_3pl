import type { Metadata } from 'next'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getItemFormOptions } from '@/lib/items/item-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  createPortalItemAction,
  listPortalSetComponentOptionsAction,
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
        description:
          '품목코드는 비워 두면 자동으로 붙고 등록 후 바꿀 수 없습니다. 화주 시스템의 코드는 사용자 정의 코드에 넣습니다. 기한·LOT 관리는 화주사 설정을 기본값으로 가져옵니다.',
        actions: <BackToListButton listPath="/portal/items" />,
      }}
      options={options}
      readOnly={false}
      basePath="/portal/items"
      fixedShipperId={String(scope.shipperId)}
      createAction={createPortalItemAction}
      updateAction={updatePortalItemAction}
      setActiveAction={setPortalItemsActiveAction}
      loadComponentOptions={listPortalSetComponentOptionsAction}
    />
  )
}
