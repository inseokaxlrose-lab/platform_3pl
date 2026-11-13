'use client'

import { PowerIcon, SaveIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ConfirmDialog,
  ExternalCodesFields,
  FormColumns,
  FormField,
  FormRow,
  FormSection,
  StatusBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { unwrap } from '@/lib/actions'
import { EMPTY_EXTERNAL_CODES } from '@/lib/master-code/external-codes-schema'
import {
  STORAGE_CONDITION_LABELS,
  STORAGE_CONDITIONS,
  WAREHOUSE_TYPE_LABELS,
} from '@/lib/warehouses/warehouse-labels'
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type WarehouseCreateInput,
} from '@/lib/warehouses/warehouse-schema'
import { createWarehouseAction, setWarehouseActiveAction, updateWarehouseAction } from './actions'
import type { CenterOption, WarehouseForEdit } from './queries'

const LIST_HREF = '/admin/master/warehouses'

type WarehouseFormProps =
  | {
      // 등록: 고를 수 있는 센터 + 미리 고른 센터
      mode: 'create'
      centers: CenterOption[]
      initialCenterId?: string
    }
  | {
      mode: 'edit'
      warehouse: WarehouseForEdit
      readOnly: boolean
    }

type Errors = Record<string, string>

// 창고 등록·수정 폼 (docs/decisions/0027)
// 입력은 왼쪽 단에 다 담긴다. 수정 화면 오른쪽: 상태 + 로케이션 요약
// 입고대기 창고: 유형·코드가 잠기고 사용 중지 버튼이 없다
export function WarehouseForm(props: WarehouseFormProps) {
  const router = useRouter()
  const editing = props.mode === 'edit' ? props.warehouse : null
  const isStaging = editing?.type === 'INBOUND_STAGING'
  const readOnly = props.mode === 'edit' && props.readOnly
  const [form, setForm] = useState<WarehouseCreateInput>(
    editing
      ? { centerId: editing.center.id, ...editing.input }
      : {
          centerId: props.mode === 'create' ? (props.initialCenterId ?? '') : '',
          code: '',
          name: '',
          storageCondition: 'AMBIENT',
          externalCodes: { ...EMPTY_EXTERNAL_CODES },
        },
  )
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const disabled = readOnly || pending
  const set = (patch: Partial<WarehouseCreateInput>) =>
    setForm((previous) => ({ ...previous, ...patch }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    const parsed = (editing ? updateWarehouseSchema : createWarehouseSchema).safeParse(form)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      )
      return
    }
    setErrors({})
    startTransition(async () => {
      const { centerId, ...data } = form
      const result = editing
        ? await updateWarehouseAction({ id: editing.id, ...data })
        : await createWarehouseAction({ centerId, ...data })
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      router.push(editing ? LIST_HREF : `${LIST_HREF}/${result.data.id}`)
      router.refresh()
    })
  }

  const left = (
    <>
      <FormSection title="기본 정보">
        <FormField label="센터" required error={errors.centerId} htmlFor="warehouse-center">
          {editing ? (
            <Input
              id="warehouse-center"
              value={`${editing.center.name} (${editing.center.code})`}
              disabled
              readOnly
            />
          ) : (
            <Select
              value={form.centerId}
              onValueChange={(centerId) => set({ centerId })}
              disabled={disabled}
            >
              <SelectTrigger id="warehouse-center" className="w-full">
                <SelectValue placeholder="센터 선택" />
              </SelectTrigger>
              <SelectContent>
                {props.mode === 'create' &&
                  props.centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {editing && (
            <p className="text-xs text-muted-foreground">센터는 등록 후 바꿀 수 없습니다.</p>
          )}
        </FormField>
        <FormRow>
          <FormField label="시스템 코드" htmlFor="warehouse-system-code">
            <Input
              id="warehouse-system-code"
              value={editing?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </FormField>
          <FormField label="창고 코드" error={errors.code} htmlFor="warehouse-code">
            <Input
              id="warehouse-code"
              value={form.code}
              onChange={(e) => set({ code: e.target.value })}
              // 입고대기 창고의 코드는 고정
              disabled={disabled || isStaging}
              placeholder="비우면 시스템 코드 사용"
              aria-invalid={Boolean(errors.code)}
            />
          </FormField>
        </FormRow>
        <FormField label="창고명" required error={errors.name} htmlFor="warehouse-name">
          <Input
            id="warehouse-name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.name)}
          />
        </FormField>
      </FormSection>

      <FormSection title="창고 성격">
        <FormRow>
          <FormField label="유형" htmlFor="warehouse-type">
            <Input
              id="warehouse-type"
              value={WAREHOUSE_TYPE_LABELS[editing?.type ?? 'GENERAL']}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              {isStaging
                ? '센터마다 1개, 자동으로 만들어진 창고입니다.'
                : '입고대기 창고는 센터 등록 때 자동으로만 만들어집니다.'}
            </p>
          </FormField>
          <FormField
            label="보관 조건"
            required
            error={errors.storageCondition}
            htmlFor="warehouse-storage"
          >
            <Select
              value={form.storageCondition}
              onValueChange={(storageCondition) =>
                set({
                  storageCondition: storageCondition as WarehouseCreateInput['storageCondition'],
                })
              }
              disabled={disabled}
            >
              <SelectTrigger id="warehouse-storage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>
                    {STORAGE_CONDITION_LABELS[condition]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </FormRow>
      </FormSection>

      <FormSection
        title="외부 코드"
        description="SAP·ERP 등과 연동할 때 그쪽의 창고 코드를 적습니다."
      >
        <ExternalCodesFields
          idPrefix="warehouse"
          value={{ ...EMPTY_EXTERNAL_CODES, ...form.externalCodes }}
          onChange={(externalCodes) => set({ externalCodes })}
          disabled={disabled}
          errors={{ SAP: errors['externalCodes.SAP'], ERP: errors['externalCodes.ERP'] }}
        />
      </FormSection>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
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
    </>
  )

  const right = editing && (
    <>
      <FormSection title="상태">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {editing.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {isStaging ? (
            <p className="text-xs text-muted-foreground">
              입고대기 창고는 사용 중지할 수 없습니다.
            </p>
          ) : (
            !readOnly && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant={editing.isActive ? 'destructive' : 'outline'}>
                    <PowerIcon />
                    {editing.isActive ? '사용 중지' : '다시 사용'}
                  </Button>
                }
                title={
                  editing.isActive ? '이 창고를 사용 중지할까요?' : '이 창고를 다시 사용할까요?'
                }
                description={
                  editing.isActive
                    ? '이 창고와 로케이션에 새로 적치할 수 없게 됩니다. 기록은 남습니다.'
                    : '이 창고를 다시 쓸 수 있게 됩니다.'
                }
                confirmLabel={editing.isActive ? '사용 중지' : '다시 사용'}
                destructive={editing.isActive}
                onConfirm={async () => {
                  unwrap(
                    await setWarehouseActiveAction({ id: editing.id, isActive: !editing.isActive }),
                  )
                  router.refresh()
                }}
              />
            )
          )}
        </div>
      </FormSection>
      <FormSection
        title={`로케이션 (${editing.locationCount})`}
        description="로케이션 추가·일괄 생성은 로케이션 메뉴에서 합니다."
      >
        {editing.locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 로케이션이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {editing.locations.map((l) => (
              <StatusBadge key={l.code} tone={l.isActive ? 'neutral' : 'danger'}>
                {l.code}
              </StatusBadge>
            ))}
            {editing.locationCount > editing.locations.length && (
              <span className="text-xs text-muted-foreground">
                외 {editing.locationCount - editing.locations.length}개
              </span>
            )}
          </div>
        )}
      </FormSection>
    </>
  )

  return (
    <form onSubmit={submit}>
      <FormColumns left={left} right={right || undefined} />
    </form>
  )
}
