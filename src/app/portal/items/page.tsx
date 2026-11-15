import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ItemsList } from '@/components/item'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import {
  deletePortalItemsAction,
  listPortalItemsAction,
  restorePortalItemsAction,
  setPortalItemsActiveAction,
} from './actions'

export const metadata: Metadata = { title: '품목' }

// 화주 포털 · 품목 목록 (0041): 자기 화주사의 품목만
export default async function PortalItemsPage() {
  if (!(await hasPermission('portal.items.read'))) return <AccessDenied />
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    hasPermission('portal.items.create'),
    hasPermission('portal.items.update'),
    hasPermission('portal.items.delete'),
  ])
  return (
    <ItemsList
      gridId="portal-items"
      basePath="/portal/items"
      shippers={null}
      can={{ update: canUpdate, delete: canDelete, export: false }}
      listAction={listPortalItemsAction}
      setActiveAction={setPortalItemsActiveAction}
      deleteAction={deletePortalItemsAction}
      restoreAction={restorePortalItemsAction}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/portal/items/new">
              <PlusIcon />
              품목 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
