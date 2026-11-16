'use client'

import { PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormSection,
  type MasterFormHeader,
} from '@/components/master-form'
import { NumberInput } from '@/components/inputs'
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
import {
  deliveryZoneSchema,
  type DeliveryZoneInput,
} from '@/lib/delivery-zones/delivery-zone-schema'
import { DEFAULT_ZONE_PRIORITY, describeOverlaps } from '@/lib/delivery-zones/routing'
import { cn } from '@/lib/utils'
import {
  createDeliveryZoneAction,
  setDeliveryZonesActiveAction,
  updateDeliveryZoneAction,
} from './actions'
import type { DeliveryZoneForEdit, TakenRegions, ZoneRegionInfo } from './queries'
import { RegionPicker } from './region-picker'

type CenterOption = { id: string; code: string; name: string }

type DeliveryZoneFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록
  zone?: DeliveryZoneForEdit
  // 등록: 고를 수 있는 센터, 미리 고른 센터
  centers?: CenterOption[]
  initialCenterId?: string
  // 센터별로 다른 권역이 이미 담당하는 지역
  taken: TakenRegions
  // 모든 센터 권역의 담당 지역 (다른 센터와 겹침 안내, 0072)
  others: ZoneRegionInfo[]
  readOnly: boolean
  // 사용 중지/다시 사용 가능 여부
  canToggleActive?: boolean
}

const LIST_HREF = '/admin/master/delivery-zones'

