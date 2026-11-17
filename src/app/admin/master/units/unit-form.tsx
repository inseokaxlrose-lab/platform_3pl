'use client'

import { InfoIcon } from 'lucide-react'
import Link from 'next/link'
import { ACTIVE_STATUS, StatusBadge } from '@/components/common'
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
  DEFAULT_UNIT_DECIMALS,
  isPhysicalType,
  UNIT_TYPE_LABELS,
  UNIT_TYPES,
  type UnitTypeValue,
} from '@/lib/units/unit-labels'
import { MAX_UNIT_DECIMALS, unitCreateSchema, type UnitCreateInput } from '@/lib/units/unit-schema'
import { createUnitAction, updateUnitAction } from './actions'
import type { BaseUnits, UnitForEdit } from './queries'

const LIST_HREF = '/admin/master/units'

// 단위 등록·수정 (docs/decisions/0034·0078, 입력 화면 틀 0031): 기본 정보 / 환산 / 연동
// - 코드·유형은 등록할 때만 정한다
// - 시스템 기본 단위는 모든 칸 읽기 전용 (헤더에 "기본" 배지, 저장 버튼 없음)
// - 환산 섹션은 중량·부피·길이·면적 단위만. 포장 단위는 품목별 입수량 안내
export function UnitForm({
  header,
  unit,
  baseUnits,
  nextSortOrder = 0,
  readOnly,
}: {
  header: MasterFormHeader
  unit?: UnitForEdit
  baseUnits: BaseUnits
  nextSortOrder?: number
  readOnly: boolean
}) {
  const EMPTY: UnitCreateInput = {
    code: '',
    type: 'QTY',
    name: '',
    nameEn: '',
    printName: '',
    decimals: 0,
    sortOrder: nextSortOrder,
    baseFactor: '',
    stdCode: '',
    description: '',
    remark: '',
    isActive: true,
  }
  // 저장 결과: 등록은 새 키, 수정은 새 버전과 알림(사용 중 단위의 환산계수 변경 등)
  const form = useMasterForm<
    typeof unitCreateSchema,
    { id: string; code?: string; rowVersion?: number; notice?: string }
  >({
    initial: unit ? { ...unit.input, code: unit.code } : EMPTY,
    version: unit?.rowVersion,
    schema: unitCreateSchema,
    save: (value: UnitCreateInput, version) => {
      if (!unit) return createUnitAction(value)
      // 코드는 바꿀 수 없다 (수정 입력 규칙에 코드 칸이 없어 서버가 버린다)
      return updateUnitAction({ id: unit.id, rowVersion: version ?? unit.rowVersion, ...value })
    },
    createdHref: unit ? undefined : (created) => `${LIST_HREF}/${created.id}`,
  })
  const { value, set, errors } = form
  const locked = readOnly || Boolean(unit?.isSystem)
  const disabled = locked || form.pending
  const id = (key: string) => `unit-${key}`
  const props = (key: string) => ({ id: id(key), disabled, 'aria-invalid': Boolean(errors[key]) })
  const type = value.type as UnitTypeValue
  const base = baseUnits[type]
  const physical = isPhysicalType(type)

  const text = (
    key: 'name' | 'nameEn' | 'printName' | 'stdCode',
    label: string,
    span: 2 | 3,
    opts: { required?: boolean; placeholder?: string; hint?: string; upper?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={opts.required}
      error={errors[key]}
      htmlFor={id(key)}
      hint={opts.hint}
    >
      <Input
        {...props(key)}
        value={value[key] ?? ''}
        placeholder={opts.placeholder}
        onChange={(e) => set({ [key]: opts.upper ? e.target.value.toUpperCase() : e.target.value })}
      />
    </Field>
  )

  // 환산 미리보기: "1 근 = 0.6 KG"
  const preview =
    physical && base && value.baseFactor
      ? `1 ${value.name || value.code || '이 단위'} = ${value.baseFactor} ${base.code}`
      : null

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="단위코드"
            span={2}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint="등록 후 변경 불가"
          >
            <Input
              {...props('code')}
              disabled={disabled || Boolean(unit)}
              value={value.code}
              placeholder="예: GN"
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            />
          </Field>
          {text('name', '단위명', 3, { required: true, placeholder: '예: 근' })}
          {text('nameEn', '영문명', 3, { placeholder: '예: Geun' })}
          <Field
            label="단위 유형"
            span={3}
            required
            error={errors.type}
            htmlFor={id('type')}
            hint="등록 후 변경 불가"
          >
            <Select
              value={value.type}
              disabled={disabled || Boolean(unit)}
              onValueChange={(next) =>
                set({
                  type: next as UnitTypeValue,
                  baseFactor: '',
                  decimals: DEFAULT_UNIT_DECIMALS[next as UnitTypeValue],
                })
              }
            >
              <SelectTrigger id={id('type')} className="w-full" aria-invalid={Boolean(errors.type)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {UNIT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="소수 자리수"
            span={2}
            required
            error={errors.decimals}
            htmlFor={id('decimals')}
            hint={`0~${MAX_UNIT_DECIMALS}`}
          >
            <NumberInput
              {...props('decimals')}
              value={value.decimals}
              min={0}
              max={MAX_UNIT_DECIMALS}
              onChange={(n) => set({ decimals: n ?? 0 })}
            />
          </Field>
          {text('printName', '출력명', 2, { hint: '송장·명세서 표기, 비우면 단위명' })}
          <Field
            label="정렬순서"
            span={2}
            error={errors.sortOrder}
            htmlFor={id('sortOrder')}
            hint="단위 고르기 목록 순서"
          >
            <NumberInput
              {...props('sortOrder')}
              value={value.sortOrder}
              min={0}
              max={9999}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
            />
          </Field>
          <Field label="설명" span={12} error={errors.description} htmlFor={id('description')}>
            <Input
              {...props('description')}
              value={value.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          {type === 'PACK' && (
            <p className="col-span-12 flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4">
              <InfoIcon />
              박스·팔레트 등 포장단위의 수량 환산(1 BOX = 24 EA)은 품목별로 설정합니다.
            </p>
          )}
        </FormGrid>
      ),
    },
    ...(physical
      ? [
          {
            id: 'conversion',
            title: '환산',
            description: `1 이 단위 = 환산계수 × ${UNIT_TYPE_LABELS[type]} 기준단위`,
            content: (
              <FormGrid>
                <Field label="기준단위" span={3} htmlFor={id('base')}>
                  <Input
                    id={id('base')}
                    value={
                      unit?.isBase
                        ? `이 단위가 ${UNIT_TYPE_LABELS[type]} 기준단위입니다`
                        : base
                          ? `${base.code} · ${base.name}`
                          : '없음'
                    }
                    disabled
                    readOnly
                  />
                </Field>
                <Field
                  label="환산계수"
                  span={3}
                  required={!unit?.isBase}
                  error={errors.baseFactor}
                  htmlFor={id('baseFactor')}
                  hint={preview ?? '예: 그램 0.001, 톤 1000'}
                >
                  <Input
                    {...props('baseFactor')}
                    inputMode="decimal"
                    value={value.baseFactor ?? ''}
                    onChange={(e) => set({ baseFactor: e.target.value })}
                  />
                </Field>
                {unit && unit.factorHistory.length > 0 && (
                  <div className="col-span-12 space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">환산계수 변경 기록</p>
                    <ul className="space-y-0.5">
                      {unit.factorHistory.map((h) => (
                        <li key={h.at}>
                          {new Date(h.at).toLocaleString('ko-KR')} · {h.by} · {h.from ?? '-'} →{' '}
                          {h.to ?? '-'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </FormGrid>
            ),
          } satisfies MasterFormSection,
        ]
      : []),
    {
      id: 'integration',
      title: '연동',
      description: (
        <>
          화주·외부 시스템별 단위 코드(CS·CT 등)는{' '}
          <Link
            href="/admin/master/external-codes"
            className="text-primary underline-offset-2 hover:underline"
          >
            외부코드 매핑
          </Link>
          에서 정합니다.
        </>
      ),
      content: (
        <FormGrid>
          {text('stdCode', '표준 단위코드', 2, {
            upper: true,
            placeholder: '예: KGM',
            hint: 'UN/ECE Rec.20',
          })}
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              {...props('remark')}
              rows={3}
              value={value.remark ?? ''}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  return (
    <MasterFormPage
      form={form}
      readOnly={locked}
      header={{
        ...header,
        meta: unit && (
          <>
            {unit.isSystem && <StatusBadge tone="neutral">기본</StatusBadge>}
            <StatusBadge tone={ACTIVE_STATUS[String(value.isActive)]?.tone ?? 'neutral'}>
              {ACTIVE_STATUS[String(value.isActive)]?.label ?? ''}
            </StatusBadge>
            {unit.isSystem && (
              <span>
                시스템 기본 단위는 모든 운영사가 함께 쓰며 고칠 수 없습니다. 사용 여부는 목록에서
                운영사별로 바꿉니다.
              </span>
            )}
          </>
        ),
      }}
      sections={sections}
    />
  )
}
