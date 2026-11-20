import type { Metadata } from 'next'
import { formatDate } from '@/components/data-grid'
import { AccessDenied } from '@/components/permission'
import { getOperatorSettings } from '@/lib/settings/operator-settings'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { SettingsForm } from './settings-form'

export const metadata: Metadata = { title: '운영 설정' }

// 운영 설정 (docs/decisions/0092): 운영사가 바꾸는 키-값 설정
export default async function SettingsPage() {
  if (!(await hasPermission('system.settings.read'))) return <AccessDenied />
  const { operatorId } = await getCurrentScope()
  if (operatorId === undefined) return <AccessDenied />
  const [settings, canUpdate] = await Promise.all([
    getOperatorSettings(operatorId),
    hasPermission('system.settings.update'),
  ])
  const meta =
    settings.updatedAt && settings.updatedBy
      ? `마지막 수정: ${await actorLabel(settings.updatedBy)} · ${formatDate(settings.updatedAt, true)}`
      : '아직 바꾼 설정이 없습니다 (모두 기본값).'
  return (
    <SettingsForm
      // 저장하면 화면을 다시 읽어 처음 값부터 새로
      key={settings.updatedAt?.toISOString() ?? 'default'}
      header={{
        title: '운영 설정',
        description: '우리 운영사에만 적용되는 설정입니다. 칸을 비우면 사용하지 않습니다.',
        meta,
      }}
      initial={settings.values}
      readOnly={!canUpdate}
    />
  )
}
