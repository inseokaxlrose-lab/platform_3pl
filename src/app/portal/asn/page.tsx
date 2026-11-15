import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listPortalAsnsAction } from './actions'

export const metadata: Metadata = { title: 'ASN 조회' }

// 화주 포털 · ASN 조회 (0051): 자기 화주사의 ASN
export default async function PortalAsnsPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('portal.asn.read')) || scope.kind !== 'SHIPPER') return <AccessDenied />
  const [options, canCreate] = await Promise.all([
    getAsnFormOptions(scope),
    hasPermission('portal.asn.create'),
  ])
  return (
    <AsnsList
      gridId="portal-asn"
      basePath="/portal/asn"
      shippers={null}
      centers={options.centers}
      canExport={false}
      listAction={listPortalAsnsAction}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/portal/asn/new">
              <PlusIcon />
              ASN 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
