'use client'

import { BanIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { useCodeOptions } from '@/components/common-code'
import { DateInput, QtyInput, SearchSelect } from '@/components/inputs'
import { codeName } from '@/lib/common-code'
import { addDays } from '@/lib/items/expiry-dates'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
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
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { AsnFormOptions, AsnItemOption } from '@/lib/inbound/asn-options'
import type { AsnForEdit } from '@/lib/inbound/asn-queries'
import {
  ASN_CHANNEL_LABELS,
  ASN_STATUS_LABELS,
  asnCreateSchema,
  EMPTY_ASN_LINE,
  MAX_ASN_LINES,
  type AsnCreateInput,
  type AsnInput,
  type AsnLineInput,
} from '@/lib/inbound/asn-schema'
import { formatQty, toBaseQty } from '@/lib/units/convert'
import { AsnProgressGrid } from './asn-progress-grid'
import { labelOf } from '@/lib/db-value'

type SaveResult = { id: string; asnNo: string; rowVersion: number }

// 오늘 (한국 시간 'YYYY-MM-DD') — 예정일 기본값
function today() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 입력 단위·수량 → 기본단위 환산 안내 ('= 72 EA'), 계산할 수 없으면 null
function baseHint(item: AsnItemOption | undefined, line: AsnLineInput) {
  if (!item || !line.qty || !line.unit || line.unit === item.baseUnit.code) return null
  const pack = item.units.find((u) => u.code === line.unit)
  if (!pack) return null
  try {
    return `= ${formatQty(toBaseQty(line.qty, pack.convQty))} ${item.baseUnit.code}`
  } catch {
    return null
  }
}

// ASN 등록·수정 (docs/decisions/0048, 입력 화면 틀 0031) — 운영사 화면(대리 등록)·화주 포털 공용
// - 화주사를 고르면 그 화주사의 품목을 불러온다 (포털·수정 화면은 화주사가 정해져 있어 처음부터 받는다)
// - 수량은 고른 단위로 넣고, 기본단위 환산 수량을 옆에 보여 준다 (저장은 서버가 기본단위로)
// - 예정 상태에서만 고칠 수 있다 (검수가 시작되면 읽기 전용)
export function AsnForm({
  header,
  options,
  asn,
  readOnly,
  basePath,
  fixedShipperId,
  initialItems = [],
  loadItems,
  createAction,
  updateAction,
  deleteAction,
  canDelete = false,
  closeAction,
  canClose = false,
}: {
  header: MasterFormHeader
  options: AsnFormOptions
  // 없으면 등록
  asn?: AsnForEdit
  readOnly: boolean
  // 목록 주소 (저장 후 이동·삭제 후 돌아가기, 예: '/admin/inbound/asn')
  basePath: string
  // 화주 포털: 자기 화주사로 고정
  fixedShipperId?: string
  // 처음 품목 목록 (화주사가 정해진 경우)
  initialItems?: AsnItemOption[]
  // 화주사를 고르면 품목을 불러온다 (운영사 화면 등록)
  loadItems?: (input: { shipperId: string }) => Promise<ActionResult<AsnItemOption[]>>
  createAction: (input: AsnCreateInput) => Promise<ActionResult<SaveResult>>
  updateAction: (
    input: AsnInput & { id: string; rowVersion: number },
  ) => Promise<ActionResult<SaveResult>>
  deleteAction?: (input: { ids: string[] }) => Promise<ActionResult<unknown>>
  canDelete?: boolean
  // 잔량 마감 (운영사 화면만)
  closeAction?: (input: {
    id: string
    rowVersion: number
    reasonCd: string
    reason: string
  }) => Promise<ActionResult<unknown>>
  canClose?: boolean
}) {
  const router = useRouter()
  const closeReasons = useCodeOptions('ASN_CLOSE_REASON')
  const editable = !asn || asn.status === 'PLANNED'
  const initialShipper = asn?.shipperId ?? fixedShipperId ?? ''
  const form = useMasterForm({
    initial: asn
      ? { ...asn.input, shipperId: asn.shipperId }
      : {
          shipperId: initialShipper,
          // 화주사가 이용하는 센터가 하나면 그 센터로
          centerId: (() => {
            const shipper = options.shippers.find((s) => s.id === initialShipper)
            return shipper?.centerIds.length === 1 ? shipper.centerIds[0] : ''
          })(),
          expectedOn: today(),
          shipperRefNo: '',
          remark: '',
          lines: [{ ...EMPTY_ASN_LINE }],
        },
    version: asn?.rowVersion,
    schema: asnCreateSchema,
    save: (value: AsnCreateInput, version) =>
      asn
        ? updateAction({ ...value, id: asn.id, rowVersion: version ?? asn.rowVersion })
        : createAction(value),
    onSuccess: asn ? undefined : (created) => router.push(`${basePath}/${created.id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || !editable || form.pending
  const id = (key: string) => `asn-${key}`

  // 화주사의 품목 (화주사가 바뀌면 다시 불러온다)
  const [items, setItems] = useState<AsnItemOption[]>(initialItems)
  const [loadedFor, setLoadedFor] = useState(initialItems.length > 0 ? initialShipper : '')
  useEffect(() => {
    if (!loadItems || !value.shipperId || value.shipperId === loadedFor) return
    let cancelled = false
    loadItems({ shipperId: value.shipperId }).then((result) => {
      if (cancelled) return
      setItems(result.ok ? result.data : [])
      setLoadedFor(value.shipperId)
    })
    return () => {
      cancelled = true
    }
  }, [loadItems, value.shipperId, loadedFor])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}`,
        description: [
          item.spec,
          item.baseUnit.code,
          ...item.units.map((u) => `${u.code} ${formatQty(u.convQty)}`),
        ]
          .filter(Boolean)
          .join(' · '),
        keywords: item.barcode ?? '',
      })),
    [items],
  )

  const shipper = options.shippers.find((s) => s.id === value.shipperId)
  const centers = options.centers.filter((c) => shipper?.centerIds.includes(c.id))

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field label="화주사" span={6} required error={errors.shipperId} htmlFor={id('shipper')}>
            {asn || fixedShipperId ? (
              <Input
                id={id('shipper')}
                value={asn?.shipper ?? (shipper ? `${shipper.name} (${shipper.code})` : '')}
                disabled
                readOnly
              />
            ) : (
              <Select
                value={value.shipperId}
                onValueChange={(shipperId) => {
                  const next = options.shippers.find((s) => s.id === shipperId)
                  // 화주사가 바뀌면 품목·센터를 다시 고른다
                  set({
                    shipperId,
                    centerId: next?.centerIds.length === 1 ? next.centerIds[0] : '',
                    lines: [{ ...EMPTY_ASN_LINE }],
                  })
                }}
                disabled={disabled}
              >
                <SelectTrigger
                  id={id('shipper')}
                  className="w-full"
                  aria-invalid={Boolean(errors.shipperId)}
                >
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {options.shippers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            label="입고 센터"
            span={6}
            required
            error={errors.centerId}
            htmlFor={id('center')}
            hint={
              shipper && centers.length === 0 ? '이 화주사가 이용하는 센터가 없습니다.' : undefined
            }
          >
            <Select
              value={value.centerId}
              onValueChange={(centerId) => set({ centerId })}
              disabled={disabled || !shipper}
            >
              <SelectTrigger
                id={id('center')}
                className="w-full"
                aria-invalid={Boolean(errors.centerId)}
              >
                <SelectValue placeholder={shipper ? '선택' : '화주사를 먼저 골라 주세요'} />
              </SelectTrigger>
              <SelectContent>
                {centers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="입고 예정일"
            span={4}
            required
            newRow
            error={errors.expectedOn}
            htmlFor={id('expectedOn')}
          >
            <DateInput
              id={id('expectedOn')}
              value={value.expectedOn}
              onChange={(expectedOn) => set({ expectedOn })}
              disabled={disabled}
              aria-invalid={Boolean(errors.expectedOn)}
            />
          </Field>
          <Field
            label="화주사 문서 번호"
            span={4}
            error={errors.shipperRefNo}
            htmlFor={id('shipperRefNo')}
            hint="발주번호 등 (선택)"
          >
            <Input
              id={id('shipperRefNo')}
              value={value.shipperRefNo}
              onChange={(e) => set({ shipperRefNo: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              id={id('remark')}
              rows={2}
              value={value.remark}
              onChange={(e) => set({ remark: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'lines',
      title: '입고 품목',
      description:
        '수량은 고른 단위로 넣습니다. 로트·제조일·유통기한은 관리하는 품목만 적을 수 있고, 실제 값은 검수에서 확인합니다.',
      content: (
        <EditableSubTable<AsnLineInput>
          name="lines"
          rows={value.lines}
          onChange={(lines) => set({ lines })}
          createRow={() => ({ ...EMPTY_ASN_LINE })}
          maxRows={MAX_ASN_LINES}
          minRows={1}
          errors={errors}
          addLabel="품목 추가"
          countUnit="줄"
          emptyText="품목을 추가해 주세요."
          disabled={disabled || !shipper}
          columns={[
            {
              key: 'itemId',
              label: '품목',
              required: true,
              width: 'minmax(12rem,2fr)',
              render: ({ row, index, id: cellId, invalid, disabled: cellDisabled }) => (
                <SearchSelect
                  id={cellId}
                  options={itemOptions}
                  value={row.itemId}
                  invalid={invalid}
                  disabled={cellDisabled}
                  placeholder="품목 선택"
                  searchPlaceholder="품목코드·이름·바코드"
                  onChange={(itemId) => {
                    const item = itemById.get(itemId)
                    const lines = value.lines.map((line, i) =>
                      i === index
                        ? {
                            ...line,
                            itemId,
                            // 기본은 기본단위, 관리하지 않는 로트·유통기한은 비운다
                            unit: item?.baseUnit.code ?? '',
                            lotNo: item?.useLot ? line.lotNo : '',
                            expiryOn: item?.useExpiry && !item.mfgInput ? line.expiryOn : '',
                            mfgOn: item?.useExpiry ? line.mfgOn : '',
                          }
                        : line,
                    )
                    set({ lines })
                  }}
                />
              ),
            },
            {
              key: 'unit',
              label: '단위',
              required: true,
              width: '6.5rem',
              render: ({ row, id: cellId, invalid, disabled: cellDisabled, onChange }) => {
                const item = itemById.get(row.itemId)
                const units = item ? [item.baseUnit.code, ...item.units.map((u) => u.code)] : []
                return (
                  <Select
                    value={units.includes(row.unit) ? row.unit : ''}
                    onValueChange={onChange}
                    disabled={cellDisabled || !item}
                  >
                    <SelectTrigger id={cellId} className="w-full" aria-invalid={invalid}>
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              },
            },
            {
              key: 'qty',
              label: '예정 수량',
              required: true,
              width: '9rem',
              render: ({ row, id: cellId, invalid, disabled: cellDisabled, onChange }) => {
                const item = itemById.get(row.itemId)
                const decimals =
                  row.unit === item?.baseUnit.code
                    ? item.baseUnit.decimals
                    : (item?.units.find((u) => u.code === row.unit)?.decimals ?? 0)
                const hint = baseHint(item, row)
                return (
                  <div>
                    <QtyInput
                      id={cellId}
                      value={row.qty}
                      onChange={onChange}
                      decimals={decimals}
                      aria-invalid={invalid}
                      disabled={cellDisabled}
                    />
                    {hint && (
                      <p className="mt-1 text-right text-xs text-muted-foreground">{hint}</p>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'lotNo',
              label: '로트번호',
              width: '7rem',
              render: ({ row, id: cellId, invalid, disabled: cellDisabled, onChange }) => (
                <Input
                  id={cellId}
                  value={row.lotNo}
                  onChange={(e) => onChange(e.target.value)}
                  aria-invalid={invalid}
                  disabled={cellDisabled || !itemById.get(row.itemId)?.useLot}
                />
              ),
            },
            {
              key: 'mfgOn',
              label: '제조일',
              width: '8.75rem',
              render: ({ row, id: cellId, invalid, disabled: cellDisabled, onChange }) => (
                <DateInput
                  id={cellId}
                  value={row.mfgOn ?? ''}
                  onChange={onChange}
                  aria-invalid={invalid}
                  disabled={cellDisabled || !itemById.get(row.itemId)?.useExpiry}
                />
              ),
            },
            {
              key: 'expiryOn',
              label: '유통기한',
              width: '8.75rem',
              render: ({ row, id: cellId, invalid, disabled: cellDisabled, onChange }) => {
                const item = itemById.get(row.itemId)
                // 제조일 입력 품목은 제조일로 계산한 값을 보여 준다 (저장도 서버가 같은 계산, 0089)
                const computed =
                  item?.mfgInput && row.mfgOn && item.shelfLifeDays
                    ? addDays(row.mfgOn, item.shelfLifeDays)
                    : ''
                return (
                  <DateInput
                    id={cellId}
                    value={item?.mfgInput ? computed : row.expiryOn}
                    onChange={onChange}
                    aria-invalid={invalid}
                    disabled={cellDisabled || !item?.useExpiry || item.mfgInput}
                  />
                )
              },
            },
          ]}
        />
      ),
    },
  ]

  // 수정 화면에서만: 진행 현황 + 상태
  if (asn) {
    sections.push({
      id: 'progress',
      title: '진행 현황',
      standalone: true,
      description:
        '품목별 예정·누적 확정·잔량·초과·적치 수량입니다 (기본단위). 초과는 예정보다 많이 받은 수량입니다.',
      content: <AsnProgressGrid rows={asn.progress} />,
    })
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: editable
        ? '예정 상태에서는 고치거나 지울 수 있습니다. 검수가 시작되면 고칠 수 없습니다.'
        : '검수가 시작된 ASN입니다. 남은 수량을 더 받지 않으려면 잔량 마감을 합니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge tone={asn.status === 'CLOSED' ? 'danger' : 'success'}>
            {labelOf(ASN_STATUS_LABELS, asn.status)}
          </StatusBadge>
          <span className="text-muted-foreground">
            {asn.asnNo} · {labelOf(ASN_CHANNEL_LABELS, asn.channel)} · {asn.center}
          </span>
          {asn.status === 'CLOSED' && (asn.closeReasonCd || asn.closeReason) && (
            <span className="w-full text-muted-foreground">
              마감 사유:{' '}
              {[codeName(closeReasons, asn.closeReasonCd), asn.closeReason]
                .filter(Boolean)
                .join(' — ')}{' '}
              ({asn.closedBy})
            </span>
          )}
          {canClose && closeAction && ['PLANNED', 'INSPECTING', 'PARTIAL'].includes(asn.status) && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <BanIcon />
                  잔량 마감
                </Button>
              }
              title="남은 수량을 마감할까요?"
              description="더 도착하지 않을 잔량을 마감합니다. 마감하면 더 검수·확정할 수 없고, 이미 확정된 재고의 적치는 계속할 수 있습니다."
              confirmLabel="잔량 마감"
              destructive
              reason={{
                label: '마감 사유',
                codeGroup: 'ASN_CLOSE_REASON',
                placeholder: '필요하면 자세한 내용을 적어 주세요',
              }}
              onConfirm={async (reason, reasonCd) => {
                unwrap(
                  await closeAction({
                    id: asn.id,
                    rowVersion: asn.rowVersion,
                    reasonCd: reasonCd ?? '',
                    reason: reason ?? '',
                  }),
                )
                router.refresh()
              }}
            />
          )}
          {editable && canDelete && deleteAction && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" size="sm">
                  <Trash2Icon />
                  지우기
                </Button>
              }
              title="이 ASN을 지울까요?"
              description="예정 상태의 ASN만 지울 수 있습니다."
              confirmLabel="지우기"
              destructive
              onConfirm={async () => {
                unwrap(await deleteAction({ ids: [asn.id] }))
                router.push(basePath)
              }}
            />
          )}
        </div>
      ),
    })
  }

  return (
    <MasterFormPage
      header={header}
      form={form}
      readOnly={readOnly || !editable}
      sections={sections}
    />
  )
}
