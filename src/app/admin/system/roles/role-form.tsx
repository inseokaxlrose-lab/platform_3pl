'use client'

import { Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/common'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormSection,
  type MasterFormHeader,
} from '@/components/master-form'
import { usePermission } from '@/components/permission'
import { PermissionMatrix } from '@/components/permission/permission-matrix'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PermissionCode } from '@/config/permissions'
import { unwrap } from '@/lib/actions'
import { toPermissionArea } from '@/lib/permissions/normalize-group-codes'
import { roleSchema, type RoleFormValue } from '@/lib/permissions/role-schema'
import {
  createPermissionGroupAction,
  deletePermissionGroupAction,
  updatePermissionGroupAction,
} from './actions'
import { AREA_LABELS } from './area-labels'

type RoleFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록, 있으면 수정
  group?: {
    id: string
    name: string
    area: 'ADMIN' | 'PORTAL'
    description: string
    // 동시 수정 막기: 불러올 때의 버전
    rowVersion: number
    userCount: number
    permissionCodes: PermissionCode[]
    obsoleteCodes: string[]
  }
}

const LIST_HREF = '/admin/system/roles'

// 권한그룹 등록·수정 (docs/decisions/0017, 입력 화면 틀 0031)
// 권한 체크 표는 넓은 섹션 하나, 삭제는 따로 처리하는 섹션. 등록하면 수정 화면으로 이동
export function RoleForm({ group, header }: RoleFormProps) {
  const router = useRouter()
  const { can } = usePermission()
  const isNew = !group
  // 수정 권한이 없으면 읽기 전용
  const readOnly = isNew ? !can('system.roles.create') : !can('system.roles.update')

  const form = useMasterForm({
    initial: {
      name: group?.name ?? '',
      area: group?.area ?? 'ADMIN',
      description: group?.description ?? '',
      permissionCodes: group?.permissionCodes ?? [],
    } as RoleFormValue,
    version: group?.rowVersion,
    schema: roleSchema,
    save: (value: RoleFormValue, version) =>
      group
        ? updatePermissionGroupAction({
            id: group.id,
            rowVersion: version ?? group.rowVersion,
            name: value.name,
            description: value.description,
            permissionCodes: value.permissionCodes,
          })
        : createPermissionGroupAction(value),
    onSuccess: group
      ? undefined
      : (created) => router.push(`${LIST_HREF}/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const codes = value.permissionCodes as PermissionCode[]

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field label="이름" span={8} required error={errors.name} htmlFor="role-name">
            <Input
              id="role-name"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              aria-invalid={Boolean(errors.name)}
              maxLength={50}
            />
          </Field>
          <Field
            label="영역"
            span={4}
            htmlFor="role-area"
            hint={isNew ? undefined : '영역은 등록 후 바꿀 수 없습니다.'}
          >
            <Select
              value={value.area}
              // 영역을 바꾸면 다른 영역의 권한은 의미가 없으므로 비운다
              onValueChange={(area) =>
                set({ area: area as RoleFormValue['area'], permissionCodes: [] })
              }
              disabled={!isNew || disabled}
            >
              <SelectTrigger id="role-area" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">{AREA_LABELS.ADMIN}</SelectItem>
                <SelectItem value="PORTAL">{AREA_LABELS.PORTAL}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="설명" span={12} error={errors.description} htmlFor="role-description">
            <Textarea
              id="role-description"
              value={value.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={disabled}
              maxLength={200}
              rows={2}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'permissions',
      title: `권한 (선택 ${codes.length}개)`,
      description: '버튼 권한을 체크하면 조회도 함께 체크됩니다.',
      content: (
        <div className="space-y-3">
          {group && group.obsoleteCodes.length > 0 && (
            <div
              role="status"
              className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
            >
              <TriangleAlertIcon className="size-4 shrink-0" />
              <p>
                지금은 없는 메뉴의 권한 {group.obsoleteCodes.length}개가 남아 있습니다 (
                {group.obsoleteCodes.join(', ')}). 저장하면 정리됩니다.
              </p>
            </div>
          )}
          <PermissionMatrix
            area={toPermissionArea(value.area)}
            value={codes}
            onChange={(permissionCodes) => set({ permissionCodes })}
            disabled={disabled}
          />
        </div>
      ),
    },
  ]

  if (group && can('system.roles.delete')) {
    sections.push({
      id: 'delete',
      title: '삭제',
      standalone: true,
      description:
        group.userCount > 0
          ? `사용자 ${group.userCount}명이 이 그룹을 사용 중이라 삭제할 수 없습니다. 먼저 사용자에게서 그룹을 빼 주세요.`
          : '이 권한그룹을 지웁니다. 되돌릴 수 없습니다.',
      content: (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="sm" disabled={group.userCount > 0}>
              <Trash2Icon />
              권한그룹 삭제
            </Button>
          }
          title="권한그룹을 삭제할까요?"
          description={`'${group.name}' 그룹을 삭제합니다. 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          destructive
          onConfirm={async () => {
            unwrap(await deletePermissionGroupAction({ id: group.id }))
            router.push(LIST_HREF)
            router.refresh()
          }}
        />
      ),
    })
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
