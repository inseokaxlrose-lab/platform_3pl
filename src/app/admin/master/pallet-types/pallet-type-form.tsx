'use client'

import { InfoIcon } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/common'
import { NumberInput } from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  palletTypeCreateSchema,
  type PalletTypeCreateInput,
} from '@/lib/pallets/pallet-type-schema'
import { createPalletTypeAction, updatePalletTypeAction } from './actions'
import { PALLET_LIST_HREF } from './pallet-types-list'

export type PalletTypeForEdit = {
  id: string
  source: 'SYSTEM' | 'OPERATOR' | 'OVERRIDE'
  rowVersion: number
  input: PalletTypeCreateInput
}

// 팔레트 종류 등록·수정 (0083): 규격·자체 중량·권장 적재 높이(팔레트 포함)·최대 적재 중량
// 시스템 기본은 읽기 전용 → 같은 코드로 등록하면 이 운영사 값으로 덮어쓴다 (등록 화면에 값을 채워 연다)
export function PalletTypeForm({
  header,
  pallet,
  initial,
  readOnly,
}: {
  header: MasterFormHeader
  pallet?: PalletTypeForEdit
  // 등록 화면의 처음 값 (시스템 기본을 덮어쓸 때 그 값으로)
  initial?: PalletTypeCreateInput
  readOnly: boolean
}) {
  const EMPTY: PalletTypeCreateInput = {
    code: '',
    name: '',
    widthCm: '',
    depthCm: '',
    heightCm: '',
    weightKg: '',
    maxLoadHeightCm: '',
    maxLoadWeightKg: '',
    status: 'ACTIVE',
    sortOrder: 10,
    remark: '',
  }
  const system = pallet?.source === 'SYSTEM'
  const form = useMasterForm({
    initial: pallet?.input ?? initial ?? EMPTY,
    version: pallet?.rowVersion,
    schema: palletTypeCreateSchema,
    save: (value: PalletTypeCreateInput, version) => {
      if (!pallet) return createPalletTypeAction(value)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { code, ...rest } = value
      return updatePalletTypeAction({
        ...rest,
        id: pallet.id,
        rowVersion: version ?? pallet.rowVersion,
      })
    },
    createdHref: pallet
      ? undefined
      : (created) => `${PALLET_LIST_HREF}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || system || form.pending
  const id = (key: string) => `pallet-${key}`
  const size = (
    key: 'widthCm' | 'depthCm' | 'heightCm' | 'weightKg' | 'maxLoadHeightCm' | 'maxLoadWeightKg',
    label: string,
    unit: string,
    hint?: string,
  ) => (
    <Field
      label={label}
      span={4}
      required={!key.startsWith('max')}
      error={errors[key]}
      htmlFor={id(key)}
      hint={hint}
    >
      <Input
        id={id(key)}
        inputMode="decimal"
        value={value[key] ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled}
        aria-invalid={Boolean(errors[key])}
        placeholder={unit}
      />
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          {system && (
            <p className="col-span-12 flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm">
              <InfoIcon className="size-4" />
              시스템 기본 팔레트라 고칠 수 없습니다.
              <Link
                className="font-medium text-primary underline"
                href={`${PALLET_LIST_HREF}/new?copy=${pallet?.input.code}`}
              >
                이 운영사 값으로 덮어쓰기
              </Link>
            </p>
          )}
          <Field
            label="코드"
            span={3}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint={pallet ? '바꿀 수 없습니다' : 'T11·T12와 같으면 시스템 값을 덮어씀'}
          >
            <Input
              id={id('code')}
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={disabled || Boolean(pallet)}
              maxLength={20}
            />
          </Field>
          <Field label="이름" span={6} required error={errors.name} htmlFor={id('name')}>
            <Input
              id={id('name')}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              maxLength={50}
            />
          </Field>
          <Field label="상태" span={3} htmlFor={id('status')}>
            <Select
              value={value.status}
              onValueChange={(status) => set({ status: status as 'ACTIVE' | 'INACTIVE' })}
              disabled={disabled}
            >
              <SelectTrigger id={id('status')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">사용</SelectItem>
                <SelectItem value="INACTIVE">사용 중지</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="정렬순서" span={3} error={errors.sortOrder} htmlFor={id('sortOrder')}>
            <NumberInput
              id={id('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              max={9999}
              disabled={disabled}
            />
          </Field>
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              id={id('remark')}
              rows={2}
              value={value.remark ?? ''}
              onChange={(e) => set({ remark: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'size',
      title: '규격',
      description:
        '팔레트 자체의 크기와 무게입니다 (cm·kg). 품목의 PLT 가로·세로는 이 값을 씁니다.',
      content: (
        <FormGrid>
          {size('widthCm', '가로', 'cm')}
          {size('depthCm', '세로', 'cm')}
          {size('heightCm', '높이', 'cm')}
          {size('weightKg', '자체 중량', 'kg')}
        </FormGrid>
      ),
    },
    {
      id: 'load',
      title: '적재 한도',
      description: '품목의 팔레트 적재 계산이 이 값을 넘으면 경고합니다 (저장은 됩니다).',
      content: (
        <FormGrid>
          {size('maxLoadHeightCm', '권장 최대 적재 높이', 'cm', '팔레트 포함 높이')}
          {size('maxLoadWeightKg', '최대 적재 중량', 'kg', '팔레트 자체 중량 포함')}
        </FormGrid>
      ),
    },
  ]

  return (
    <MasterFormPage
      header={{
        ...header,
        meta: pallet ? (
          <StatusBadge
            tone={system ? 'neutral' : pallet.source === 'OVERRIDE' ? 'warning' : 'info'}
          >
            {system
              ? '시스템 기본'
              : pallet.source === 'OVERRIDE'
                ? '운영사 값으로 덮어씀'
                : '운영사 추가'}
          </StatusBadge>
        ) : (
          header.meta
        ),
      }}
      form={form}
      readOnly={readOnly || system}
      sections={sections}
    />
  )
}
