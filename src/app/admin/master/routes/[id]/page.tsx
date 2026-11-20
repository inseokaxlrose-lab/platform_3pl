import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { RouteForm } from '../route-form'
import { RouteZipPanel } from '../route-zip-panel'
import { getRouteForEdit, getRouteOptions } from '../queries'

export const metadata: Metadata = { title: '배송 코스 수정' }

// 배송 코스 수정 (0095): 기본 정보·운행 + 우편번호 배정 (따로 처리하는 섹션)
export default async function EditRoutePage({ params }: PageProps<'/admin/master/routes/[id]'>) {
  if (!(await hasPermission('master.routes.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [found, canUpdate] = await Promise.all([
    getRouteForEdit(id, scope),
    hasPermission('master.routes.update'),
  ])
  if (!found) notFound()
  const { carrierId, zips, ...route } = found
  const options = await getRouteOptions(scope, carrierId === null ? [] : [carrierId])
  return (
    <RouteForm
      key={route.rowVersion}
      header={{
        title: `${route.input.name} (${route.input.code})`,
        description: `${route.centerName} · 납품처 직접 지정 ${route.manualShipToCount}곳`,
        actions: <BackToListButton listPath="/admin/master/routes" />,
      }}
      route={route}
      options={options}
      readOnly={!canUpdate}
      extraSections={[
        {
          id: 'zips',
          title: '우편번호 배정',
          standalone: true,
          description:
            '이 우편번호의 납품처는 배송센터가 이 센터이면 이 코스로 갑니다 (납품처에 코스를 직접 지정했으면 그 코스).',
          content: <RouteZipPanel routeId={route.id} centerName={route.centerName} zips={zips} />,
        },
      ]}
    />
  )
}
