'use client'

import { Suspense, useState } from 'react'
import { z } from 'zod'
import { CommonCodeProvider } from '@/components/common-code'
import {
  AddressInput,
  BizNoInput,
  CodeSelect,
  CorpRegNoInput,
  DateInput,
  DateRangeInput,
  EmailInput,
  NumberInput,
  QtyInput,
  SearchSelect,
  PhoneInput,
  YnToggle,
  InheritableField,
  CenterSelect,
  CodeRangeInput,
  LocationSelect,
  WarehouseSelect,
  ZoneSelect,
  TimeInput,
  WeekdaySelect,
} from '@/components/inputs'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import { ExcelUploadShowcase } from './excel-upload-showcase'
import { ListShowcase } from './list-showcase'
import type { CodeOptions } from '@/lib/common-code'
import { isValidBusinessNumber } from '@/lib/format'
import {
  exactlyOne,
  optionalEmail,
  optionalPhone,
  requireOneOf,
} from '@/lib/validation/common-fields'

// 견본용 공통코드 (실제 화면은 AppShell이 DB에서 읽어 넣는다)
const SAMPLE_CODES: CodeOptions = {
  CONTACT_ROLE: [
    { code: 'INBOUND', name: '입고', isActive: true },
    { code: 'OUTBOUND', name: '출고', isActive: true },
    { code: 'SETTLEMENT', name: '정산', isActive: true },
    { code: 'OLD', name: '옛 업무', isActive: false },
  ],
}

// 견본 한 칸: 제목 + 부품 + 바깥으로 나가는 값
function Sample({
  title,
  note,
  value,
  children,
}: {
  title: string
  note: string
  value: unknown
  children: React.ReactNode
}) {
  return (
    <div className="grid content-start gap-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
      <code className="block truncate rounded bg-muted px-2 py-1 text-xs">
        값: {JSON.stringify(value)}
      </code>
    </div>
  )
}

