'use client'

import { SaveIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FormColumns, FormField, FormSection, StatusBadge } from '@/components/common'
import { usePermission } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ActionFailure } from '@/lib/actions'
import { createUserAction, updateUserAction } from './actions'
import { CheckboxList } from './checkbox-list'
import { USER_TYPE_LABELS, type UserTypeKey } from './labels'
import type { UserForEdit, UserFormOptions } from './queries'

const LIST_HREF = '/admin/system/users'

type UserFormProps = {
  options: UserFormOptions
  // 없으면 등록, 있으면 수정
  user?: UserForEdit
}

// 사용자 등록·수정 폼 (유형·아이디는 등록할 때만 정한다)
export function UserForm({ options, user }: UserFormProps) {
  const router = useRouter()
  const { can } = usePermission()
  const isNew = !user
  const readOnly = isNew ? !can('system.users.create') : !can('system.users.update')

  const [username, setUsername] = useState(user?.username ?? '')
  const [name, setName] = useState(user?.name ?? '')
  const [userType, setUserType] = useState<UserTypeKey>(user?.userType ?? 'CENTER')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [centerIds, setCenterIds] = useState<string[]>(user?.centerIds ?? [])
  const [shipperId, setShipperId] = useState(user?.shipperId ?? '')
  const [groupIds, setGroupIds] = useState<string[]>(user?.permissionGroupIds ?? [])
  const [failure, setFailure] = useState<ActionFailure['error'] | null>(null)
  const [pending, startTransition] = useTransition()

  // 유형에 맞는 영역의 권한그룹만 (운영사·센터 → 운영사 화면, 화주사 → 포털)
  const groupArea = userType === 'SHIPPER' ? 'PORTAL' : 'ADMIN'
  const groupOptions = options.groups
    .filter((group) => group.area === groupArea)
    .map((group) => ({ id: group.id, label: group.name }))

  function changeUserType(next: UserTypeKey) {
    // 유형이 바뀌면 소속·권한그룹이 의미가 없어지므로 비운다
    setUserType(next)
    setCenterIds([])
    setShipperId('')
    setGroupIds([])
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const affiliation = {
        centerIds: userType === 'CENTER' ? centerIds : [],
        shipperId: userType === 'SHIPPER' ? shipperId : '',
        permissionGroupIds: groupIds,
      }
      const result = isNew
        ? await createUserAction({
            username,
            name,
            userType,
            email,
            password,
            passwordConfirm,
            ...affiliation,
          })
        : await updateUserAction({ id: user.id, name, email, ...affiliation })
      if (!result.ok) {
        setFailure(result.error)
        return
      }
      router.push(LIST_HREF)
      router.refresh()
    })
  }

  const fieldError = (field: string) => failure?.fieldErrors?.[field]?.[0]
  const disabled = readOnly || pending

  return (
    <form onSubmit={save} className="space-y-6">
      <FormColumns
        left={
          <FormSection title="기본 정보">
            <FormField
              label="아이디"
              required
              error={fieldError('username')}
              htmlFor="user-username"
            >
              {isNew ? (
                <Input
                  id="user-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={disabled}
                  autoComplete="off"
                  placeholder="영문·숫자·점·밑줄·하이픈 3~30자"
                />
              ) : (
                <p className="py-2 font-medium">{username}</p>
              )}
            </FormField>
            <FormField label="이름" required error={fieldError('name')} htmlFor="user-name">
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={disabled}
                maxLength={50}
              />
            </FormField>
            <FormField label="사용자 유형" required htmlFor="user-type">
              {isNew ? (
                <Select
                  value={userType}
                  onValueChange={(v) => changeUserType(v as UserTypeKey)}
                  disabled={disabled}
                >
                  <SelectTrigger id="user-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(USER_TYPE_LABELS) as UserTypeKey[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {USER_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="py-1.5">
                  <StatusBadge tone="neutral">{USER_TYPE_LABELS[userType]}</StatusBadge>
                  <span className="ml-2 text-xs text-muted-foreground">
                    유형은 등록 후 바꿀 수 없습니다.
                  </span>
                </div>
              )}
            </FormField>
            <FormField label="이메일" error={fieldError('email')} htmlFor="user-email">
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
                placeholder="없으면 비워 두세요"
              />
            </FormField>
            {isNew && (
              <>
                <FormField
                  label="초기 비밀번호"
                  required
                  error={fieldError('password')}
                  htmlFor="user-password"
                >
                  <Input
                    id="user-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={disabled}
                    autoComplete="new-password"
                    placeholder="8자 이상"
                  />
                </FormField>
                <FormField
                  label="비밀번호 확인"
                  required
                  error={fieldError('passwordConfirm')}
                  htmlFor="user-password-confirm"
                >
                  <Input
                    id="user-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    disabled={disabled}
                    autoComplete="new-password"
                  />
                </FormField>
              </>
            )}
          </FormSection>
        }
        right={
          <>
            {userType === 'CENTER' && (
              <FormSection
                title="소속 센터"
                required
                description="선택한 센터의 데이터만 볼 수 있습니다."
              >
                <CheckboxList
                  name="center"
                  options={options.centers.map((c) => ({
                    id: c.id,
                    label: `${c.name} (${c.code})`,
                  }))}
                  value={centerIds}
                  onChange={setCenterIds}
                  disabled={disabled}
                  emptyText="등록된 센터가 없습니다."
                />
              </FormSection>
            )}

            {userType === 'SHIPPER' && (
              <FormSection
                title="소속 화주사"
                required
                description="자기 화주사의 데이터만 볼 수 있습니다."
              >
                <Select value={shipperId} onValueChange={setShipperId} disabled={disabled}>
                  <SelectTrigger aria-label="소속 화주사" className="w-full">
                    <SelectValue placeholder="화주사 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.shippers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormSection>
            )}

            <FormSection
              title="권한그룹"
              description={
                <>
                  {userType === 'SHIPPER' ? '화주 포털' : '운영사 화면'} 권한그룹만 배정할 수
                  있습니다.
                  {userType !== 'OPERATOR' &&
                    ' 시스템 메뉴(사용자·권한그룹) 권한은 운영사에게만 적용됩니다.'}
                </>
              }
            >
              <CheckboxList
                name="group"
                options={groupOptions}
                value={groupIds}
                onChange={setGroupIds}
                disabled={disabled}
                emptyText="배정할 수 있는 권한그룹이 없습니다."
              />
            </FormSection>
          </>
        }
      />

      {failure && !failure.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {failure.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild type="button" variant="outline">
          <Link href={LIST_HREF}>{readOnly ? '목록으로' : '취소'}</Link>
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            <SaveIcon />
            {pending ? '저장 중…' : '저장'}
          </Button>
        )}
      </div>
    </form>
  )
}
