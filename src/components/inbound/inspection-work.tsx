'use client'

import { CameraIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { AttachmentGallery } from '@/components/files'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCodeOptions } from '@/components/common-code'
import { CodeSelect, DateInput, QtyInput } from '@/components/inputs'
import { codeName } from '@/lib/common-code'
import { addDays, isMfgInput } from '@/lib/items/expiry-dates'
import { Field, FormGrid } from '@/components/master-form'
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
import type { ActionResult } from '@/lib/actions/result'
import type { InspectionWork } from '@/lib/inbound/inspection-queries'
import {
  EMPTY_INSPECTION,
  inspectionSchema,
  type InspectionInput,
} from '@/lib/inbound/inspection-schema'
import { formatQty, toBaseQty } from '@/lib/units/convert'

type Line = InspectionWork['lines'][number]
type Record_ = InspectionWork['inspections'][number]

// 수량 칸 (기본단위 붙여, 0은 흐리게)
const qtyCell = (value: string, unit: string, tone?: 'warning' | 'danger') =>
  value === '0' ? (
    <span className="text-muted-foreground">0</span>
  ) : (
    <span
      className={
        tone === 'warning'
          ? 'font-medium text-warning tabular-nums'
          : tone === 'danger'
            ? 'font-medium text-destructive tabular-nums'
            : 'tabular-nums'
      }
    >
      {formatQty(value)} {unit}
    </span>
  )

const LINE_COLUMNS: DataGridColumn<Line>[] = [
  { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56, pinned: true },
  { id: 'item', header: '품목', accessor: 'item', pinned: true },
  {
    id: 'lot',
    header: '로트·유통기한',
    accessor: (row) =>
      [row.useLot ? '로트' : null, row.useExpiry ? '유통기한' : null].filter(Boolean).join('·') ||
      '-',
  },
  {
    id: 'expectedQty',
    header: '예정',
    accessor: 'expectedQty',
    align: 'right',
    cell: (r) => qtyCell(r.expectedQty, r.baseUnit.code),
  },
  {
    id: 'inspectedQty',
    header: '검수(정상)',
    accessor: 'inspectedQty',
    align: 'right',
    cell: (r) => qtyCell(r.inspectedQty, r.baseUnit.code),
  },
  {
    id: 'defectQty',
    header: '불량',
    accessor: 'defectQty',
    align: 'right',
    cell: (r) => qtyCell(r.defectQty, r.baseUnit.code, 'danger'),
  },
  {
    id: 'confirmedQty',
    header: '누적 확정',
    accessor: 'confirmedQty',
    align: 'right',
    cell: (r) => qtyCell(r.confirmedQty, r.baseUnit.code),
  },
  {
    id: 'remainingQty',
    header: '잔량',
    accessor: 'remainingQty',
    align: 'right',
    cell: (r) => qtyCell(r.remainingQty, r.baseUnit.code),
  },
]

