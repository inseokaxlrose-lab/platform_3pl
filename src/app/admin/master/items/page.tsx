import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ItemsList } from '@/components/item'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getItemFormOptions } from '@/lib/items/item-queries'
import {
  applyPalletBulkAction,
  commitItemUploadAction,
  deleteItemsAction,
  listItemsAction,
  restoreItemsAction,
  setItemsActiveAction,
  setItemsStatusAction,
  validateItemUploadAction,
} from './actions'

export const metadata: Metadata = { title: '품목' }

// 품목 목록 (docs/decisions/0041, 0083 ②: 상태 일괄 변경·팔레트 일괄 입력·엑셀 업로드는 운영사 화면만)
export default async function ItemsPage() {
  if (!(await hasPermission('master.items.read'))) return <AccessDenied />
  const [options, canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    getItemFormOptions(await getCurrentScope()),
    hasPermission('master.items.create'),
    hasPermission('master.items.update'),
    hasPermission('master.items.delete'),
    hasPermission('master.items.export'),
  ])
  return (
    <ItemsList
      gridId="master-items"
      basePath="/admin/master/items"
      shippers={options.shippers}
      listAction={listItemsAction}
      setActiveAction={setItemsActiveAction}
      deleteAction={deleteItemsAction}
      restoreAction={restoreItemsAction}
      can={{ update: canUpdate, delete: canDelete, export: canExport }}
      admin={{
        setStatusAction: setItemsStatusAction,
        palletBulkAction: applyPalletBulkAction,
        pallets: options.pallets,
        defaultPalletType: options.defaultPalletType,
        upload:
          canCreate && canUpdate
            ? { validate: validateItemUploadAction, commit: commitItemUploadAction }
            : undefined,
      }}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/master/items/new">
              <PlusIcon />
              품목 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
