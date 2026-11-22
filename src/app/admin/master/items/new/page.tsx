import type { Metadata } from 'next'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  createItemAction,
  listSetComponentOptionsAction,
  setItemsActiveAction,
  updateItemAction,
} from '../actions'
import { getItemFormOptions } from '@/lib/items/item-queries'

export const metadata: Metadata = { title: '품목 등록' }

// 품목 등록 (데이터 범위 안의 화주사에만, 0041)
export default async function NewItemPage() {
  if (!(await hasPermission('master.items.create'))) return <AccessDenied />
  const options = await getItemFormOptions(await getCurrentScope())
  return (
    <ItemForm
      header={{
        title: '품목 등록',
        description:
          '품목코드는 비워 두면 자동으로 붙고 등록 후 바꿀 수 없습니다. 화주 시스템의 코드는 사용자 정의 코드에 넣습니다. 기한·LOT 관리는 화주사 설정을 기본값으로 가져옵니다.',
        actions: <BackToListButton listPath="/admin/master/items" />,
      }}
      options={options}
      readOnly={false}
      basePath="/admin/master/items"
      createAction={createItemAction}
      updateAction={updateItemAction}
      setActiveAction={setItemsActiveAction}
      loadComponentOptions={listSetComponentOptionsAction}
    />
  )
}