// 입고 검수 작업 (docs/decisions/0053)
// 위: 품목별 예정·검수·불량·확정·잔량 / 가운데: 검수 등록 / 아래: 검수 기록 (확정 전이면 지우기)
export function InspectionWorkPanel({
  work,
  canUpdate,
  addAction,
  deleteAction,
}: {
  work: InspectionWork
  canUpdate: boolean
  addAction: (input: InspectionInput) => Promise<ActionResult<unknown>>
  deleteAction: (input: { id: string }) => Promise<ActionResult<unknown>>
}) {
  const router = useRouter()
  const closed = work.status === 'CLOSED'
  const [value, setValue] = useState<InspectionInput>({ ...EMPTY_INSPECTION })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 사진 대화상자를 연 검수 기록
  const [photoTarget, setPhotoTarget] = useState<string | null>(null)
  const set = (patch: Partial<InspectionInput>) => setValue((v) => ({ ...v, ...patch }))
  const line = work.lines.find((l) => l.id === value.asnLineId)
  // 제조일 입력 품목: 유통기한 = 제조일 + 총 기한 일수 (화면에서 미리 계산해 보여 준다, 0089)
  const mfgMode = Boolean(
    line &&
    isMfgInput({
      useExpiry: line.useExpiry,
      expiryInput: line.expiryInput,
      shelfLifeDays: line.shelfLifeDays,
    }),
  )
  const computedExpiry =
    mfgMode && value.mfgOn && line?.shelfLifeDays ? addDays(value.mfgOn, line.shelfLifeDays) : ''
  // 불량 수량이 있으면 불량 사유를 고른다 (0087)
  const hasDefect = /[1-9]/.test(value.defectQty ?? '')
  const defectReasons = useCodeOptions('DEFECT_REASON')
  const units = line ? [line.baseUnit.code, ...line.units.map((u) => u.code)] : []
  const decimals =
    line && value.unit !== line.baseUnit.code
      ? (line.units.find((u) => u.code === value.unit)?.decimals ?? 0)
      : (line?.baseUnit.decimals ?? 0)
  const hint = useMemo(() => {
    const pack = line?.units.find((u) => u.code === value.unit)
    if (!line || !pack || !value.qty) return null
    try {
      return `= ${formatQty(toBaseQty(value.qty, pack.convQty))} ${line.baseUnit.code}`
    } catch {
      return null
    }
  }, [line, value.unit, value.qty])
  const disabled = !canUpdate || closed || pending

  const submit = () => {
    setMessage(null)
    const parsed = inspectionSchema.safeParse(value)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? ''), i.message])),
      )
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = await addAction(value)
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      // 같은 품목을 이어서 검수하기 쉽게 품목·단위는 남긴다
      setValue({ ...EMPTY_INSPECTION, asnLineId: value.asnLineId, unit: value.unit })
      router.refresh()
    })
  }

  const recordColumns: DataGridColumn<Record_>[] = [
    { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56 },
    { id: 'item', header: '품목', accessor: 'item' },
    { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
    { id: 'mfgOn', header: '제조일', accessor: 'mfgOn', format: 'date' },
    { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
    {
      id: 'inspectedQty',
      header: '검수(정상)',
      accessor: 'inspectedQty',
      align: 'right',
      cell: (r) => qtyCell(r.inspectedQty, r.baseUnit),
    },
    { id: 'entry', header: '입력', accessor: 'entry', defaultHidden: true },
    {
      id: 'defectQty',
      header: '불량',
      accessor: 'defectQty',
      align: 'right',
      cell: (r) => qtyCell(r.defectQty, r.baseUnit, 'danger'),
    },
    {
      id: 'confirmedQty',
      header: '확정',
      accessor: 'confirmedQty',
      align: 'right',
      cell: (r) => qtyCell(r.confirmedQty, r.baseUnit),
    },
    {
      id: 'defectReason',
      header: '불량 사유',
      accessor: (r) => codeName(defectReasons, r.defectReasonCd),
    },
    { id: 'remark', header: '비고', accessor: 'remark' },
    { id: 'inspectedBy', header: '검수자', accessor: 'inspectedBy' },
    { id: 'inspectedAt', header: '검수 일시', accessor: 'inspectedAt', format: 'datetime' },
    {
      id: 'photos',
      header: '사진',
      accessor: () => '',
      hideable: false,
      cell: (r) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPhotoTarget(r.id)}
          aria-label="검수 사진"
        >
          <CameraIcon />
        </Button>
      ),
    },
    {
      id: 'actions',
      header: '',
      accessor: () => '',
      hideable: false,
      cell: (r) =>
        canUpdate && !closed && r.confirmedQty === '0' ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" aria-label="검수 기록 지우기">
                <Trash2Icon />
              </Button>
            }
            title="이 검수 기록을 지울까요?"
            description="입고 확정하지 않은 검수만 지울 수 있습니다."
            confirmLabel="지우기"
            destructive
            onConfirm={async () => {
              unwrap(await deleteAction({ id: r.id }))
              router.refresh()
            }}
          />
        ) : null,
    },
  ]

  return (
    <div className="space-y-8">
      {/* 검수 사진 (파손 증빙 등, 0091): 올리면 바로 저장 */}
      <Dialog open={photoTarget !== null} onOpenChange={(open) => !open && setPhotoTarget(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>검수 사진</DialogTitle>
            <DialogDescription>
              파손·불량 증빙 사진을 붙입니다. 올리면 바로 저장됩니다.
            </DialogDescription>
          </DialogHeader>
          {photoTarget && (
            <AttachmentGallery
              entity="INSPECTION"
              id={photoTarget}
              canEdit={canUpdate}
              emptyText="붙인 사진이 없습니다."
            />
          )}
        </DialogContent>
      </Dialog>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">입고 품목</h2>
        <LocalDataGrid
          id="inbound-inspection-lines"
          columns={LINE_COLUMNS}
          rows={work.lines}
          getRowId={(r) => r.id}
        />
      </section>

      {canUpdate && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-base font-semibold">검수 등록</h2>
          {closed ? (
            <p className="text-sm text-muted-foreground">
              마감된 ASN입니다. 더 검수할 수 없습니다.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                도착한 수량을 고른 단위로 넣습니다. 로트가 다르면 나눠서 등록합니다. 불량 수량은
                재고가 되지 않습니다.
              </p>
              <FormGrid>
                <Field label="품목" span={6} required error={errors.asnLineId} htmlFor="insp-line">
                  <Select
                    value={value.asnLineId}
                    onValueChange={(asnLineId) => {
                      const next = work.lines.find((l) => l.id === asnLineId)
                      set({
                        asnLineId,
                        unit: next?.baseUnit.code ?? '',
                        // 화주사가 알려 준 로트·유통기한을 기본값으로
                        lotNo: next?.useLot ? (next.plannedLotNo ?? '') : '',
                        expiryOn: next?.useExpiry ? (next.plannedExpiryOn ?? '') : '',
                        mfgOn: next?.useExpiry ? (next.plannedMfgOn ?? '') : '',
                      })
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id="insp-line"
                      className="w-full"
                      aria-invalid={Boolean(errors.asnLineId)}
                    >
                      <SelectValue placeholder="품목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {work.lines.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lineNo}. {l.item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="단위" span={2} required error={errors.unit} htmlFor="insp-unit">
                  <Select
                    value={units.includes(value.unit) ? value.unit : ''}
                    onValueChange={(unit) => set({ unit })}
                    disabled={disabled || !line}
                  >
                    <SelectTrigger id="insp-unit" className="w-full">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="검수 수량(정상)"
                  span={2}
                  error={errors.qty}
                  htmlFor="insp-qty"
                  hint={hint ?? undefined}
                >
                  <QtyInput
                    id="insp-qty"
                    value={value.qty}
                    onChange={(qty) => set({ qty })}
                    decimals={decimals}
                    disabled={disabled || !line}
                    aria-invalid={Boolean(errors.qty)}
                  />
                </Field>
                <Field label="불량 수량" span={2} error={errors.defectQty} htmlFor="insp-defect">
                  <QtyInput
                    id="insp-defect"
                    value={value.defectQty}
                    onChange={(defectQty) => set({ defectQty })}
                    decimals={decimals}
                    disabled={disabled || !line}
                  />
                </Field>
                <Field
                  label="로트번호"
                  span={3}
                  newRow
                  required={line?.useLot}
                  error={errors.lotNo}
                  htmlFor="insp-lot"
                  hint={line && !line.useLot ? '로트를 관리하지 않는 품목' : undefined}
                >
                  <Input
                    id="insp-lot"
                    value={value.lotNo}
                    onChange={(e) => set({ lotNo: e.target.value })}
                    disabled={disabled || !line?.useLot}
                  />
                </Field>
                <Field
                  label="제조일"
                  span={3}
                  required={
                    line?.useExpiry && line.expiryInput !== null && line.expiryInput !== 'EXPIRY'
                  }
                  error={errors.mfgOn}
                  htmlFor="insp-mfg"
                  hint={
                    !line?.useExpiry
                      ? undefined
                      : mfgMode
                        ? `유통기한 = 제조일 + ${line.shelfLifeDays}일`
                        : '알면 넣습니다'
                  }
                >
                  <DateInput
                    id="insp-mfg"
                    value={value.mfgOn ?? ''}
                    onChange={(mfgOn) => set({ mfgOn })}
                    disabled={disabled || !line?.useExpiry}
                  />
                </Field>
                <Field
                  label="유통기한"
                  span={3}
                  required={line?.useExpiry && !mfgMode}
                  error={errors.expiryOn}
                  htmlFor="insp-expiry"
                  hint={
                    line && !line.useExpiry
                      ? '유통기한을 관리하지 않는 품목'
                      : mfgMode
                        ? '제조일로 계산됩니다'
                        : undefined
                  }
                >
                  <DateInput
                    id="insp-expiry"
                    value={mfgMode ? computedExpiry : value.expiryOn}
                    onChange={(expiryOn) => set({ expiryOn })}
                    disabled={disabled || !line?.useExpiry || mfgMode}
                  />
                </Field>
                <Field
                  label="불량 사유"
                  span={3}
                  required={hasDefect}
                  error={errors.defectReasonCd}
                  htmlFor="insp-defect-reason"
                  hint={hasDefect ? undefined : '불량 수량을 넣으면 고릅니다'}
                >
                  <CodeSelect
                    id="insp-defect-reason"
                    group="DEFECT_REASON"
                    value={value.defectReasonCd ?? ''}
                    onChange={(defectReasonCd) => set({ defectReasonCd })}
                    disabled={disabled || !hasDefect}
                    invalid={Boolean(errors.defectReasonCd)}
                  />
                </Field>
                <Field label="비고" span={6} error={errors.remark} htmlFor="insp-remark">
                  <Input
                    id="insp-remark"
                    value={value.remark}
                    onChange={(e) => set({ remark: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
              </FormGrid>
              {message && (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="button" onClick={submit} disabled={disabled}>
                  <PlusIcon />
                  검수 등록
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">검수 기록</h2>
        <LocalDataGrid
          id="inbound-inspection-records"
          columns={recordColumns}
          rows={work.inspections}
          getRowId={(r) => r.id}
          empty={{ title: '아직 검수 기록이 없습니다' }}
        />
      </section>
    </div>
  )
}
