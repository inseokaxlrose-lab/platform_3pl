'use client'

import { MapPinPlusIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { Can } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { unwrap } from '@/lib/actions'
import { parseZipInput } from '@/lib/routes/zip-input'
import {
  assignRouteZipsAction,
  listRouteRegionsAction,
  planRouteZipsAction,
  unassignRouteZipsAction,
} from './actions'

// 코스 우편번호 배정 (0095): 이 코스로 보낼 우편번호 목록 + [우편번호 추가](붙여넣기·지역) + [빼기]
// 납품처는 직접 지정한 코스가 없으면 "배송센터 + 우편번호"로 이 배정을 따른다

type ZipRow = {
  zipCode: string
  bjdNames: string
  repAddress: string | null
  abolished: boolean
  regionCenterName: string | null
  otherCenter: boolean
  assignedAt: Date
  assignedBy: string
}

type RegionOption = {
  level: 'SIDO' | 'SIGUNGU' | 'EMD'
  code: string
  name: string
  zipCount: number
}

type Plan = {
  count: number
  already: number
  moves: { code: string; name: string; count: number }[]
  unknown: string[]
  outsideCenter: number
  invalid: string[]
}

const COLUMNS: DataGridColumn<ZipRow>[] = [
  { id: 'zipCode', header: '우편번호', accessor: 'zipCode', width: 100 },
  { id: 'bjdNames', header: '법정동', accessor: 'bjdNames', width: 220 },
  { id: 'repAddress', header: '대표 주소', accessor: 'repAddress', width: 260 },
  {
    id: 'regionCenterName',
    header: '권역 센터',
    accessor: 'regionCenterName',
    width: 140,
    cell: (row) =>
      row.otherCenter ? (
        <StatusBadge tone="warning">{row.regionCenterName ?? '미배정'}</StatusBadge>
      ) : (
        row.regionCenterName
      ),
  },
  { id: 'assignedAt', header: '배정일시', accessor: 'assignedAt', format: 'datetime', width: 150 },
  { id: 'assignedBy', header: '배정자', accessor: 'assignedBy', width: 110 },
]

// 지역 한 단계 고르기 (부모가 바뀌면 다시 불러온다)
function RegionLevelSelect({
  parent,
  value,
  onChange,
  placeholder,
}: {
  parent: { level: 'SIDO' | 'SIGUNGU'; code: string } | null | undefined
  value: string
  onChange: (option: RegionOption | null) => void
  placeholder: string
}) {
  const [options, setOptions] = useState<RegionOption[]>([])
  const parentKey =
    parent === undefined ? 'NONE' : parent ? `${parent.level}:${parent.code}` : 'ROOT'
  useEffect(() => {
    if (parent === undefined) return
    let alive = true
    listRouteRegionsAction({ parent }).then((result) => {
      if (alive && result.ok) setOptions(result.data as RegionOption[])
    })
    return () => {
      alive = false
    }
    // parentKey가 바뀔 때만 다시 불러온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKey])
  const shown = parent === undefined ? [] : options
  return (
    <Select
      value={value || 'NONE'}
      onValueChange={(v) =>
        onChange(v === 'NONE' ? null : (shown.find((o) => o.code === v) ?? null))
      }
      disabled={parent === undefined}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NONE">{placeholder}</SelectItem>
        {shown.map((o) => (
          <SelectItem key={o.code} value={o.code}>
            {o.name} ({o.zipCount.toLocaleString('ko-KR')})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AddZipsDialog({ routeId, centerName }: { routeId: string; centerName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sido, setSido] = useState<RegionOption | null>(null)
  const [sigungu, setSigungu] = useState<RegionOption | null>(null)
  const [emd, setEmd] = useState<RegionOption | null>(null)
  const [onlyCenter, setOnlyCenter] = useState(true)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const node = emd ?? sigungu ?? sido
  const source = {
    routeId,
    text,
    node: node ? { level: node.level, code: node.code } : null,
    onlyCenter,
  }
  const parsed = parseZipInput(text)
  // 입력이 바뀌면 미리보기를 다시 해야 한다
  const reset = () => {
    setPlan(null)
    setError(null)
  }

  const preview = () =>
    startTransition(async () => {
      const result = await planRouteZipsAction(source)
      if (result.ok) setPlan(result.data)
      else setError(result.error.message)
    })
  const assign = () =>
    startTransition(async () => {
      const result = await assignRouteZipsAction(source)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setOpen(false)
      setText('')
      setSido(null)
      setSigungu(null)
      setEmd(null)
      reset()
      router.refresh()
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <MapPinPlusIcon />
          우편번호 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>우편번호 추가</DialogTitle>
          <DialogDescription>
            붙여넣거나 지역을 고릅니다. 둘 다 넣으면 합쳐서 배정합니다. 같은 센터의 다른 코스에 있던
            우편번호는 이 코스로 옮겨집니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="route-zip-text">우편번호 붙여넣기</Label>
            <Textarea
              id="route-zip-text"
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                reset()
              }}
              placeholder="16300, 16301 또는 16300-16399 (줄바꿈·쉼표로 구분)"
            />
            {text.trim() && (
              <p className="text-xs text-muted-foreground">
                {parsed.zips.length.toLocaleString('ko-KR')}개
                {parsed.invalid.length > 0 && (
                  <span className="text-destructive"> · 잘못된 값 {parsed.invalid.join(', ')}</span>
                )}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>지역으로 고르기</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <RegionLevelSelect
                parent={null}
                value={sido?.code ?? ''}
                placeholder="시도"
                onChange={(option) => {
                  setSido(option)
                  setSigungu(null)
                  setEmd(null)
                  reset()
                }}
              />
              <RegionLevelSelect
                parent={sido ? { level: 'SIDO', code: sido.code } : undefined}
                value={sigungu?.code ?? ''}
                placeholder="시군구 (전체)"
                onChange={(option) => {
                  setSigungu(option)
                  setEmd(null)
                  reset()
                }}
              />
              <RegionLevelSelect
                parent={sigungu ? { level: 'SIGUNGU', code: sigungu.code } : undefined}
                value={emd?.code ?? ''}
                placeholder="읍면동 (전체)"
                onChange={(option) => {
                  setEmd(option)
                  reset()
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              읍면동을 고르면 다른 읍면동에 걸친 경계 우편번호는 빠집니다. 필요하면 붙여넣기로
              넣으세요.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={onlyCenter}
              onCheckedChange={(checked) => {
                setOnlyCenter(checked === true)
                reset()
              }}
            />
            권역설정에서 {centerName}(으)로 배정된 우편번호만
          </label>
          {plan && (
            <div className="rounded-md border p-3 text-sm" data-testid="route-zip-plan">
              <p className="font-medium">
                {plan.count.toLocaleString('ko-KR')}개를 이 코스로 배정합니다.
              </p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {plan.already > 0 && <li>이미 이 코스: {plan.already}개</li>}
                {plan.moves.map((m) => (
                  <li key={m.code}>
                    {m.name}({m.code})에서 옮김: {m.count}개
                  </li>
                ))}
                {plan.outsideCenter > 0 && (
                  <li className="text-warning">
                    권역설정의 센터가 {centerName}이(가) 아닌 우편번호: {plan.outsideCenter}개
                  </li>
                )}
                {plan.unknown.length > 0 && (
                  <li>지역 마스터에 없거나 폐지되어 뺌: {plan.unknown.slice(0, 5).join(', ')}</li>
                )}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          {plan ? (
            <Button type="button" onClick={assign} disabled={pending || plan.count === 0}>
              배정
            </Button>
          ) : (
            <Button
              type="button"
              onClick={preview}
              disabled={pending || (parsed.zips.length === 0 && !node)}
            >
              미리보기
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RouteZipPanel({
  routeId,
  centerName,
  zips,
}: {
  routeId: string
  centerName: string
  zips: ZipRow[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const otherCenter = useMemo(() => zips.filter((z) => z.otherCenter).length, [zips])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {zips.length.toLocaleString('ko-KR')}개 우편번호
          {otherCenter > 0 && (
            <span className="text-warning">
              {' '}
              · 권역설정의 센터가 {centerName}이(가) 아닌 것 {otherCenter}개
            </span>
          )}
        </p>
        <Can permission="master.routes.update">
          <div className="flex gap-2">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" disabled={selected.length === 0}>
                  <Trash2Icon />
                  빼기{selected.length > 0 && ` (${selected.length})`}
                </Button>
              }
              title={`우편번호 ${selected.length}개를 이 코스에서 뺄까요?`}
              description="뺀 우편번호의 납품처는 직접 지정한 코스가 없으면 코스 없음이 됩니다."
              confirmLabel="빼기"
              destructive
              onConfirm={async () => {
                unwrap(await unassignRouteZipsAction({ routeId, zips: selected }))
                setSelected([])
                router.refresh()
              }}
            />
            <AddZipsDialog routeId={routeId} centerName={centerName} />
          </div>
        </Can>
      </div>
      <LocalDataGrid
        id="route-zips"
        columns={COLUMNS}
        rows={zips}
        getRowId={(row) => row.zipCode}
        enableRowSelection
        onSelectionChange={setSelected}
        empty={{ title: '배정한 우편번호가 없습니다.' }}
      />
    </div>
  )
}
