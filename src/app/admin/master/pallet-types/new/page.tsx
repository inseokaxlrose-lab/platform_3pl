import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { PalletTypeForm } from '../pallet-type-form'
import { getPalletTypeCopy } from '../queries'

export const metadata: Metadata = { title: '팔레트 종류 등록' }

// 팔레트 종류 등록 (0083): ?copy=T11 → 시스템 기본 값을 채워 열고, 같은 코드로 저장하면 이 운영사 값으로 덮어쓴다
export default async function NewPalletTypePage({
  searchParams,
}: PageProps<'/admin/master/pallet-types/new'>) {
  if (!(await hasPermission('master.units.create'))) return <AccessDenied />
  const { copy } = await searchParams
  const scope = await getCurrentScope()
  const initial =
    scope.operatorId === undefined
      ? undefined
      : await getPalletTypeCopy(scope.operatorId, typeof copy === 'string' ? copy : undefined)
  return (
    <PalletTypeForm
      header={{
        title: '팔레트 종류 등록',
        description: initial
          ? `${initial.code}의 값을 이 운영사 값으로 덮어씁니다.`
          : '시스템 기본과 같은 코드로 등록하면 이 운영사 값으로 덮어씁니다.',
        actions: <BackToListButton listPath="/admin/master/pallet-types" />,
      }}
      initial={initial}
      readOnly={false}
    />
  )
}
