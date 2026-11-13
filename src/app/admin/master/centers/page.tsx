import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CentersGrid } from './centers-grid'

export const metadata: Metadata = { title: '센터' }

// 센터 목록 (docs/decisions/0026): 센터 직원은 소속 센터만 보인다
export default async function CentersPage() {
  if (!(await hasPermission('master.centers.read'))) return <AccessDenied />
  // 등록은 운영사(전체 범위)만
  const canCreate =
    (await hasPermission('master.centers.create')) && (await getCurrentScope()).kind === 'ALL'

  return (
    <>
      <PageHeader
        title="센터"
        description="물류센터를 등록합니다. 등록하면 입고대기 창고와 기본 로케이션이 자동으로 만들어집니다."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/admin/master/centers/new">
                <PlusIcon />
                센터 등록
              </Link>
            </Button>
          )
        }
      />
      <CentersGrid />
    </>
  )
}
