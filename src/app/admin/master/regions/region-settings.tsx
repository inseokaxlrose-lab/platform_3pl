'use client'

import { DownloadIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import { downloadXlsx } from '@/components/data-grid/export-xlsx'
import { ExcelUploadDialog } from '@/components/excel-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { ADDR_GRADE, REGION_ASSIGN_TYPE, TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import {
  commitRegionUploadAction,
  exportRegionMapAction,
  findRegionByAddressAction,
  getAssignableCentersAction,
  getRegionDashboardAction,
  validateRegionUploadAction,
} from './actions'
import type { AssignableCenter } from './center-pick'
import { RegionChangeDialog, type ChangeRequest } from './region-change-dialog'
import { RegionHistory } from './region-history'
import { RegionPasteDialog } from './region-paste-dialog'
import { RegionSimulator } from './region-simulator'
import { RegionTree, type TreeNode } from './region-tree'
import { REGION_UPLOAD_TEMPLATE } from './region-upload-template'
import { RegionZipPanel } from './region-zip-panel'

// 권역설정 (docs/decisions/0076): 우편번호(5자리)별 배송센터 배정표 하나가 기준
// 위 요약 → [배정] 지역 트리 + 우편번호 표 / [변경 이력] / [시뮬레이터]

type Dashboard = Extract<Awaited<ReturnType<typeof getRegionDashboardAction>>, { ok: true }>['data']

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: 'warning' | 'danger'
}) {
  return (
    <div className="rounded-lg border bg-card p-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'danger'
            ? 'text-xl font-semibold text-destructive'
            : tone === 'warning'
              ? 'text-xl font-semibold text-warning'
              : 'text-xl font-semibold'
        }
      >
        {value}
      </p>
    </div>
  )
}

