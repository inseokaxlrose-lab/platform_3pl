'use client'

import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'
import { StatusBadge } from '@/components/common'
import { createDataGridState, DataGrid, type DataGridColumn } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/actions/result'
import {
  mapRows,
  MAX_UPLOAD_BYTES,
  type UploadPreview,
  type UploadPreviewRow,
  type UploadRow,
  type UploadTemplate,
} from '@/lib/excel/upload'
import { downloadTemplate, readXlsxTable } from '@/lib/excel/xlsx-file'

type ExcelUploadDialogProps = {
  template: UploadTemplate
  title: string
  description?: string
  // 대화상자를 여는 버튼 (없으면 기본 [엑셀 업로드])
  trigger?: React.ReactNode
  // 서버 검증 (저장하지 않는다): 행마다 오류 문구
  validate: (rows: UploadRow[]) => Promise<ActionResult<UploadPreview>>
  // 등록: 서버가 다시 검증하고, 오류가 하나라도 있으면 아무것도 저장하지 않는다
  commit: (rows: UploadRow[]) => Promise<ActionResult<{ message: string }>>
  // 등록 성공 후 (예: 목록 새로고침)
  onDone?: () => void
  disabled?: boolean
}

// 엑셀 업로드 공통 대화상자 (docs/decisions/0049, 0003 "엑셀 업로드 공통 규칙")
// 1) [양식 내려받기] → 2) 파일 고르기 → 서버 검증 미리보기(오류 행·사유) → 3) 오류가 없으면 [등록]
// 화면마다 양식(template)과 검증·등록 서버 액션만 넘기면 된다
export function ExcelUploadDialog({
  template,
  title,
  description,
  trigger,
  validate,
  commit,
  onDone,
  disabled,
}: ExcelUploadDialogProps) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<UploadRow[]>([])
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [grid, setGrid] = useState(() => createDataGridState())
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFileName('')
    setRows([])
    setPreview(null)
    setMessage(null)
    setOnlyErrors(false)
    setGrid(createDataGridState())
    if (fileInput.current) fileInput.current.value = ''
  }

  // 파일 고르기 → 읽기 → 서버 검증
  const pickFile = (file: File | undefined) => {
    if (!file) return
    reset()
    setFileName(file.name)
    startTransition(async () => {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setMessage({
          tone: 'error',
          text: '.xlsx 파일만 올릴 수 있습니다. 양식을 내려받아 써 주세요.',
        })
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setMessage({ tone: 'error', text: '파일이 너무 큽니다 (5MB까지).' })
        return
      }
      let table: string[][]
      try {
        table = await readXlsxTable(await file.arrayBuffer())
      } catch {
        setMessage({
          tone: 'error',
          text: '엑셀 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.',
        })
        return
      }
      const mapped = mapRows(template, table)
      if (mapped.error) {
        setMessage({ tone: 'error', text: mapped.error })
        return
      }
      const result = await validate(mapped.rows)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      setRows(mapped.rows)
      setPreview(result.data)
      setOnlyErrors(result.data.errorCount > 0)
    })
  }

  const submit = () =>
    startTransition(async () => {
      const result = await commit(rows)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      reset()
      setMessage({ tone: 'success', text: result.data.message })
      onDone?.()
    })

  // 미리보기 표: 행 번호 · 결과 · 오류 · 양식의 칸들 (화면에서 나눠 보여 준다)
  const columns = useMemo<DataGridColumn<UploadPreviewRow>[]>(
    () => [
      { id: 'rowNo', header: '행', accessor: 'rowNo', format: 'number', width: 64, pinned: true },
      {
        id: 'result',
        header: '결과',
        accessor: (row) => (row.errors.length ? '오류' : '정상'),
        width: 80,
        cell: (row) =>
          row.errors.length ? (
            <StatusBadge tone="danger">오류</StatusBadge>
          ) : (
            <StatusBadge tone="success">정상</StatusBadge>
          ),
      },
      {
        id: 'errors',
        header: '오류 사유',
        accessor: (row) => row.errors.join(' / '),
        width: 320,
        cell: (row) => <span className="text-destructive">{row.errors.join(' / ')}</span>,
      },
      ...template.columns.map<DataGridColumn<UploadPreviewRow>>((column) => ({
        id: column.key,
        header: column.header,
        accessor: (row) => row.values[column.key] ?? '',
      })),
    ],
    [template],
  )
  const shown = (preview?.rows ?? []).filter((row) => !onlyErrors || row.errors.length > 0)
  const page = shown.slice(grid.pageIndex * grid.pageSize, (grid.pageIndex + 1) * grid.pageSize)
  const canCommit = Boolean(preview) && preview!.errorCount === 0 && !pending

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" disabled={disabled}>
            <UploadIcon />
            엑셀 업로드
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              '양식을 내려받아 채운 뒤 올리면 먼저 검사 결과를 보여 줍니다. 오류가 하나라도 있으면 등록되지 않습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate(template)}
          >
            <DownloadIcon />
            양식 내려받기
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="엑셀 파일"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => fileInput.current?.click()}
          >
            <FileSpreadsheetIcon />
            파일 고르기
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          {pending && <span className="text-sm text-muted-foreground">처리 중…</span>}
        </div>

        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={
              message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'
            }
          >
            {message.text}
          </p>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className={
                  preview.errorCount
                    ? 'text-sm font-medium text-destructive'
                    : 'text-sm font-medium'
                }
              >
                {preview.summary}
              </p>
              <div className="flex items-center gap-2">
                <Switch
                  id="excel-upload-only-errors"
                  checked={onlyErrors}
                  onCheckedChange={(checked) => {
                    setOnlyErrors(checked)
                    setGrid((g) => ({ ...g, pageIndex: 0 }))
                  }}
                />
                <Label htmlFor="excel-upload-only-errors" className="text-sm font-normal">
                  오류 행만 보기
                </Label>
              </div>
            </div>
            <DataGrid
              id="excel-upload-preview"
              columns={columns}
              data={page}
              rowCount={shown.length}
              state={grid}
              onStateChange={setGrid}
              getRowId={(row) => String(row.rowNo)}
              searchable={false}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            닫기
          </Button>
          <Button type="button" disabled={!canCommit} onClick={submit}>
            <UploadIcon />
            {preview && preview.errorCount === 0 ? `${preview.rows.length}행 등록` : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
