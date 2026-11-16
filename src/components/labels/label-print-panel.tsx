'use client'

import { EyeIcon, PrinterIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ActionResult } from '@/lib/actions/result'
import { CODE_TYPES, type CodeType } from '@/lib/labels/barcode'
import type { LabelWork } from '@/lib/labels/label-queries'
import type { PrefValue } from '@/lib/prefs/pref-schemas'
import { formatQty } from '@/lib/units/convert'
import {
  LABEL_TEMPLATES,
  LabelPrintStyle,
  LabelSheet,
  templatesOf,
  type LabelTemplateId,
  type LabelView,
} from './label-templates'

type Inspection = LabelWork['inspections'][number]
type Pref = PrefValue<'label-print'>
type PrintLabel = LabelView & { printCount: number }

const COLUMNS: DataGridColumn<Inspection>[] = [
  { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56 },
  { id: 'item', header: '품목', accessor: 'item' },
  { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
  { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
  {
    id: 'inspectedQty',
    header: '검수(정상)',
    accessor: 'inspectedQty',
    align: 'right',
    cell: (r) => `${formatQty(r.inspectedQty)} ${r.baseUnit}`,
  },
  {
    id: 'labelUnit',
    header: '라벨 단위',
    accessor: 'labelUnit',
    cell: (r) =>
      r.labelConvQty ? (
        `${r.labelUnit} ${formatQty(r.labelConvQty)}`
      ) : (
        <span className="text-destructive">{r.labelUnit} 입수량 없음</span>
      ),
  },
  {
    id: 'labels',
    header: '라벨',
    accessor: (r) => r.labelCount,
    cell: (r) => (r.labelCount === 0 ? '미발행' : `${r.labelCount}장 (인쇄 ${r.printedCount}장)`),
  },
]

// 라벨 인쇄 (docs/decisions/0056): 검수 기록 고르기 → 양식·코드 고르기(사용자별 기억) → 미리보기 → 인쇄
// 인쇄는 브라우저 인쇄 → 윈도우 프린터 드라이버 (0003 결정 6). 다시 인쇄하면 같은 라벨 번호로 재발행
export function LabelPrintPanel({
  work,
  canPrint,
  pref: initialPref,
  prepareAction,
  markPrintedAction,
  savePrefAction,
}: {
  work: LabelWork
  canPrint: boolean
  pref: Pref
  prepareAction: (input: { inspectionIds: string[] }) => Promise<ActionResult<PrintLabel[]>>
  markPrintedAction: (input: { labelIds: string[] }) => Promise<ActionResult<unknown>>
  savePrefAction: (input: { key: string; value: unknown }) => Promise<ActionResult<unknown>>
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [pref, setPref] = useState<Pref>(initialPref)
  const [labels, setLabels] = useState<PrintLabel[]>([])
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // 고르기 값이 바뀌면 사용자별로 기억 (실패해도 화면은 계속)
  const changePref = (next: Pref) => {
    setPref(next)
    void savePrefAction({ key: 'label-print', value: next })
  }

  const preview = () =>
    startTransition(async () => {
      setMessage(null)
      const result = await prepareAction({ inspectionIds: selected })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      setLabels(result.data)
      router.refresh()
    })

  const print = () =>
    startTransition(async () => {
      window.print()
      // 인쇄 창을 닫은 뒤 기록 (취소했어도 기록된다 — 다시 인쇄하면 횟수만 는다)
      const result = await markPrintedAction({ labelIds: labels.map((l) => l.id) })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      const reprint = labels.some((l) => l.printCount > 0)
      setMessage({
        tone: 'success',
        text: `${labels.length}장을 인쇄했습니다${reprint ? ' (재발행 포함)' : ''}.`,
      })
      setLabels((current) => current.map((l) => ({ ...l, printCount: l.printCount + 1 })))
      router.refresh()
    })

  const templateOf = (label: PrintLabel): LabelTemplateId => pref.templates[label.labelUnit]

  return (
    <div className="space-y-8">
      <LabelPrintStyle />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">검수 기록</h2>
        <p className="text-sm text-muted-foreground">
          라벨을 뽑을 검수 기록을 고릅니다. 라벨 장수 = 정상 검수 수량 ÷ 라벨 단위 입수량 (마지막
          장은 나머지).
        </p>
        <LocalDataGrid
          id="inbound-label-inspections"
          columns={COLUMNS}
          rows={work.inspections}
          getRowId={(r) => r.id}
          enableRowSelection={canPrint}
          onSelectionChange={setSelected}
          empty={{ title: '검수 기록이 없습니다', description: '먼저 입고 검수를 등록해 주세요.' }}
        />
      </section>

      {canPrint && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-base font-semibold">양식 · 코드</h2>
          <FormGrid>
            {(['PLT', 'BOX'] as const).map((unit) => (
              <Field key={unit} label={`${unit} 양식`} span={4} htmlFor={`label-template-${unit}`}>
                <Select
                  value={pref.templates[unit]}
                  onValueChange={(value) =>
                    changePref({ ...pref, templates: { ...pref.templates, [unit]: value } })
                  }
                >
                  <SelectTrigger id={`label-template-${unit}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesOf(unit).map((id) => (
                      <SelectItem key={id} value={id}>
                        {LABEL_TEMPLATES[id].name}
                        {LABEL_TEMPLATES[id].isDefault ? ' · 기본' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
            <Field label="코드 종류" span={4} htmlFor="label-code-type">
              <Select
                value={pref.codeType}
                onValueChange={(value) => changePref({ ...pref, codeType: value as CodeType })}
              >
                <SelectTrigger id="label-code-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CODE_TYPES) as CodeType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {CODE_TYPES[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormGrid>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {message && (
              <p
                role={message.tone === 'error' ? 'alert' : 'status'}
                className={
                  message.tone === 'error'
                    ? 'mr-auto text-sm text-destructive'
                    : 'mr-auto text-sm text-primary'
                }
              >
                {message.text}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending || selected.length === 0}
              onClick={preview}
            >
              <EyeIcon />
              미리보기{selected.length > 0 ? ` (${selected.length}건)` : ''}
            </Button>
            <Button type="button" disabled={pending || labels.length === 0} onClick={print}>
              <PrinterIcon />
              {labels.length > 0 ? `${labels.length}장 인쇄` : '인쇄'}
            </Button>
          </div>
        </section>
      )}

      {labels.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">미리보기</h2>
          <p className="text-sm text-muted-foreground">
            실제 크기로 보여 줍니다. 프린터 설정에서 용지 크기를 양식과 같게, 배율은 100%(실제
            크기)로 맞춰 주세요.
          </p>
          <div className="label-print-area flex flex-wrap items-start gap-4">
            {labels.map((label) => (
              <div key={label.id} className="space-y-1">
                <div className="border shadow-sm print:border-0 print:shadow-none">
                  <LabelSheet label={label} template={templateOf(label)} codeType={pref.codeType} />
                </div>
                <p className="text-xs text-muted-foreground print:hidden">
                  {label.labelNo} · {label.seq}/{label.total}
                  {label.printCount > 0 ? ` · 인쇄 ${label.printCount}회 (재발행)` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
