'use client'

import { KeyRoundIcon, LockOpenIcon, PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { formatDate } from '@/components/data-grid'
import { Field, FormGrid } from '@/components/master-form'
import { Can } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordModeField } from '@/components/users/password-mode-field'
import { TempPasswordDialog } from '@/components/users/temp-password-dialog'
import { unwrap } from '@/lib/actions'
import { PASSWORD_RULE_TEXT, type PasswordMode } from '@/lib/users/user-schema'
import { resetUserPasswordAction, setUserActiveAction, unlockUserAction } from './actions'

// 잠금·마지막 로그인 (0093)
type AccountSecurity = {
  locked: boolean
  lockedUntil: Date | null
  loginFailCount: number
  lastLoginAt: Date | null
  lastLoginIp: string | null
}

// 수정 화면의 계정 관리: 사용 중지/다시 사용, 비밀번호 초기화 (둘 다 기존 로그인을 끊는다)
// 로그인을 연속으로 틀려 잠긴 계정은 [잠금 풀기]로 바로 풀 수 있다 (0093)
// 초기화한 비밀번호는 임시 비밀번호 — 자동 생성(기본)이면 한 번 보여 주고, 사용자는 다음 로그인 때 바꿔야 한다 (0086)
export function AccountPanel({
  user,
}: {
  user: { id: string; username: string; isActive: boolean; security: AccountSecurity }
}) {
  const { security } = user
  const router = useRouter()
  const [mode, setMode] = useState<PasswordMode>('AUTO')
  const [issued, setIssued] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await resetUserPasswordAction({
        id: user.id,
        passwordMode: mode,
        password,
        passwordConfirm,
      })
      if (!result.ok) {
        const fieldMessage = Object.values(result.error.fieldErrors ?? {})[0]?.[0]
        setMessage({ ok: false, text: fieldMessage ?? result.error.message })
        return
      }
      setPassword('')
      setPasswordConfirm('')
      setIssued(result.data.tempPassword)
      setMessage({
        ok: true,
        text: '비밀번호를 초기화했습니다. 사용자에게 임시 비밀번호를 안전하게 전달하세요. 다음 로그인 때 새 비밀번호로 바꾸게 됩니다.',
      })
    })
  }

  return (
    <Can permission="system.users.update">
      {/* 섹션 제목·구분선은 사용자 수정 화면(MasterFormPage)이 그린다 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            상태
            {user.isActive ? (
              <StatusBadge tone="success">사용</StatusBadge>
            ) : (
              <StatusBadge tone="danger">사용 중지</StatusBadge>
            )}
            {security.locked && (
              <StatusBadge tone="danger">
                잠김 ({formatDate(security.lockedUntil, true)}까지)
              </StatusBadge>
            )}
            <span className="text-muted-foreground">
              마지막 로그인{' '}
              {security.lastLoginAt
                ? `${formatDate(security.lastLoginAt, true)}${security.lastLoginIp ? ` · ${security.lastLoginIp}` : ''}`
                : '없음'}
              {!security.locked && security.loginFailCount > 0 && (
                <> · 연속 실패 {security.loginFailCount}회</>
              )}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {security.locked && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    unwrap(await unlockUserAction({ id: user.id }))
                    setMessage({ ok: true, text: '잠금을 풀었습니다. 바로 로그인할 수 있습니다.' })
                    router.refresh()
                  })
                }
              >
                <LockOpenIcon />
                잠금 풀기
              </Button>
            )}
            <ConfirmDialog
              trigger={
                <Button type="button" variant={user.isActive ? 'destructive' : 'outline'}>
                  <PowerIcon />
                  {user.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={user.isActive ? '이 계정을 사용 중지할까요?' : '이 계정을 다시 사용할까요?'}
              description={
                user.isActive
                  ? `'${user.username}'은(는) 즉시 로그아웃되고 로그인할 수 없게 됩니다. 기록은 남습니다.`
                  : `'${user.username}'이(가) 다시 로그인할 수 있게 됩니다.`
              }
              confirmLabel={user.isActive ? '사용 중지' : '다시 사용'}
              destructive={user.isActive}
              onConfirm={async () => {
                unwrap(await setUserActiveAction({ id: user.id, isActive: !user.isActive }))
                router.refresh()
              }}
            />
          </div>
        </div>

        <form onSubmit={resetPassword} className="grid gap-4 border-t pt-4">
          {/* 방식 · (직접 입력이면) 새 비밀번호 · 확인 한 줄 */}
          <FormGrid>
            <PasswordModeField
              id="reset-passwordMode"
              value={mode}
              onChange={(next) => {
                setMode(next)
                setPassword('')
                setPasswordConfirm('')
              }}
              disabled={pending}
            />
            {mode === 'MANUAL' && (
              <>
                <Field label="새 비밀번호" span={4} htmlFor="reset-password">
                  <Input
                    id="reset-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder={PASSWORD_RULE_TEXT}
                    disabled={pending}
                  />
                </Field>
                <Field label="새 비밀번호 확인" span={4} htmlFor="reset-password-confirm">
                  <Input
                    id="reset-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    disabled={pending}
                  />
                </Field>
              </>
            )}
          </FormGrid>
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={pending || (mode === 'MANUAL' && !password)}
          >
            <KeyRoundIcon />
            비밀번호 초기화
          </Button>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={message.ok ? 'text-sm text-success' : 'text-sm text-destructive'}
            >
              {message.text}
            </p>
          )}
        </form>
        <TempPasswordDialog
          username={user.username}
          password={issued}
          onClose={() => setIssued(null)}
        />
      </div>
    </Can>
  )
}