function InputSamples() {
  const [center, setCenter] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [zone, setZone] = useState('')
  const [codeRange, setCodeRange] = useState('A-01~A-03')
  const [bizNo, setBizNo] = useState('1234567891')
  const [corpNo, setCorpNo] = useState('')
  const [phone, setPhone] = useState('021234567')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState({ zipCode: '', address: '', addressDetail: '' })
  const [duty, setDuty] = useState('OLD')
  const [weight, setWeight] = useState<number | null>(1234.5)
  const [qty, setQty] = useState('1440')
  const [picked, setPicked] = useState('')
  const [date, setDate] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [yn, setYn] = useState(true)
  const [time, setTime] = useState('09:00')
  const [days, setDays] = useState('YYYYYNN')
  const [cutoff, setCutoff] = useState('')
  const [location, setLocation] = useState('')

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Sample title="BizNoInput" note="span 4 · 자동 하이픈, 값은 숫자만" value={bizNo}>
        <BizNoInput
          aria-label="사업자등록번호"
          value={bizNo}
          onChange={setBizNo}
          aria-invalid={bizNo.length === 10 && !isValidBusinessNumber(bizNo)}
        />
      </Sample>
      <Sample title="CorpRegNoInput" note="span 4 · 000000-0000000" value={corpNo}>
        <CorpRegNoInput aria-label="법인등록번호" value={corpNo} onChange={setCorpNo} />
      </Sample>
      <Sample title="PhoneInput" note="span 4 · 02 / 010 / 1588 / 0505 자동" value={phone}>
        <PhoneInput aria-label="전화" value={phone} onChange={setPhone} />
      </Sample>
      <Sample title="EmailInput" note="span 6~8 · 형식 검사는 입력 규칙에서" value={email}>
        <EmailInput aria-label="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Sample>
      <Sample
        title="CodeSelect"
        note="group만 넘기면 공통코드 목록 (사용 중지 코드는 현재 값일 때만)"
        value={duty}
      >
        <CodeSelect group="CONTACT_ROLE" value={duty} onChange={setDuty} />
      </Sample>
      <Sample title="NumberInput" note="쉼표, 소수 2자리, 0~10,000, 단위 kg" value={weight}>
        <NumberInput
          aria-label="무게"
          value={weight}
          onChange={setWeight}
          decimals={2}
          min={0}
          max={10000}
          unit="kg"
        />
      </Sample>
      <Sample
        title="QtyInput"
        note="수량은 글자 그대로 (Number 금지), 소수 3자리, 단위 KG"
        value={qty}
      >
        <QtyInput aria-label="수량" value={qty} onChange={setQty} decimals={3} unit="KG" />
      </Sample>
      <Sample title="SearchSelect" note="선택지가 많을 때 검색해서 하나 (품목 등)" value={picked}>
        <SearchSelect
          options={[
            {
              value: '1',
              label: 'WATER · 생수 500ml',
              description: 'EA · BOX 24',
              keywords: '8801',
            },
            { value: '2', label: 'MILK · 우유 1L', description: 'EA · 로트·유통기한' },
            { value: '3', label: 'RICE · 쌀 10kg', description: 'KG' },
          ]}
          value={picked}
          onChange={setPicked}
          placeholder="품목 선택"
          searchPlaceholder="품목코드·이름·바코드"
        />
      </Sample>
      <Sample title="DateInput" note="span 3~4 · 'YYYY-MM-DD'" value={date}>
        <DateInput aria-label="날짜" value={date} onChange={setDate} />
      </Sample>
      <Sample title="DateRangeInput" note="span 6~8 · 종료일은 시작일 이후만" value={range}>
        <DateRangeInput value={range} onChange={setRange} />
      </Sample>
      <Sample
        title="TimeInput"
        note="span 2~3 · 24시간 'HH:MM', 숫자만 치면 콜론 자동"
        value={time}
      >
        <TimeInput value={time} onChange={setTime} />
      </Sample>
      <Sample title="WeekdaySelect" note="span 6 · 월~일 Y/N 7글자, [평일]·[매일]" value={days}>
        <WeekdaySelect value={days} onChange={setDays} />
      </Sample>
      <Sample
        title="InheritableField"
        note="상속 칸 (0073) · 비우면 위 단계 값, 체크를 풀면 직접 입력"
        value={cutoff}
      >
        <InheritableField
          id="sample-cutoff"
          parentLabel="운영사"
          parentValue="17:00"
          inherited={cutoff === ''}
          onInheritedChange={(inherited) => setCutoff(inherited ? '' : '17:00')}
        >
          <TimeInput value={cutoff} onChange={setCutoff} />
        </InheritableField>
      </Sample>
      <Sample
        title="LocationSelect"
        note="span 4 · 서버가 범위를 좁힌 선택지를 검색"
        value={location}
      >
        <LocationSelect
          value={location}
          onChange={setLocation}
          options={[
            { value: '1', label: 'DEFAULT', description: '입고대기 · 입고대기 창고' },
            { value: '2', label: 'A-01-01', description: '일반 · 상온 1창고', keywords: 'A01' },
            { value: '3', label: 'A-01-02', description: '일반 · 상온 1창고', keywords: 'A01' },
          ]}
        />
      </Sample>
      <Sample title="CenterSelect" note="span 4 · 하나뿐이면 저절로 고름" value={center}>
        <CenterSelect
          value={center}
          onChange={(next) => {
            setCenter(next)
            setWarehouse('')
          }}
          options={[
            { id: 'c1', code: 'ICN', name: '이천센터' },
            { id: 'c2', code: 'GMH', name: '김해센터' },
          ]}
        />
      </Sample>
      <Sample title="WarehouseSelect" note="span 4 · 위에서 고른 센터의 창고만" value={warehouse}>
        <WarehouseSelect
          centerId={center}
          value={warehouse}
          onChange={setWarehouse}
          options={[
            { id: 'w1', centerId: 'c1', code: 'INBOUND', name: '입고대기', description: '기본' },
            { id: 'w2', centerId: 'c1', code: 'A', name: 'A동 상온' },
            { id: 'w3', centerId: 'c2', code: 'B', name: 'B동 냉장' },
          ]}
        />
      </Sample>
      <Sample title="ZoneSelect" note="span 4 · 위에서 고른 창고의 구역만" value={zone}>
        <ZoneSelect
          warehouseId={warehouse}
          value={zone}
          onChange={setZone}
          allowNone
          options={[
            { id: 'z1', warehouseId: 'w2', code: 'A', name: 'A구역 랙 보관' },
            { id: 'z2', warehouseId: 'w2', code: 'P1', name: '피킹' },
          ]}
        />
      </Sample>
      <Sample title="CodeRangeInput" note="span 4 · 코드 범위 검색 (시작~끝)" value={codeRange}>
        <CodeRangeInput value={codeRange} onChange={setCodeRange} />
      </Sample>
      <Sample title="YnToggle" note="span 2~3 · 값은 boolean" value={yn}>
        <YnToggle value={yn} onChange={setYn} />
      </Sample>
      <div className="md:col-span-2 xl:col-span-3">
        <Sample
          title="AddressInput"
          note="span 12 · [우편번호][주소 검색] → 기본주소 → 상세주소"
          value={address}
        >
          <div className="max-w-xl">
            <AddressInput idPrefix="demo-address" value={address} onChange={setAddress} />
          </div>
        </Sample>
      </div>
    </div>
  )
}

