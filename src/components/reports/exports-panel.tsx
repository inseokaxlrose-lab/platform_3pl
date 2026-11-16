'use client'

import { DownloadIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import type { ExportSheet } from '@/components/data-grid/export-rows'
import { downloadXlsx } from '@/components/data-grid/export-xlsx'
import { DateRangeInput } from '@/components/inputs'
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
import {
  REPORT_TYPES,
  reportSchema,
  type ReportInput,
  type ReportType,
} from '@/lib/reports/report-schema'

type Option = { id: string; code: string; name: string }
const ALL = '__all__'

// 이번 달 1일 ~ 오늘 (한국 날짜)
function thisMonth() {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  return { from: `${today.slice(0, 8)}01`, to: today }
}

// 정산·보고용 자료 추출 (docs/decisions/0064): 자료 고르기 → 기간·센터·화주사 → [엑셀 내려받기]
export function ExportsPanel({
  centers,
  shippers,
  canExport,
  buildAction,
}: {
  centers: Option[]
  shippers: Option[]
  canExport: boolean
  buildAction: (
    input: ReportInput,
  ) => Promise<ActionResult<{ fileName: string; sheet: ExportSheet; truncated: boolean }>>
}) {
  const [value, setValue] = useState<ReportInput>({
    type: 'MOVEMENT',
    ...thisMonth(),
    centerId: '',
    shipperId: '',
  })
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const report = REPORT_TYPES[value.type as ReportType]

  const download = () =>
    startTransition(async () => {
      setMessage(null)
      const parsed = reportSchema.safeParse(value)
      if (!parsed.success) {
        setMessage({ tone: 'error', text: parsed.error.issues[0].message })
        return
      }
      const result = await buildAction(value)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      const { fileName, sheet, truncated } = result.data
      await downloadXlsx(sheet, fileName, report.label)
      setMessage({
        tone: 'success',
        text: `${sheet.rows.length.toLocaleString()}행을 내려받았습니다.${truncated ? ' 1만 행을 넘어 앞의 1만 행만 담았습니다. 기간·조건을 좁혀 주세요.' : ''}`,
      })
    })

  return (
    <div className="max-w-3xl space-y-6">
      <FormGrid>
        <Field label="자료" span={6} required htmlFor="report-type" hint={report.note}>
          <Select
            value={value.type}
            onValueChange={(type) => setValue((v) => ({ ...v, type: type as ReportType }))}
          >
            <SelectTrigger id="report-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REPORT_TYPES) as ReportType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {REPORT_TYPES[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {report.needsPeriod && (
          <Field label="기간" span={6} required htmlFor="report-period" newRow>
            <DateRangeInput
              id="report-period"
              value={{ from: value.from, to: value.to }}
              onChange={(range) => setValue((v) => ({ ...v, ...range }))}
            />
          </Field>
        )}
        <Field label="센터" span={6} newRow htmlFor="report-center">
          <Select
            value={value.centerId || ALL}
            onValueChange={(centerId) =>
              setValue((v) => ({ ...v, centerId: centerId === ALL ? '' : centerId }))
            }
          >
            <SelectTrigger id="report-center" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="화주사" span={6} htmlFor="report-shipper">
          <Select
            value={value.shipperId || ALL}
            onValueChange={(shipperId) =>
              setValue((v) => ({ ...v, shipperId: shipperId === ALL ? '' : shipperId }))
            }
          >
            <SelectTrigger id="report-shipper" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {shippers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormGrid>
      <div className="flex flex-wrap items-center justify-end gap-3">
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
        {canExport && (
          <Button type="button" onClick={download} disabled={pending}>
            <DownloadIcon />
            {pending ? '만드는 중…' : '엑셀 내려받기'}
          </Button>
        )}
      </div>
    </div>
  )
}
