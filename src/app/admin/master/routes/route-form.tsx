'use client'

import {
  CenterSelect,
  CodeSelect,
  NumberInput,
  SearchSelect,
  TimeInput,
  WeekdaySelect,
} from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CARRIER_STATUS } from '@/lib/carriers/carrier-codes'
import { routeCreateSchema, type RouteCreateInput } from '@/lib/routes/route-schema'
import { createRouteAction, updateRouteAction } from './actions'
import type { RouteForEdit, RouteOptions } from './queries'

export const ROUTE_LIST_HREF = '/admin/master/routes'

const EMPTY: RouteCreateInput = {
  centerId: '',
  code: '',
  custCode: '',
  name: '',
  carrierId: '',
  runDays: 'YYYYYNN',
  cutoffTime: '',
  vehicleTon: '',
  destHub: '',
  status: 'ACTIVE',
  sortOrder: 100,
  remark: '',
}

// 배송 코스 등록·수정 (0095): 센터·코드는 등록할 때만, 우편번호 배정은 수정 화면 아래 섹션(extraSections)
export function RouteForm({
  header,
  route,
  options,
  readOnly,
  extraSections = [],
}: {
  header: MasterFormHeader
  route?: Omit<RouteForEdit, 'carrierId' | 'zips'>
  options: RouteOptions
  readOnly: boolean
  extraSections?: MasterFormSection[]
}) {
  const form = useMasterForm({
    initial: route?.input ?? EMPTY,
    version: route?.rowVersion,
    schema: routeCreateSchema,
    save: (value: RouteCreateInput, version) => {
      if (!route) return createRouteAction(value)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { centerId, code, ...rest } = value
      return updateRouteAction({ ...rest, id: route.id, rowVersion: version ?? route.rowVersion })
    },
    createdHref: route
      ? undefined
      : (created) => `${ROUTE_LIST_HREF}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `route-${key}`

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="센터"
            span={4}
            required
            error={errors.centerId}
            htmlFor={id('centerId')}
            hint={route ? '바꿀 수 없습니다' : undefined}
          >
            <CenterSelect
              id={id('centerId')}
              options={options.centers}
              value={value.centerId}
              onChange={(centerId) => set({ centerId })}
              disabled={disabled || Boolean(route)}
              invalid={Boolean(errors.centerId)}
            />
          </Field>
          <Field
            label="코스 코드"
            span={4}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint={route ? '바꿀 수 없습니다' : '센터 안에서 고유, 예: R01'}
          >
            <Input
              id={id('code')}
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={disabled || Boolean(route)}
              readOnly={Boolean(route)}
              maxLength={20}
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          <Field label="상태" span={4} htmlFor={id('status')}>
            <Select
              value={value.status}
              onValueChange={(status) => set({ status: status as RouteCreateInput['status'] })}
              disabled={disabled}
            >
              <SelectTrigger id={id('status')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARRIER_STATUS.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="코스명" span={8} required error={errors.name} htmlFor={id('name')}>
            <Input
              id={id('name')}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              maxLength={100}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field
            label="사용자 정의 코드"
            span={4}
            error={errors.custCode}
            htmlFor={id('custCode')}
            hint="화주·TMS 시스템의 코스 코드"
          >
            <Input
              id={id('custCode')}
              value={value.custCode}
              onChange={(e) => set({ custCode: e.target.value })}
              disabled={disabled}
              maxLength={50}
              aria-invalid={Boolean(errors.custCode)}
            />
          </Field>
          <Field label="정렬순서" span={4} error={errors.sortOrder} htmlFor={id('sortOrder')}>
            <NumberInput
              id={id('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              max={9999}
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
      id: 'operation',
      title: '운행',
      description: '어떤 수단으로, 무슨 요일에, 몇 시까지 출발하는 코스인지입니다.',
      content: (
        <FormGrid>
          <Field label="운송사" span={4} error={errors.carrierId} htmlFor={id('carrierId')}>
            <SearchSelect
              id={id('carrierId')}
              options={[
                { value: '', label: '정하지 않음' },
                ...options.carriers.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.code})${c.status === 'ACTIVE' ? '' : ' · 사용 중지'}`,
                })),
              ]}
              value={value.carrierId ?? ''}
              onChange={(carrierId) => set({ carrierId })}
              disabled={disabled}
            />
          </Field>
          <Field
            label="기본 차량 톤수"
            span={4}
            error={errors.vehicleTon}
            htmlFor={id('vehicleTon')}
          >
            <CodeSelect
              group="VEHICLE_TON"
              id={id('vehicleTon')}
              value={value.vehicleTon}
              onChange={(vehicleTon) => set({ vehicleTon })}
              disabled={disabled}
              allowEmpty
            />
          </Field>
          <Field
            label="출발 마감 시각"
            span={4}
            error={errors.cutoffTime}
            htmlFor={id('cutoffTime')}
            hint="이후 출고는 다음 운행"
          >
            <TimeInput
              id={id('cutoffTime')}
              value={value.cutoffTime}
              onChange={(cutoffTime) => set({ cutoffTime })}
              disabled={disabled}
            />
          </Field>
          <Field label="운행 요일" span={6} required error={errors.runDays} htmlFor={id('runDays')}>
            <WeekdaySelect
              id={id('runDays')}
              value={value.runDays}
              onChange={(runDays) => set({ runDays })}
              disabled={disabled}
            />
          </Field>
          <Field label="도착 거점" span={6} error={errors.destHub} htmlFor={id('destHub')}>
            <Input
              id={id('destHub')}
              value={value.destHub}
              onChange={(e) => set({ destHub: e.target.value })}
              disabled={disabled}
              maxLength={100}
              placeholder="예: 수원 허브"
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  return (
    <MasterFormPage
      header={header}
      form={form}
      readOnly={readOnly}
      sections={[...sections, ...extraSections]}
    />
  )
}
