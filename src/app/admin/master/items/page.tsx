import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ItemsList } from '@/components/item'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getItemFormOptions } from '@/lib/items/item-queries'
import {
  deleteItemsAction,
  listItemsAction,
  restoreItemsAction,
  setItemsActiveAction,
} from './actions'

export const metadata: Metadata = { title: '품목' }

// 품목 목록 (docs/decisions/0041)
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
