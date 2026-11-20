'use client'

import { CalendarSyncIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog, StatusBadge, type StatusTone } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { SearchSelect, type CenterSelectOption } from '@/components/inputs'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { unwrap } from '@/lib/actions'
import { HOLIDAY_DAY_TYPE, HOLIDAY_SYNC_STATUS } from '@/lib/holidays/holiday-codes'
import {
  deleteHolidaysAction,
  listHolidaysAction,
  restoreHolidaysAction,
  syncHolidaysAction,
  type HolidayRow,
} from './actions'
import { EMPTY_HOLIDAY, HolidayDialog, type HolidayDialogTarget } from './holiday-dialog'

type YearStatus = {
  year: number
  status: string
  holidayCount: number
  message: string | null
  syncedAt: Date
}

const KIND_FORMAT = {
  NATIONAL: { label: '국가 공휴일', tone: 'info' },
  CLOSED: { label: HOLIDAY_DAY_TYPE.labels.CLOSED, tone: 'danger' },
  OPEN: { label: HOLIDAY_DAY_TYPE.labels.OPEN, tone: 'success' },
} as const

const SYNC_TONE: Record<string, StatusTone> = { OK: 'success', EMPTY: 'warning', FAILED: 'danger' }

const COLUMNS: DataGridColumn<HolidayRow>[] = [
  {
    id: 'holidayOn',
    header: '날짜',
    accessor: 'holidayOn',
    sortable: true,
    hideable: false,
    pinned: true,
  },
  { id: 'weekday', header: '요일', accessor: 'weekday' },
  { id: 'name', header: '이름', accessor: 'name', sortable: true, hideable: false },
  { id: 'kind', header: '구분', accessor: 'kind', sortable: true, format: { status: KIND_FORMAT } },
  {
    id: 'scope',
    header: '적용 범위',
    sortable: true,
    accessor: (row) =>
      row.source === 'NATIONAL' ? '전국 공통' : (row.centerName ?? '운영사 전체'),
  },
  { id: 'remark', header: '비고', accessor: 'remark' },
  { id: 'updatedBy', header: '수정자', accessor: 'updatedBy', defaultHidden: true },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    defaultHidden: true,
  },
]