export function RegionSettings({
  canUpdate,
  canExport,
}: {
  canUpdate: boolean
  canExport: boolean
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [centers, setCenters] = useState<AssignableCenter[]>([])
  const [byTempZone, setByTempZone] = useState(false)
  const [tempZone, setTempZone] = useState<string>(TEMP_ZONE_ALL)
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [request, setRequestState] = useState<ChangeRequest | null>(null)
  // 요청마다 미리보기 창을 새로 그린다 (경계 선택·사유가 처음 상태로)
  const [requestNo, setRequestNo] = useState(0)
  const setRequest = (next: ChangeRequest | null) => {
    if (next) setRequestNo((n) => n + 1)
    setRequestState(next)
  }
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [reveal, setReveal] = useState<{ codes: string[]; nonce: number } | null>(null)
  const [highlightZip, setHighlightZip] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = useCallback(() => {
    // 실패하면 위에 오류 문구 (조용히 비워 두지 않는다)
    getRegionDashboardAction({}).then((r) =>
      r.ok ? setDashboard(r.data) : setMessage({ tone: 'error', text: r.error.message }),
    )
    getAssignableCentersAction({}).then((r) =>
      r.ok ? setCenters(r.data) : setMessage({ tone: 'error', text: r.error.message }),
    )
  }, [])
  useEffect(refresh, [refresh])

  // 저장·확인 뒤: 요약·트리·표를 다시
  const afterChange = (text: string) => {
    setRequest(null)
    setMessage({ tone: 'success', text })
    setReloadKey((k) => k + 1)
    refresh()
  }

  const findByAddress = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await findRegionByAddressAction({ address: search, tempZone })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      const { path, zipCode, grade, row } = result.data
      if (!path) {
        setMessage({
          tone: 'error',
          text: '주소를 찾지 못했습니다. 시·군·구부터 다시 적어 보세요.',
        })
        return
      }
      setHighlightZip(zipCode)
      setReveal({
        codes: [path.sidoCode, path.sigunguCode, path.emdCode].filter((c): c is string =>
          Boolean(c),
        ),
        nonce: Date.now(),
      })
      setMessage({
        tone: 'success',
        text: zipCode
          ? `우편번호 ${zipCode} (${ADDR_GRADE.labels[grade]}) — ${row?.centerName ? `현재 배정: ${row.centerName}` : '미배정'}`
          : `${ADDR_GRADE.labels[grade]}: 우편번호까지는 확인하지 못해 지역만 찾았습니다.`,
      })
    })
  }

  const download = () =>
    startTransition(async () => {
      const result = await exportRegionMapAction({})
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      await downloadXlsx(
        {
          header: [
            '우편번호',
            '시도',
            '시군구',
            '법정동',
            '대표 주소',
            '폐지',
            '온도대',
            '센터코드',
            '센터명',
            '배정 구분',
            '확인',
          ],
          rows: result.data.map((r) => [
            r.zip_cd,
            r.sido_nm ?? '',
            r.sigungu_nm ?? '',
            r.bjd_names ?? '',
            r.rep_addr ?? '',
            r.abolished_yn === 'Y' ? '폐지' : '',
            r.temp_zone_cd === TEMP_ZONE_ALL ? '' : TEMP_ZONE.labels[r.temp_zone_cd as TempZoneKey],
            r.center_cd,
            r.center_nm,
            REGION_ASSIGN_TYPE.labels[r.assign_type_cd as 'MANUAL'] ?? r.assign_type_cd,
            r.confirm_yn === 'Y' ? '' : '확인 필요',
          ]),
        },
        `권역설정_${new Date().toISOString().slice(0, 10)}.xlsx`,
        '권역설정',
      )
    })

  const changeTempMode = (on: boolean) => {
    setByTempZone(on)
    setTempZone(on ? TEMP_ZONE.values[0] : TEMP_ZONE_ALL)
  }

  return (
    <AppPage
      title="권역설정"
      description="우편번호(5자리)마다 배송센터를 정합니다. 납품처에 배송센터가 없을 때 주소 → 우편번호 → 이 배정표로 센터를 정합니다."
      actions={
        <>
          {canUpdate && (
            <RegionPasteDialog centers={centers} tempZone={tempZone} onRequest={setRequest} />
          )}
          {canUpdate && (
            <ExcelUploadDialog
              template={REGION_UPLOAD_TEMPLATE}
              title="권역설정 엑셀 업로드"
              description="우편번호·온도대·센터코드로 배정합니다. 검사 결과와 바뀌는 배정 요약을 먼저 보여 주고, 오류가 없으면 반영합니다."
              validate={validateRegionUploadAction}
              commit={commitRegionUploadAction}
              onDone={() => afterChange('엑셀 업로드를 반영했습니다.')}
            />
          )}
          {canExport && (
            <Button type="button" variant="outline" onClick={download} disabled={pending}>
              <DownloadIcon />
              엑셀 다운로드
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-section">
        {dashboard && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="우편번호" value={dashboard.totalZips.toLocaleString()} />
              <Stat label="배정 (전체 온도대)" value={dashboard.assigned.toLocaleString()} />
              <Stat
                label="미배정"
                value={dashboard.unassigned.toLocaleString()}
                tone={dashboard.unassigned ? 'warning' : undefined}
              />
              <Stat
                label="확인 필요 (자동 추천)"
                value={dashboard.unconfirmed.toLocaleString()}
                tone={dashboard.unconfirmed ? 'danger' : undefined}
              />
              <Stat
                label="지역 마스터"
                value={
                  dashboard.lastLoad ? (
                    <span className="text-base">
                      {dashboard.lastLoad.loadVer}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {dashboard.lastLoad.endedAt
                          ? new Date(dashboard.lastLoad.endedAt).toLocaleDateString('ko-KR')
                          : ''}
                      </span>
                    </span>
                  ) : (
                    '적재 전'
                  )
                }
              />
            </div>
            {dashboard.centers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                센터별 배정:
                {dashboard.centers.map((c) => (
                  <StatusBadge
                    key={c.centerId}
                    tone={c.status === 'SUSPENDED' ? 'warning' : 'info'}
                  >
                    {c.name} {c.count.toLocaleString()}
                    {c.status === 'SUSPENDED' && ' (일시중지)'}
                  </StatusBadge>
                ))}
              </div>
            )}
            {(dashboard.unconfirmed > 0 || dashboard.abolishedAssigned > 0) && (
              <p className="rounded-md border border-dashed p-2 text-sm">
                지역 마스터 갱신 결과:
                {dashboard.unconfirmed > 0 &&
                  ` 신규 우편번호 자동 추천 ${dashboard.unconfirmed}건을 확인해 주세요 (표에서 '확인 필요만' → [추천 확인]).`}
                {dashboard.abolishedAssigned > 0 &&
                  ` 폐지된 우편번호에 배정 ${dashboard.abolishedAssigned}건이 남아 있습니다.`}
              </p>
            )}
          </div>
        )}

        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={
              message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'
            }
          >
            {message.text}
          </p>
        )}

        <Tabs defaultValue="assign">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="assign">배정</TabsTrigger>
              <TabsTrigger value="history">변경 이력</TabsTrigger>
              <TabsTrigger value="simulator">시뮬레이터</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Switch id="by-temp-zone" checked={byTempZone} onCheckedChange={changeTempMode} />
              <Label htmlFor="by-temp-zone" className="font-normal">
                온도대별로 다르게 설정
              </Label>
              {byTempZone && (
                <Select value={tempZone} onValueChange={setTempZone}>
                  <SelectTrigger className="h-8 w-28" aria-label="온도대">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMP_ZONE.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <TabsContent value="assign" className="pt-2">
            {byTempZone && (
              <p className="mb-2 text-xs text-muted-foreground">
                {TEMP_ZONE.labels[tempZone as TempZoneKey]} 온도대 배정을 봅니다. 이 온도대 행이
                없는 우편번호는 회색 &apos;전체:&apos;로 전체 온도대 배정을 따릅니다.
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
              <aside className="space-y-2 rounded-lg border p-card">
                <form onSubmit={findByAddress} className="flex gap-1">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="주소로 찾기"
                    aria-label="주소로 찾기"
                    className="h-8"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={pending || search.trim().length < 2}
                    aria-label="찾기"
                  >
                    <SearchIcon />
                  </Button>
                </form>
                <div className="max-h-[65vh] overflow-y-auto">
                  <RegionTree
                    tempZone={tempZone}
                    reloadKey={reloadKey}
                    selected={selected}
                    onSelect={setSelected}
                    reveal={reveal}
                  />
                </div>
              </aside>
              <section className="min-w-0">
                {selected ? (
                  <RegionZipPanel
                    node={selected}
                    tempZone={tempZone}
                    centers={centers}
                    canUpdate={canUpdate}
                    reloadKey={reloadKey}
                    highlightZip={highlightZip}
                    onRequest={setRequest}
                    onMessage={afterChange}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    왼쪽에서 지역을 고르면 그 아래 우편번호와 배정 상태가 보입니다.
                  </p>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="history" className="pt-2">
            <RegionHistory reloadKey={reloadKey} />
          </TabsContent>
          <TabsContent value="simulator" className="pt-2">
            <RegionSimulator tempZone={tempZone} />
          </TabsContent>
        </Tabs>
      </div>

      <RegionChangeDialog
        key={requestNo}
        request={request}
        onClose={() => setRequest(null)}
        onSaved={afterChange}
      />
    </AppPage>
  )
}