// 전체 틀 견본: MasterFormPage + FormGrid/Field + EditableSubTable + useMasterForm
const demoSchema = z.object({
  name: z.string().trim().min(1, '이름을 입력해 주세요.'),
  bizNo: z.string().refine(isValidBusinessNumber, '사업자등록번호를 확인해 주세요.'),
  phone: optionalPhone,
  contacts: z
    .array(
      z
        .object({
          duty: z.string().min(1, '담당 업무를 골라 주세요.'),
          name: z.string().trim().min(1, '담당자명을 입력해 주세요.'),
          phone: optionalPhone,
          email: optionalEmail,
          isPrimary: z.boolean(),
        })
        .superRefine(requireOneOf(['phone', 'email'], '연락처와 이메일 중 하나는 입력해 주세요.')),
    )
    .max(5)
    .superRefine(exactlyOne('isPrimary', '대표 담당자를 1명 정해 주세요.')),
})

function FormSample() {
  const form = useMasterForm({
    initial: {
      name: '',
      bizNo: '',
      phone: '',
      contacts: [] as z.input<typeof demoSchema>['contacts'],
    },
    schema: demoSchema,
    // 견본: 서버 대신 0.5초 뒤 성공
    save: () =>
      new Promise<{ ok: true; data: null }>((resolve) =>
        setTimeout(() => resolve({ ok: true, data: null }), 500),
      ),
  })
  const { value, set, errors, pending } = form
  return (
    <MasterFormPage
      header={{
        title: '견본 입력 화면',
        description: '헤더의 [취소]·[저장]은 스크롤해도 보입니다.',
      }}
      form={form}
      sections={[
        {
          id: 'basic',
          title: '기본 정보',
          content: (
            <FormGrid>
              <Field label="이름" span={8} required error={errors.name} htmlFor="demo-name">
                <Input
                  id="demo-name"
                  value={value.name}
                  aria-invalid={Boolean(errors.name)}
                  disabled={pending}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              <Field
                label="사업자등록번호"
                span={4}
                required
                error={errors.bizNo}
                htmlFor="demo-bizno"
              >
                <BizNoInput
                  id="demo-bizno"
                  value={value.bizNo}
                  aria-invalid={Boolean(errors.bizNo)}
                  onChange={(bizNo) => set({ bizNo })}
                />
              </Field>
              <Field label="대표 전화" error={errors.phone} htmlFor="demo-phone">
                <PhoneInput
                  id="demo-phone"
                  value={value.phone}
                  aria-invalid={Boolean(errors.phone)}
                  onChange={(phone) => set({ phone })}
                />
              </Field>
            </FormGrid>
          ),
        },
        {
          id: 'contacts',
          title: `담당자 (${value.contacts.length}/5)`,
          description: '연락처·이메일 중 하나는 필수, 대표 1명 필수',
          content: (
            <EditableSubTable
              name="contacts"
              rows={value.contacts}
              onChange={(contacts) => set({ contacts })}
              columns={[
                {
                  key: 'duty',
                  label: '담당 업무',
                  required: true,
                  width: '8rem',
                  input: { codeGroup: 'CONTACT_ROLE' },
                },
                { key: 'name', label: '담당자명', required: true, width: '8rem' },
                { key: 'phone', label: '연락처', width: '10rem', input: 'phone' },
                { key: 'email', label: '이메일', input: 'email' },
              ]}
              createRow={() => ({ duty: '', name: '', phone: '', email: '', isPrimary: false })}
              maxRows={5}
              primary={{ key: 'isPrimary', label: '대표' }}
              errors={errors}
              addLabel="담당자 추가"
              countUnit="명"
              disabled={pending}
            />
          ),
        },
      ]}
    />
  )
}

export function ComponentsShowcase() {
  return (
    <CommonCodeProvider options={SAMPLE_CODES}>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">입력 부품</h2>
        <InputSamples />
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold">입력 화면 틀 (MasterFormPage)</h2>
        <p className="text-sm text-muted-foreground">
          값을 바꾸면 아래 저장 막대에 &quot;변경사항 있음&quot;이 뜨고, 비운 채 저장하면 첫 오류
          칸으로 이동합니다. 바꾼 채 위쪽 링크로 나가려 하면 확인 창이 뜹니다.
        </p>
        <a href="/dev/theme" className="text-sm text-primary underline">
          디자인 견본으로 가기 (이탈 확인 시험용)
        </a>
        <div className="rounded-lg border p-6">
          <FormSample />
        </div>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold">엑셀 업로드 (ExcelUploadDialog)</h2>
        <p className="text-sm text-muted-foreground">
          양식 내려받기 → 파일 고르기 → 검사 결과 미리보기(오류 행·사유) → 오류가 없을 때만 등록.
        </p>
        <ExcelUploadShowcase />
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold">목록·검색 화면 틀 (MasterListPage)</h2>
        <div className="rounded-lg border p-6">
          {/* 주소창(useSearchParams)을 읽는 부품은 Suspense로 감싼다 (정적 페이지 빌드 규칙) */}
          <Suspense>
            <ListShowcase />
          </Suspense>
        </div>
      </section>
    </CommonCodeProvider>
  )
}
