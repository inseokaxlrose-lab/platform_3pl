'use client'

import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { usePermission } from '@/components/permission'
import { PermissionMatrix } from '@/components/permission/permission-matrix'
import { Button } from '@/components/ui/button'
import { computePermissions } from '@/lib/permissions/compute-permissions'
import type { Overrides } from '@/lib/permissions/override-state'
import { areaOf, type UserTypeValue } from '@/lib/redirect'
import { updateUserOverridesAction } from './actions'
import { OverrideMatrix } from './override-matrix'
import type { UserOverrides } from './queries'

const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((code) => b.includes(code))

// 수정 화면의 개별 권한: 3단계 체크 표 + 최종 권한 미리보기 (0019)
export function OverridePanel({
  user,
  overrides: initial,
  isSelf,
}: {
  user: { id: string; userType: UserTypeValue; isActive: boolean }
  overrides: UserOverrides
  // 자기 자신의 개별 권한은 바꿀 수 없다 (서버에서도 막음)
  isSelf: boolean
}) {
  const router = useRouter()
  const canUpdate = usePermission().can('system.users.update')
  const [saved, setSaved] = useState<Overrides>(initial)
  const [value, setValue] = useState<Overrides>(initial)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const area = areaOf(user.userType)
  const includeOperatorOnly = user.userType === 'OPERATOR'
  const editable = canUpdate && !isSelf
  const dirty = !sameCodes(value.grants, saved.grants) || !sameCodes(value.denies, saved.denies)

  // 최종 권한 미리보기: 서버와 같은 계산 함수를 그대로 쓴다 (사용 중지 여부는 아래 안내로)
  const preview = [
    ...computePermissions({
      userType: user.userType,
      isActive: true,
      groupCodes: initial.groupCodes,
      grants: value.grants,
      denies: value.denies,
    }).codes,
  ]

  function save() {
    startTransition(async () => {
      const result = await updateUserOverridesAction({
        id: user.id,
        grants: [...value.grants],
        denies: [...value.denies],
      })
      if (!result.ok) {
        setMessage({ ok: false, text: result.error.message })
        return
      }
      setSaved(value)
      setMessage({ ok: true, text: '개별 권한을 저장했습니다. 다음 화면 이동부터 적용됩니다.' })
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">개별 권한</h2>
          <p className="text-sm text-muted-foreground">
            권한그룹과 다르게 줄 권한만 정합니다. 칸을 누를 때마다{' '}
            <b className="font-medium text-foreground">그룹대로 → ＋추가 → −제외</b> 순서로
            바뀝니다. 제외가 그룹보다 우선합니다.
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || pending}
              onClick={() => {
                setValue(saved)
                setMessage(null)
              }}
            >
              <RotateCcwIcon />
              되돌리기
            </Button>
            <Button type="button" disabled={!dirty || pending} onClick={save}>
              <SaveIcon />
              개별 권한 저장
            </Button>
          </div>
        )}
      </div>

      {isSelf && (
        <p className="text-sm text-muted-foreground">
          자기 자신의 개별 권한은 바꿀 수 없습니다. 다른 관리자에게 요청하세요.
        </p>
      )}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm text-success' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      )}

      <OverrideLegend />
      <OverrideMatrix
        area={area}
        includeOperatorOnly={includeOperatorOnly}
        groupCodes={initial.groupCodes}
        value={value}
        onChange={setValue}
        disabled={!editable || pending}
      />

      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-semibold">
          최종 권한 미리보기 <span className="text-muted-foreground">({preview.length}개)</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          저장된 권한그룹 기준입니다. 위에서 권한그룹을 바꿨다면 먼저 저장해 주세요.
          {!user.isActive && ' 지금은 사용 중지된 계정이라 실제로는 아무 권한도 없습니다.'}
        </p>
        <PermissionMatrix
          area={area}
          value={preview}
          onChange={() => {}}
          disabled
          includeOperatorOnly={includeOperatorOnly}
        />
      </div>
    </section>
  )
}

// 표시 설명: 각 표시가 무슨 뜻인지
function OverrideLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li>✓ 회색 = 그룹에 있음</li>
      <li>빈칸 = 그룹에 없음</li>
      <li className="text-success">＋ 추가</li>
      <li className="text-destructive">− 제외</li>
    </ul>
  )
}
