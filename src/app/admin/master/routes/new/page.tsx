import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { RouteForm } from '../route-form'
import { getRouteOptions } from '../queries'

export const metadata: Metadata = { title: '배송 코스 등록' }

// 배송 코스 등록 (0095): 우편번호 배정은 저장한 뒤 수정 화면에서
export default async function NewRoutePage() {
  if (!(await hasPermission('master.routes.create'))) return <AccessDenied />
  const options = await getRouteOptions(await getCurrentScope())
  return (
    <RouteForm
      header={{
        title: '배송 코스 등록',
        description: '저장하면 수정 화면에서 이 코스로 보낼 우편번호를 배정합니다.',
        actions: <BackToListButton listPath="/admin/master/routes" />,
      }}
      options={options}
      readOnly={false}
    />
  )
}
