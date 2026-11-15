import type { Metadata } from 'next'
import { ItemForm } from '@/components/item'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { createItemAction, setItemsActiveAction, updateItemAction } from '../actions'
import { getItemFormOptions } from '../queries'

export const metadata: Metadata = { title: '품목 등록' }

// 품목 등록 (데이터 범위 안의 화주사에만, 0041)
export default async function NewItemPage() {
  if (!(await hasPermission('master.items.create'))) return <AccessDenied />
  const options = await getItemFormOptions(await getCurrentScope())
  return (
    <ItemForm
      header={{
        title: '품목 등록',
        description: '품목코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다.',
        actions: <BackToListButton listPath="/admin/master/items" />,
      }}
      options={options}
      readOnly={false}
      basePath="/admin/master/items"
      createAction={createItemAction}
      updateAction={updateItemAction}
      setActiveAction={setItemsActiveAction}
    />
  )
}
