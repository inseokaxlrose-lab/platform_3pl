'use client'

import { SaveIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog, FormColumns, FormField, FormSection } from '@/components/common'
import { Can, usePermission } from '@/components/permission'
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
import type { ActionFailure } from '@/lib/actions'
import { toPermissionArea } from '@/lib/permissions/normalize-group-codes'
import {
  createPermissionGroupAction,
  deletePermissionGroupAction,
  updatePermissionGroupAction,
} from './actions'
import { AREA_LABELS } from './area-labels'

type RoleFormProps = {
  // 없으면 등록, 있으면 수정
  group?: {
    id: string
    name: string
    area: 'ADMIN' | 'PORTAL'
    description: string
    userCount: number
    permissionCodes: PermissionCode[]
    obsoleteCodes: string[]
  }
}

const LIST_HREF = '/admin/system/roles'

// 권한그룹 등록·수정 폼
export function RoleForm({ group }: RoleFormProps) {
  const router = useRouter()
  const { can } = usePermission()
  const isNew = !group
  // 수정 권한이 없으면 읽기 전용
  const readOnly = isNew ? !can('system.roles.create') : !can('system.roles.update')

  const [name, setName] = useState(group?.name ?? '')
  const [area, setArea] = useState<'ADMIN' | 'PORTAL'>(group?.area ?? 'ADMIN')
  const [description, setDescription] = useState(group?.description ?? '')
  const [codes, setCodes] = useState<PermissionCode[]>(group?.permissionCodes ?? [])
  const [failure, setFailure] = useState<ActionFailure['error'] | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = isNew
        ? await createPermissionGroupAction({ name, area, description, permissionCodes: codes })
        : await updatePermissionGroupAction({
            id: group.id,
            name,
            description,
            permissionCodes: codes,
          })
      if (!result.ok) {
        setFailure(result.error)
        return
      }
      router.push(LIST_HREF)
      router.refresh()
    })
  }

  const fieldError = (field: string) => failure?.fieldErrors?.[field]?.[0]

  return (
    <form onSubmit={save} className="space-y-6">
      {/* 정보가 적어 왼쪽 단만 쓴다. 권한 체크 표는 아래에 전체 너비로 */}
      <FormColumns
        left={
          <FormSection title="기본 정보">
            <FormField label="이름" required error={fieldError('name')} htmlFor="role-name">
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly || pending}
                aria-invalid={Boolean(fieldError('name'))}
                maxLength={50}
              />
            </FormField>
            <FormField label="영역" htmlFor="role-area">
              <Select
                value={area}
                onValueChange={(next) => {
                  // 영역을 바꾸면 다른 영역의 권한은 의미가 없으므로 비운다
                  setArea(next as 'ADMIN' | 'PORTAL')
                  setCodes([])
                }}
                disabled={!isNew || readOnly || pending}
              >
                <SelectTrigger id="role-area" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">{AREA_LABELS.ADMIN}</SelectItem>
                  <SelectItem value="PORTAL">{AREA_LABELS.PORTAL}</SelectItem>
                </SelectContent>
              </Select>
              {!isNew && (
                <p className="text-xs text-muted-foreground">영역은 등록 후 바꿀 수 없습니다.</p>
              )}
            </FormField>
            <FormField label="설명" htmlFor="role-description">
              <Textarea
                id="role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly || pending}
                maxLength={200}
                rows={2}
              />
            </FormField>
          </FormSection>
        }
      />

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

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">권한</h2>
          <p className="text-xs text-muted-foreground">
            버튼 권한을 체크하면 조회도 함께 체크됩니다. 선택 {codes.length}개
          </p>
        </div>
        <PermissionMatrix
          area={toPermissionArea(area)}
          value={codes}
          onChange={setCodes}
          disabled={readOnly || pending}
        />
      </div>

      {failure && !failure.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {failure.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {group && (
          <Can permission="system.roles.delete">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" disabled={pending}>
                  <Trash2Icon />
                  삭제
                </Button>
              }
              title="권한그룹을 삭제할까요?"
              description={
                group.userCount > 0
                  ? `사용자 ${group.userCount}명이 이 그룹을 사용 중이라 삭제할 수 없습니다.`
                  : `'${group.name}' 그룹을 삭제합니다. 되돌릴 수 없습니다.`
              }
              confirmLabel="삭제"
              destructive
              onConfirm={async () => {
                unwrap(await deletePermissionGroupAction({ id: group.id }))
                router.push(LIST_HREF)
                router.refresh()
              }}
            />
          </Can>
        )}
        <div className="ml-auto flex gap-2">
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
      </div>
    </form>
  )
}
