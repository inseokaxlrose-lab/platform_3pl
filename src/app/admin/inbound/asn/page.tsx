import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listAsnsAction } from './actions'

export const metadata: Metadata = { title: 'ASN 조회' }

// 운영사 화면 · ASN 조회 (0051)
export default async function AsnsPage() {
  if (!(await hasPermission('inbound.asn.read'))) return <AccessDenied />
  const [options, canCreate, canExport] = await Promise.all([
    getAsnFormOptions(await getCurrentScope()),
    hasPermission('inbound.asn.create'),
    hasPermission('inbound.asn.export'),
  ])
  return (
    <AsnsList
      gridId="inbound-asn"
      basePath="/admin/inbound/asn"
      shippers={options.shippers}
      centers={options.centers}
      canExport={canExport}
      listAction={listAsnsAction}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/inbound/asn/new">
              <PlusIcon />
              ASN 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
