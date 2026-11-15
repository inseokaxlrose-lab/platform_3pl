'use client'

import { LayersIcon, PowerIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, ExternalCodesFields, StatusBadge } from '@/components/common'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormSection,
  type MasterFormHeader,
} from '@/components/master-form'
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
import { unwrap } from '@/lib/actions'
import { EMPTY_EXTERNAL_CODES } from '@/lib/master-code/external-codes-schema'
import {
  STORAGE_CONDITION_LABELS,
  STORAGE_CONDITIONS,
  WAREHOUSE_TYPE_LABELS,
} from '@/lib/warehouses/warehouse-labels'
import { createWarehouseSchema, type WarehouseCreateInput } from '@/lib/warehouses/warehouse-schema'
import { createWarehouseAction, setWarehouseActiveAction, updateWarehouseAction } from './actions'
import type { CenterOption, WarehouseForEdit } from './queries'

type WarehouseFormProps = { header: MasterFormHeader } & (
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
)

type StorageCondition = WarehouseCreateInput['storageCondition']

// 창고 등록·수정 (docs/decisions/0027, 입력 화면 틀 0031)
// 등록하면 수정 화면으로, 수정은 그 자리에서 저장. 상태·로케이션은 따로 처리하는 섹션
// 입고대기 창고: 코드가 잠기고 사용 중지 버튼이 없다
export function WarehouseForm(props: WarehouseFormProps) {
  const router = useRouter()
  const { can } = usePermission()
  const editing = props.mode === 'edit' ? props.warehouse : null
  const isStaging = editing?.type === 'INBOUND_STAGING'
  const readOnly = props.mode === 'edit' && props.readOnly

  const form = useMasterForm({
    initial: editing
      ? { centerId: editing.center.id, ...editing.input }
      : {
          centerId: props.mode === 'create' ? (props.initialCenterId ?? '') : '',
          code: '',
          name: '',
          storageCondition: 'AMBIENT' as StorageCondition,
          externalCodes: { ...EMPTY_EXTERNAL_CODES },
        },
    // 등록·수정 모두 같은 규칙 (수정에서는 센터가 이미 정해져 있다)
    schema: createWarehouseSchema,
    save: ({ centerId, ...data }: WarehouseCreateInput) =>
      editing
        ? updateWarehouseAction({ id: editing.id, ...data })
        : createWarehouseAction({ centerId, ...data }),
    afterSave: (saved) => ({
      ...saved,
      // 검사를 거친 값은 키가 bigint라 화면 값(글자)으로 되돌린다
      centerId: String(saved.centerId),
      externalCodes: { ...EMPTY_EXTERNAL_CODES, ...saved.externalCodes },
    }),
    onSuccess: editing
      ? undefined
      : (created) => router.push(`/admin/master/warehouses/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="센터"
            span={6}
            required
            error={errors.centerId}
            htmlFor="warehouse-center"
            hint={editing ? '센터는 등록 후 바꿀 수 없습니다.' : undefined}
          >
            {editing ? (
              <Input
                id="warehouse-center"
                value={`${editing.center.name} (${editing.center.code})`}
                disabled
                readOnly
              />
            ) : (
              <Select
                value={value.centerId}
                onValueChange={(centerId) => set({ centerId })}
                disabled={disabled}
              >
                <SelectTrigger
                  id="warehouse-center"
                  className="w-full"
                  aria-invalid={Boolean(errors.centerId)}
                >
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
          </Field>
          <Field
            label="창고명"
            span={8}
            required
            newRow
            error={errors.name}
            htmlFor="warehouse-name"
          >
            <Input
              id="warehouse-name"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="창고 코드" span={4} error={errors.code} htmlFor="warehouse-code">
            <Input
              id="warehouse-code"
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              // 입고대기 창고의 코드는 고정
              disabled={disabled || isStaging}
              placeholder="비우면 시스템 코드 사용"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          <Field label="시스템 코드" span={4} htmlFor="warehouse-system-code">
            <Input
              id="warehouse-system-code"
              value={editing?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'nature',
      title: '창고 성격',
      content: (
        <FormGrid>
          <Field
            label="유형"
            span={4}
            htmlFor="warehouse-type"
            hint={
              isStaging
                ? '센터마다 1개, 자동으로 만들어진 창고입니다.'
                : '입고대기 창고는 센터 등록 때 자동으로만 만들어집니다.'
            }
          >
            <Input
              id="warehouse-type"
              value={WAREHOUSE_TYPE_LABELS[editing?.type ?? 'GENERAL']}
              disabled
              readOnly
            />
          </Field>
          <Field
            label="보관 조건"
            span={4}
            required
            error={errors.storageCondition}
            htmlFor="warehouse-storage"
          >
            <Select
              value={value.storageCondition}
              onValueChange={(storageCondition) =>
                set({ storageCondition: storageCondition as StorageCondition })
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
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'external',
      title: '외부 코드',
      description: 'SAP·ERP 등과 연동할 때 그쪽의 창고 코드를 적습니다.',
      content: (
        <FormGrid>
          <ExternalCodesFields
            idPrefix="warehouse"
            value={{ ...EMPTY_EXTERNAL_CODES, ...value.externalCodes }}
            onChange={(externalCodes) => set({ externalCodes })}
            disabled={disabled}
            errors={{ SAP: errors['externalCodes.SAP'], ERP: errors['externalCodes.ERP'] }}
          />
        </FormGrid>
      ),
    },
  ]

  // 수정 화면에서만: 상태(바로 처리), 로케이션 요약
  if (editing) {
    sections.push(
      {
        id: 'status',
        title: '상태',
        standalone: true,
        content: (
          <div className="flex flex-wrap items-center gap-3">
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
                    <Button
                      type="button"
                      size="sm"
                      variant={editing.isActive ? 'destructive' : 'outline'}
                    >
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
                      await setWarehouseActiveAction({
                        id: editing.id,
                        isActive: !editing.isActive,
                      }),
                    )
                    router.refresh()
                  }}
                />
              )
            )}
          </div>
        ),
      },
      {
        id: 'locations',
        title: `로케이션 (${editing.locationCount})`,
        standalone: true,
        description: isStaging
          ? '입고대기 창고는 기본 로케이션 하나만 씁니다.'
          : '로케이션 추가·일괄 생성은 로케이션 메뉴에서 합니다.',
        action: (
          <div className="flex gap-2">
            {can('master.locations.read') && (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/admin/master/locations?warehouse=${editing.id}`}>로케이션 관리</Link>
              </Button>
            )}
            {!isStaging && editing.isActive && can('master.locations.create') && (
              <Button asChild type="button" size="sm">
                <Link href={`/admin/master/locations/bulk?warehouseId=${editing.id}`}>
                  <LayersIcon />
                  일괄 생성
                </Link>
              </Button>
            )}
          </div>
        ),
        content:
          editing.locations.length === 0 ? (
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
          ),
      },
    )
  }

  return (
    <MasterFormPage header={props.header} form={form} readOnly={readOnly} sections={sections} />
  )
}
