'use client'

import { useRouter } from 'next/navigation'
import type { z } from 'zod'
import { StatusBadge } from '@/components/common'
import { CheckboxList, EmailInput } from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormSection,
} from '@/components/master-form'
import { usePermission } from '@/components/permission'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createUserSchema,
  updateUserFormSchema,
  USER_TYPES,
  type UserFormValue,
} from '@/lib/users/user-schema'
import { createUserAction, updateUserAction } from './actions'
import { USER_TYPE_LABELS, type UserTypeKey } from './labels'
import type { UserForEdit, UserFormOptions } from './queries'

type UserFormProps = {
  options: UserFormOptions
  // 없으면 등록, 있으면 수정
  user?: UserForEdit
  // 수정 화면에서 폼 뒤에 붙일 따로 처리하는 섹션 (개별 권한·계정 관리)
  extraSections?: MasterFormSection[]
}

// 섹션 안 오류 문구 (체크 목록처럼 칸 하나가 아닌 입력)
function SectionError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-2 text-xs text-destructive">
      {message}
    </p>
  )
}

// 사용자 등록·수정 (docs/decisions/0018, 입력 화면 틀 0031)
// 유형·아이디는 등록할 때만 정한다. 등록하면 수정 화면으로 이동
export function UserForm({ options, user, extraSections = [] }: UserFormProps) {
  const router = useRouter()
  const { can } = usePermission()
  const isNew = !user
  const readOnly = isNew ? !can('system.users.create') : !can('system.users.update')

  const form = useMasterForm({
    initial: {
      username: user?.username ?? '',
      name: user?.name ?? '',
      userType: user?.userType ?? 'CENTER',
      email: user?.email ?? '',
      password: '',
      passwordConfirm: '',
      centerIds: user?.centerIds ?? [],
      shipperId: user?.shipperId ?? '',
      permissionGroupIds: user?.permissionGroupIds ?? [],
    } satisfies UserFormValue as UserFormValue,
    // 등록·수정 규칙이 다르지만 둘 다 같은 화면 입력값(UserFormValue)을 검사한다 (없는 칸은 무시)
    schema: (isNew ? createUserSchema : updateUserFormSchema) as unknown as z.ZodType<
      unknown,
      UserFormValue
    >,
    save: (value: UserFormValue) => {
      // 유형에 맞지 않는 소속은 보내지 않는다
      const affiliation = {
        centerIds: value.userType === 'CENTER' ? value.centerIds : [],
        shipperId: value.userType === 'SHIPPER' ? value.shipperId : '',
        permissionGroupIds: value.permissionGroupIds,
      }
      return user
        ? updateUserAction({ id: user.id, name: value.name, email: value.email, ...affiliation })
        : createUserAction({ ...value, ...affiliation })
    },
    onSuccess: user
      ? undefined
      : (created) => router.push(`/admin/system/users/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending

  // 유형에 맞는 영역의 권한그룹만 (운영사·센터 → 운영사 화면, 화주사 → 포털)
  const groupArea = value.userType === 'SHIPPER' ? 'PORTAL' : 'ADMIN'
  const groupOptions = options.groups
    .filter((group) => group.area === groupArea)
    .map((group) => ({ id: group.id, label: group.name }))

  // 유형이 바뀌면 소속·권한그룹이 의미가 없어지므로 비운다
  const changeUserType = (userType: UserTypeKey) =>
    set({ userType, centerIds: [], shipperId: '', permissionGroupIds: [] })

  const password = (key: 'password' | 'passwordConfirm', label: string) => (
    <Field label={label} span={4} required error={errors[key]} htmlFor={`user-${key}`}>
      <Input
        id={`user-${key}`}
        type="password"
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled}
        autoComplete="new-password"
        placeholder={key === 'password' ? '8자 이상' : undefined}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field label="아이디" span={4} required error={errors.username} htmlFor="user-username">
            <Input
              id="user-username"
              value={value.username}
              onChange={(e) => set({ username: e.target.value })}
              disabled={disabled || !isNew}
              readOnly={!isNew}
              autoComplete="off"
              placeholder="영문·숫자·점·밑줄·하이픈 3~30자"
              aria-invalid={Boolean(errors.username)}
            />
          </Field>
          <Field label="이름" span={4} required error={errors.name} htmlFor="user-name">
            <Input
              id="user-name"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              maxLength={50}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field
            label="사용자 유형"
            span={4}
            required
            htmlFor="user-type"
            hint={isNew ? undefined : '유형은 등록 후 바꿀 수 없습니다.'}
          >
            {isNew ? (
              <Select
                value={value.userType}
                onValueChange={(v) => changeUserType(v as UserTypeKey)}
                disabled={disabled}
              >
                <SelectTrigger id="user-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {USER_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center">
                <StatusBadge tone="neutral">{USER_TYPE_LABELS[value.userType]}</StatusBadge>
              </div>
            )}
          </Field>
          <Field label="이메일" span={8} error={errors.email} htmlFor="user-email">
            <EmailInput
              id="user-email"
              value={value.email}
              onChange={(e) => set({ email: e.target.value })}
              disabled={disabled}
              placeholder="없으면 비워 두세요"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          {isNew && (
            <>
              {password('password', '초기 비밀번호')}
              {password('passwordConfirm', '비밀번호 확인')}
            </>
          )}
        </FormGrid>
      ),
    },
  ]

  if (value.userType === 'CENTER') {
    sections.push({
      id: 'centers',
      title: '소속 센터',
      description: '선택한 센터의 데이터만 볼 수 있습니다. 1개 이상 고릅니다.',
      content: (
        <>
          <CheckboxList
            name="center"
            options={options.centers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
            value={value.centerIds}
            onChange={(centerIds) => set({ centerIds })}
            disabled={disabled}
            emptyText="등록된 센터가 없습니다."
          />
          <SectionError message={errors.centerIds} />
        </>
      ),
    })
  }
  if (value.userType === 'SHIPPER') {
    sections.push({
      id: 'shipper',
      title: '소속 화주사',
      description: '자기 화주사의 데이터만 볼 수 있습니다.',
      content: (
        <FormGrid>
          <Field label="화주사" span={6} required error={errors.shipperId} htmlFor="user-shipper">
            <Select
              value={value.shipperId}
              onValueChange={(shipperId) => set({ shipperId })}
              disabled={disabled}
            >
              <SelectTrigger
                id="user-shipper"
                className="w-full"
                aria-invalid={Boolean(errors.shipperId)}
              >
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
          </Field>
        </FormGrid>
      ),
    })
  }
  sections.push({
    id: 'groups',
    title: '권한그룹',
    description: `${value.userType === 'SHIPPER' ? '화주 포털' : '운영사 화면'} 권한그룹만 배정할 수 있습니다.${
      value.userType !== 'OPERATOR'
        ? ' 시스템 메뉴(사용자·권한그룹) 권한은 운영사에게만 적용됩니다.'
        : ''
    }`,
    content: (
      <>
        <CheckboxList
          name="group"
          options={groupOptions}
          value={value.permissionGroupIds}
          onChange={(permissionGroupIds) => set({ permissionGroupIds })}
          disabled={disabled}
          emptyText="배정할 수 있는 권한그룹이 없습니다."
        />
        <SectionError message={errors.permissionGroupIds} />
      </>
    ),
  })

  return (
    <MasterFormPage form={form} readOnly={readOnly} sections={[...sections, ...extraSections]} />
  )
}
