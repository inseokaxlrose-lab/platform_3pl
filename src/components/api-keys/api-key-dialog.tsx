'use client'

import { TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { DateInput, NumberInput } from '@/components/inputs'
import { EditableSubTable, Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { API_ENV, API_SCOPE, DEFAULT_SCOPES } from '@/lib/api/api-codes'
import { apiKeyIssueSchema, apiKeyUpdateSchema, EMPTY_API_KEY_FORM } from '@/lib/api/api-key-schema'
import type { ShipperApiKey } from '@/lib/api/api-key-queries'
import {
  issueApiKeyAction,
  listApiKeyEventsAction,
  updateApiKeyAction,
} from '@/app/admin/integration/api-keys/actions'

type FormValue = typeof EMPTY_API_KEY_FORM & { env: string }

const EVENT_LABEL: Record<string, string> = {
  ISSUED: '발급',
  UPDATED: '수정',
  REVOKED: '폐기',
  EXPIRED: '만료',
}
const FIELD_LABEL: Record<string, string> = {
  name: '이름',
  scopes: '권한',
  ips: '허용 IP',
  expiresAt: '만료일',
  rateLimitPerMin: '호출 한도',
}

type Event = { id: string; event: string; detail: unknown; actor: string; createdAt: Date }

// 이력 한 줄 설명: 수정이면 바뀐 칸 이름, 폐기면 사유
function describe(event: Event) {
  const detail = (event.detail ?? {}) as Record<string, unknown>
  if (event.event === 'UPDATED') {
    return Object.keys(detail)
      .map((key) => FIELD_LABEL[key] ?? key)
      .join('·')
  }
  if (event.event === 'REVOKED') return String(detail.reason ?? '')
  return ''
}

// API 키 발급·수정 팝업 (0081) — 부모가 열 때마다 새로 만든다 (닫으면 없앤다)
// - 발급: 키 이름·환경·권한(기본: 조회+쓰기 전부)·허용 IP·만료일·호출 한도 → 성공하면 onIssued(원문)
// - 수정: 환경은 바꿀 수 없다(키 글자에 들어 있음). 아래에 키 이력
export function ApiKeyDialog({
  mode,
  shipperId,
  apiKey,
  open,
  onOpenChange,
  onIssued,
  onSaved,
}: {
  mode: 'issue' | 'edit'
  shipperId: string
  apiKey?: ShipperApiKey
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssued?: (fullKey: string) => void
  onSaved: () => void
}) {
  const initial = (): FormValue =>
    apiKey
      ? {
          name: apiKey.name,
          env: apiKey.env,
          scopes: apiKey.scopes,
          ips: apiKey.ips,
          expiresOn: apiKey.expiresOn,
          rateLimitPerMin: apiKey.rateLimitPerMin,
        }
      : { ...EMPTY_API_KEY_FORM, env: 'TEST', scopes: [...DEFAULT_SCOPES] }
  const [value, setValue] = useState<FormValue>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [pending, startTransition] = useTransition()
  const set = (patch: Partial<FormValue>) => setValue((v) => ({ ...v, ...patch }))

  // 수정이면 키 이력을 불러온다 (팝업은 열 때마다 새로 만들어져 값은 늘 처음 값)
  const editingId = mode === 'edit' ? apiKey?.id : undefined
  useEffect(() => {
    if (!editingId) return
    void listApiKeyEventsAction({ id: editingId }).then((result) => {
      if (result.ok) setEvents(result.data as unknown as Event[])
    })
  }, [editingId])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed =
      mode === 'issue'
        ? apiKeyIssueSchema.safeParse({ ...value, shipperId })
        : apiKeyUpdateSchema.safeParse(value)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      )
      return
    }
    setErrors({})
    startTransition(async () => {
      const result =
        mode === 'issue'
          ? await issueApiKeyAction({ ...value, shipperId })
          : await updateApiKeyAction({ ...value, id: apiKey!.id, rowVersion: apiKey!.rowVersion })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(Object.keys(fieldErrors).length > 0 ? null : result.error.message)
        return
      }
      onOpenChange(false)
      if (mode === 'issue') onIssued?.((result.data as { fullKey: string }).fullKey)
      onSaved()
    })
  }

  const toggleScope = (scope: string, checked: boolean) =>
    set({
      scopes: checked ? [...value.scopes, scope] : value.scopes.filter((s) => s !== scope),
    })
  const id = (key: string) => `api-key-${key}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === 'issue' ? 'API 키 발급' : `API 키 수정 · ${apiKey?.key}`}
            </DialogTitle>
            <DialogDescription>
              {mode === 'issue'
                ? 'TEST 키로 연동을 검증한 뒤 LIVE 키를 발급하세요. 키 원문은 발급 직후 한 번만 보입니다.'
                : '이름·권한·허용 IP·만료일·호출 한도를 고칩니다. 바꾼 내용은 키 이력에 남습니다.'}
            </DialogDescription>
          </DialogHeader>
          <FormGrid>
            <Field label="키 이름" span={8} required error={errors.name} htmlFor={id('name')}>
              <Input
                id={id('name')}
                value={value.name}
                placeholder="예: ERP 연동용"
                maxLength={50}
                onChange={(e) => set({ name: e.target.value })}
                disabled={pending}
              />
            </Field>
            <Field
              label="환경"
              span={4}
              required
              hint={mode === 'issue' ? 'TEST는 검증만 하고 저장 안 함' : '바꿀 수 없음'}
              error={errors.env}
              htmlFor={id('env')}
            >
              <Select
                value={value.env}
                onValueChange={(env) => set({ env })}
                disabled={pending || mode === 'edit'}
              >
                <SelectTrigger id={id('env')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_ENV.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.value} ({o.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="권한" span={12} required error={errors.scopes} htmlFor={id('scope-0')}>
              <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
                {API_SCOPE.options.map((o, index) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      id={id(`scope-${index}`)}
                      checked={value.scopes.includes(o.value)}
                      onCheckedChange={(checked) => toggleScope(o.value, checked === true)}
                      disabled={pending}
                    />
                    <Label htmlFor={id(`scope-${index}`)} className="font-normal">
                      {o.label} <span className="text-xs text-muted-foreground">{o.value}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </Field>
            <Field
              label="만료일"
              span={4}
              hint="비우면 무기한"
              error={errors.expiresOn}
              htmlFor={id('expires')}
            >
              <DateInput
                id={id('expires')}
                value={value.expiresOn}
                onChange={(expiresOn) => set({ expiresOn })}
                disabled={pending}
              />
            </Field>
            <Field
              label="분당 호출 한도"
              span={4}
              required
              error={errors.rateLimitPerMin}
              htmlFor={id('rate')}
            >
              <NumberInput
                id={id('rate')}
                value={value.rateLimitPerMin}
                onChange={(n) => set({ rateLimitPerMin: n ?? 0 })}
                min={1}
                max={6000}
                unit="회"
                disabled={pending}
              />
            </Field>
          </FormGrid>
          <div className="grid gap-2">
            <Label>허용 IP</Label>
            <EditableSubTable
              name="ips"
              rows={value.ips}
              onChange={(ips) => set({ ips })}
              columns={[
                { key: 'ipCidr', label: 'IP 또는 CIDR', required: true, width: '14rem' },
                { key: 'description', label: '설명' },
              ]}
              createRow={() => ({ ipCidr: '', description: '' })}
              maxRows={20}
              errors={errors}
              addLabel="IP 추가"
              countUnit="개"
              emptyText="비워 두면 모든 IP에서 호출할 수 있습니다."
              disabled={pending}
            />
            {value.env === 'LIVE' && value.ips.length === 0 && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlertIcon className="size-3.5" />
                LIVE 키는 화주 서버 IP로 제한하는 것을 권장합니다.
              </p>
            )}
          </div>
          {mode === 'edit' && events.length > 0 && (
            <div className="grid gap-2">
              <Label>키 이력</Label>
              <ul className="divide-y rounded-md border text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 px-3 py-1.5">
                    <span className="font-medium">{EVENT_LABEL[e.event] ?? e.event}</span>
                    <span className="text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString('ko-KR')} · {e.actor}
                    </span>
                    {describe(e) && <span>{describe(e)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '처리 중…' : mode === 'issue' ? '발급' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