// 휴무관리 (docs/decisions/0096): 국가 공휴일(API, 고칠 수 없음) + 운영사·센터 휴무·특근
export function HolidaysList({
  thisYear,
  apiReady,
  years,
  centers,
  canOperatorWide,
  can,
}: {
  thisYear: number
  apiReady: boolean
  years: YearStatus[]
  centers: CenterSelectOption[]
  canOperatorWide: boolean
  can: { create: boolean; update: boolean; delete: boolean }
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'year',
      label: '연도',
      type: 'segment',
      options: [thisYear - 1, thisYear, thisYear + 1].map((y) => ({
        value: String(y),
        label: `${y}년`,
      })),
    },
    { key: 'keyword', label: '검색어', type: 'keyword', placeholder: '휴일 이름' },
    {
      key: 'kind',
      label: '구분',
      type: 'multi',
      options: Object.entries(KIND_FORMAT).map(([value, f]) => ({ value, label: f.label })),
    },
    {
      key: 'center',
      label: '센터',
      type: 'custom',
      render: ({ id, value, onChange }) => (
        <SearchSelect
          id={id}
          options={[
            { value: '', label: '전체' },
            ...centers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code})`,
              keywords: c.code,
            })),
          ]}
          value={value}
          onChange={onChange}
          placeholder="전체"
          className="w-full"
        />
      ),
    },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      allLabel: '등록됨',
      options: [DELETED_STATUS_OPTION],
      detail: true,
    },
  ]
  const list = useListQuery<HolidayRow>({
    gridId: 'system-holidays',
    fields: searchFields,
    fetch: listHolidaysAction,
  })
  const [dialog, setDialog] = useState<HolidayDialogTarget | null>(null)
  const deletedView = isDeletedView(list.values)

  return (
    <>
      <MasterListPage
        title="휴무관리"
        description="국가 공휴일은 공공데이터포털에서 자동으로 가져옵니다. 운영사·센터의 휴무일과, 쉬는 날 일하는 특근일을 등록하세요."
        meta={<YearBadges years={years} apiReady={apiReady} />}
        actions={
          <>
            {can.update && <SyncButton thisYear={thisYear} onDone={list.refresh} />}
            {can.create && (
              <Button
                type="button"
                onClick={() =>
                  setDialog({
                    mode: 'create',
                    initial: {
                      ...EMPTY_HOLIDAY,
                      // 센터 직원은 운영사 전체를 고를 수 없으므로 첫 센터로
                      centerId: canOperatorWide ? '' : (centers[0]?.id ?? ''),
                    },
                  })
                }
              >
                <PlusIcon />
                휴일 등록
              </Button>
            )}
          </>
        }
        gridId="system-holidays"
        searchFields={searchFields}
        list={list}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        onRowClick={
          deletedView || !can.update
            ? undefined
            : (row) => {
                if (!row.editable || row.rowVersion === null) return
                setDialog({
                  mode: 'edit',
                  id: row.id,
                  rowVersion: row.rowVersion,
                  initial: {
                    centerId: row.centerId ?? '',
                    holidayOn: row.holidayOn,
                    name: row.name,
                    dayType: row.kind === 'OPEN' ? 'OPEN' : 'CLOSED',
                    remark: row.remark ?? '',
                  },
                })
              }
        }
        canSelectRow={(row) => row.editable}
        bulkActions={
          !can.delete
            ? undefined
            : deletedView
              ? ({ ids, done }) => (
                  <RestoreButton
                    ids={ids}
                    noun="휴일"
                    restore={(restoreIds) => restoreHolidaysAction({ ids: restoreIds })}
                    done={done}
                  />
                )
              : ({ ids, done }) => (
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="destructive" disabled={ids.length === 0}>
                        <Trash2Icon />
                        삭제{ids.length > 0 && ` (${ids.length})`}
                      </Button>
                    }
                    title={`휴일 ${ids.length}건을 삭제할까요?`}
                    description='국가 공휴일은 지울 수 없습니다. 쉬지 않으려면 같은 날짜로 "특근"을 등록하세요. 지운 휴일은 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
                    confirmLabel="삭제"
                    destructive
                    onConfirm={async () => {
                      unwrap(await deleteHolidaysAction({ ids }))
                      done()
                    }}
                  />
                )
        }
        emptyTitle="등록된 휴일이 없습니다"
      />
      <HolidayDialog
        target={dialog}
        onClose={() => setDialog(null)}
        onDone={list.refresh}
        centers={centers}
        canOperatorWide={canOperatorWide}
        canDelete={can.delete}
      />
    </>
  )
}

// 연도별 국가 공휴일 가져오기 결과
function YearBadges({ years, apiReady }: { years: YearStatus[]; apiReady: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">국가 공휴일</span>
      {years.length === 0 && <StatusBadge tone="neutral">아직 가져오지 않음</StatusBadge>}
      {years.map((y) => (
        <span key={y.year} title={y.message ?? undefined}>
          <StatusBadge tone={SYNC_TONE[y.status] ?? 'neutral'}>
            {y.year}년{' '}
            {y.status === 'OK'
              ? `${y.holidayCount}일`
              : (HOLIDAY_SYNC_STATUS.labels as Record<string, string>)[y.status]}
          </StatusBadge>
        </span>
      ))}
      {!apiReady && (
        <span className="text-warning">
          공휴일 API 키가 없어 자동으로 가져오지 못합니다. 시스템 담당자에게 키
          설정(DATA_GO_KR_SERVICE_KEY)을 요청하세요.
        </span>
      )}
    </div>
  )
}

// [공휴일 다시 가져오기]: 연도를 골라 API에서 통째로 다시 받는다 (임시공휴일 지정 등)
function SyncButton({ thisYear, onDone }: { thisYear: number; onDone: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(String(thisYear))
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const result = await syncHolidaysAction({ year: Number(year) })
      if (!result.ok) {
        setMessage({ ok: false, text: result.error.message })
        return
      }
      const { status, count, message: reason } = result.data
      setMessage(
        status === 'OK'
          ? { ok: true, text: `${year}년 국가 공휴일 ${count}일을 가져왔습니다.` }
          : { ok: false, text: reason ?? '가져오지 못했습니다.' },
      )
      onDone()
      // 위쪽 연도별 결과 배지도 새로
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setMessage(null)
      }}
    >
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <CalendarSyncIcon />
        공휴일 다시 가져오기
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>국가 공휴일 다시 가져오기</DialogTitle>
          <DialogDescription>
            공공데이터포털에서 고른 연도의 공휴일을 통째로 다시 받습니다. 임시공휴일이 새로 지정됐을
            때 쓰세요. 받지 못하면 기존 공휴일은 그대로 둡니다.
          </DialogDescription>
        </DialogHeader>
        <Select value={year} onValueChange={setYear} disabled={pending}>
          <SelectTrigger className="w-full" aria-label="연도">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}년
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {message.text}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            닫기
          </Button>
          <Button type="button" onClick={run} disabled={pending}>
            {pending ? '가져오는 중…' : '가져오기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