// 배송권역 등록·수정 (docs/decisions/0033, 입력 화면 틀 0031)
// 등록하면 수정 화면으로, 수정은 그 자리에서 저장. 상태는 따로 처리하는 섹션
export function DeliveryZoneForm({
  header,
  zone,
  centers = [],
  initialCenterId,
  taken,
  others,
  readOnly,
  canToggleActive = false,
}: DeliveryZoneFormProps) {
  const router = useRouter()
  const form = useMasterForm({
    initial:
      zone?.input ??
      ({
        centerId: initialCenterId ?? '',
        code: '',
        name: '',
        description: '',
        priority: DEFAULT_ZONE_PRIORITY,
        regionCodes: [],
      } satisfies DeliveryZoneInput),
    version: zone?.rowVersion,
    schema: deliveryZoneSchema,
    save: (value: DeliveryZoneInput, version) =>
      zone
        ? updateDeliveryZoneAction({
            id: zone.id,
            rowVersion: version ?? zone.rowVersion,
            ...value,
          })
        : createDeliveryZoneAction(value),
    afterSave: (saved) => ({
      ...saved,
      // 검사를 거친 값은 키가 bigint라 화면 값(글자)으로 되돌린다
      centerId: String(saved.centerId),
      description: saved.description ?? '',
    }),
    onSuccess: zone
      ? undefined
      : (created) => router.push(`${LIST_HREF}/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  // 다른 센터 권역과 겹치는 곳마다 어느 쪽이 우선인지 (고르는 대로 바로 계산, 저장은 막지 않는다)
  const overlaps = value.centerId
    ? describeOverlaps(
        { regionCodes: value.regionCodes, priority: value.priority ?? DEFAULT_ZONE_PRIORITY },
        others.filter((o) => o.centerId !== value.centerId),
      )
    : []

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="센터"
            span={6}
            required
            error={errors.centerId}
            htmlFor="zone-center"
            hint={zone ? '센터는 등록 후 바꿀 수 없습니다.' : undefined}
          >
            {zone ? (
              <Input
                id="zone-center"
                value={`${zone.center.name} (${zone.center.code})`}
                disabled
                readOnly
              />
            ) : (
              <Select
                value={value.centerId}
                // 센터가 바뀌면 "이미 쓰는 지역"이 달라지므로 고른 지역을 비운다
                onValueChange={(centerId) => set({ centerId, regionCodes: [] })}
                disabled={disabled}
              >
                <SelectTrigger
                  id="zone-center"
                  className="w-full"
                  aria-invalid={Boolean(errors.centerId)}
                >
                  <SelectValue placeholder="센터 선택" />
                </SelectTrigger>
                <SelectContent>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="권역명" span={8} required newRow error={errors.name} htmlFor="zone-name">
            <Input
              id="zone-name"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              placeholder="예: 서울 전역, 경기 남부"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="권역 코드" span={4} error={errors.code} htmlFor="zone-code">
            <Input
              id="zone-code"
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={disabled}
              placeholder="비우면 시스템 코드 사용"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          <Field label="시스템 코드" span={4} htmlFor="zone-system-code">
            <Input
              id="zone-system-code"
              value={zone?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
          <Field
            label="우선순위"
            span={4}
            error={errors.priority}
            htmlFor="zone-priority"
            hint="다른 센터 권역과 같은 지역으로 겹칠 때 작은 번호가 먼저 (1~999)"
          >
            <NumberInput
              id="zone-priority"
              value={value.priority ?? DEFAULT_ZONE_PRIORITY}
              onChange={(n) => set({ priority: n ?? DEFAULT_ZONE_PRIORITY })}
              min={1}
              max={999}
              disabled={disabled}
              aria-invalid={Boolean(errors.priority)}
            />
          </Field>
          <Field label="설명" span={12} error={errors.description} htmlFor="zone-description">
            <Textarea
              id="zone-description"
              value={value.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              disabled={disabled}
              rows={2}
              maxLength={200}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'regions',
      title: `담당 지역 (${value.regionCodes.length}곳)`,
      description:
        '시·도 전체 또는 시·군·구를 고릅니다. 같은 센터의 다른 권역이 담당하는 지역은 고를 수 없습니다.',
      content: (
        <>
          {value.centerId ? (
            <RegionPicker
              id="zone-regions"
              value={value.regionCodes}
              onChange={(regionCodes) => set({ regionCodes })}
              taken={taken[value.centerId] ?? {}}
              disabled={disabled}
              invalid={Boolean(errors.regionCodes)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">먼저 센터를 고르세요.</p>
          )}
          {errors.regionCodes && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {errors.regionCodes}
            </p>
          )}
          {/* 다른 센터와 겹침 안내 (0072): 출고 때 배송 센터를 자동으로 고르는 규칙 */}
          {overlaps.length > 0 && (
            <div className="mt-4 space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                다른 센터와 겹치는 지역 {overlaps.length}곳
                <span className="ml-2 font-normal text-muted-foreground">
                  거래처에 배송 센터가 없으면 더 구체적인 지역 → 우선순위 번호 순서로 배송 센터를
                  고릅니다
                </span>
              </p>
              <ul className="space-y-1">
                {overlaps.map((o) => (
                  <li
                    key={`${o.region}-${o.other.centerName}-${o.other.zoneName}`}
                    className="flex gap-2"
                  >
                    <span
                      className={cn(
                        'shrink-0 font-medium',
                        o.winner === 'THIS' && 'text-primary',
                        o.winner === 'TIE' && 'text-destructive',
                      )}
                    >
                      {o.label}
                    </span>
                    <span
                      className={cn(
                        'text-muted-foreground',
                        o.winner === 'TIE' && 'text-destructive',
                      )}
                    >
                      {o.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
    },
  ]

  if (zone) {
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description:
        '사용 중지한 권역도 담당 지역은 그대로 잡고 있습니다 (다시 사용할 때 겹치지 않게).',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          {zone.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant={zone.isActive ? 'destructive' : 'outline'}>
                  <PowerIcon />
                  {zone.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={zone.isActive ? '이 권역을 사용 중지할까요?' : '이 권역을 다시 사용할까요?'}
              confirmLabel={zone.isActive ? '사용 중지' : '다시 사용'}
              destructive={zone.isActive}
              onConfirm={async () => {
                unwrap(
                  await setDeliveryZonesActiveAction({ ids: [zone.id], isActive: !zone.isActive }),
                )
                router.refresh()
              }}
            />
          )}
        </div>
      ),
    })
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
