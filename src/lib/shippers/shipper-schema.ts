import { z } from 'zod'
import { ALLOC_RULE, BIZ_ENTITY, TAX_TYPE } from '@/config/operator-codes'
import { contactSchema } from '@/lib/contacts/contact-schema'
import { digitsOnly, isValidBusinessNumber, isValidCorpRegNumber } from '@/lib/format'
import { idSchema } from '@/lib/id'
import {
  addressShape,
  oneOf,
  optionalCount,
  optionalDateText,
  optionalEmail,
  optionalPhone,
  optionalText,
  optionalTime,
  requiredText,
  userCodeField,
} from '@/lib/validation/common-fields'
import {
  IF_METHOD,
  ORDER_NO_SCOPE,
  SHIP_TO_CENTER_POLICY,
  SHIPPER_CENTER_STATUS,
  SHIPPER_STATUS,
  SHIPPER_STATUSES_NEEDING_REASON,
  SHORTAGE_POLICY,
} from './shipper-codes'

// 화주사 입력 규칙 — 화면·서버 공용 (docs/decisions/0035, 0080, docs/specs/shipper.md PART 1)

export const LABEL_UNITS = ['PLT', 'BOX'] as const
export type LabelUnitValue = (typeof LABEL_UNITS)[number]

// 공통코드 그룹 (운영사가 고치는 분류·표시 값, 0030)
export const SHIPPER_TYPE_GROUP = 'SHIPPER_TYPE'
export const SHIPPER_INDUSTRY_GROUP = 'SHIPPER_INDUSTRY'
export const SETTLE_CYCLE_GROUP = 'SETTLE_CYCLE'

// ── 담당자: 공용 담당자 규칙 + 화주사만 최대 10명 + 연동 담당 (0080)
export const MAX_SHIPPER_CONTACTS = 10
export const shipperContactSchema = contactSchema.and(
  // 연동 담당: API 키 발급·만료 알림을 받는 사람 (화주당 최대 1명, 이메일 필수)
  z.object({ isIfContact: z.boolean() }),
)
export const shipperContactsSchema = z
  .array(shipperContactSchema)
  .max(MAX_SHIPPER_CONTACTS, `담당자는 ${MAX_SHIPPER_CONTACTS}명까지 등록할 수 있습니다.`)
  .superRefine((rows, ctx) => {
    if (rows.length > 0 && rows.filter((row) => row.isPrimary).length !== 1) {
      ctx.addIssue({ code: 'custom', message: '대표 담당자를 1명 정해 주세요.' })
    }
    if (rows.filter((row) => row.isIfContact).length > 1) {
      ctx.addIssue({ code: 'custom', message: '연동 담당자는 1명만 정할 수 있습니다.' })
    }
    rows.forEach((row, index) => {
      if (row.isIfContact && !row.email) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'email'],
          message: '연동 담당자는 이메일이 필요합니다. (키 발급·만료 알림)',
        })
      }
    })
  })

// ── 이용 센터: 1곳 이상, 기본 센터 1곳 (하나뿐이면 자동으로 기본)
export const shipperCenterSchema = z
  .object({
    centerId: idSchema,
    isDefault: z.boolean(),
    startOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '이용 시작일을 입력해 주세요.'),
    endOn: optionalDateText,
    status: oneOf(SHIPPER_CENTER_STATUS.values, '상태를 골라 주세요.'),
  })
  .superRefine((row, ctx) => {
    if (row.endOn && row.endOn < row.startOn) {
      ctx.addIssue({ code: 'custom', path: ['endOn'], message: '종료일이 시작일보다 빠릅니다.' })
    }
  })

export const shipperCentersSchema = z
  .array(shipperCenterSchema)
  .min(1, '이용 센터를 1곳 이상 넣어 주세요.')
  .max(50)
  .superRefine((rows, ctx) => {
    const ids = rows.map((row) => row.centerId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: '같은 센터가 두 번 들어 있습니다.' })
    }
    if (rows.length > 1 && rows.filter((row) => row.isDefault).length !== 1) {
      ctx.addIssue({ code: 'custom', message: '기본 센터를 1곳 정해 주세요.' })
    }
  })
  // 하나뿐이면 자동으로 기본
  .transform((rows) => (rows.length === 1 ? [{ ...rows[0], isDefault: true }] : rows))

// 사업자등록번호: 화면에서는 필수 (기존 화주는 DB에 비어 있을 수 있다 — 고칠 때 채운다, 0080)
const businessNumberField = z
  .string()
  .trim()
  .min(1, '사업자등록번호를 입력해 주세요.')
  .refine(
    (value) => value === '' || isValidBusinessNumber(value),
    '사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)',
  )
  .transform(digitsOnly)

const corpRegNoField = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || isValidCorpRegNumber(value),
    '법인등록번호를 확인해 주세요. (13자리, 검증번호 불일치)',
  )
  .transform((value) => digitsOnly(value) || null)

const subBizNoField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}$/.test(value), '종사업장번호는 숫자 4자리입니다.')
  .transform((value) => value || null)

// 홈페이지 (선택): http(s) 주소
const homepageField = z
  .string()
  .trim()
  .max(200, '200자 이하로 입력해 주세요.')
  .refine(
    (value) => value === '' || /^https?:\/\/\S+$/.test(value),
    'http:// 또는 https://로 시작해야 합니다.',
  )
  .transform((value) => value || null)

// 정산 마감일 (선택): 1~31일, 99 = 말일. 비우면 운영사 값
const closingDayField = z
  .number()
  .int()
  .refine(
    (value) => (value >= 1 && value <= 31) || value === 99,
    '마감일은 1~31일 또는 말일입니다.',
  )
  .nullable()

// 일수 (선택, 0~최대)
const optionalDays = (max: number) =>
  optionalCount.refine((v) => v === null || v <= max, `${max}일 이하입니다.`)

// 상속 칸: null = 위 단계 값을 따른다
const inheritableYn = z.boolean().nullable()

export const shipperShape = {
  // 사용자 코드: 비우면 시스템 코드 (0025)
  code: userCodeField('화주사 코드'),
  // ① 기본 정보
  name: requiredText('화주사명을 입력해 주세요.', 100),
  nameEn: optionalText(100),
  shortName: optionalText(30),
  shipperType: optionalText(20),
  industry: optionalText(20),
  businessNumber: businessNumberField,
  bizEntity: oneOf(BIZ_ENTITY.values, '사업자 구분을 골라 주세요.'),
  corpRegNo: corpRegNoField,
  subBizNo: subBizNoField,
  taxType: oneOf(TAX_TYPE.values, '과세유형을 골라 주세요.'),
  ceoName: optionalText(50),
  businessType: optionalText(100),
  businessItem: optionalText(100),
  sortOrder: z.number().int('정수로 입력해 주세요.').min(0).max(9999),
  remark: optionalText(1000),
  // ② 연락처·주소
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  homepageUrl: homepageField,
  ...addressShape,
  // 주소 검색 결과의 지번주소 (화면에 보이지 않고 자동으로 채운다)
  addressJibun: optionalText(200),
  // ③ 계약·정산
  contractStartOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '계약시작일을 입력해 주세요.'),
  contractEndOn: optionalDateText,
  autoRenew: z.boolean(),
  settleCycle: requiredText('정산 주기를 골라 주세요.', 10),
  closingDay: closingDayField,
  paymentTermsDays: optionalDays(365),
  taxInvoiceEmail: optionalEmail,
  // ④ 운영 설정 (상속: null = 위 단계 값)
  useLot: inheritableYn,
  useExpiry: inheritableYn,
  useSerial: inheritableYn,
  allocRule: oneOf(ALLOC_RULE.values, '재고할당 규칙을 골라 주세요.').nullable(),
  shipCutoffTime: optionalTime,
  minInboundShelfDays: optionalDays(9999),
  minOutboundShelfDays: optionalDays(9999),
  partialShip: z.boolean(),
  shortagePolicy: oneOf(SHORTAGE_POLICY.values, '재고 부족 시 처리를 골라 주세요.'),
  labelUnit: z.enum(LABEL_UNITS, '라벨 단위를 골라 주세요.'),
  // ⑤ 거래처·주문 정책
  shipToCenterPolicy: oneOf(SHIP_TO_CENTER_POLICY.values, '배송센터 미지정 처리를 골라 주세요.'),
  autoCreateShipTo: z.boolean(),
  autoCreateItem: z.boolean(),
  orderNoScope: oneOf(ORDER_NO_SCOPE.values, '주문번호 중복 기준을 골라 주세요.'),
  // ⑥ 연동
  ifMethod: oneOf(IF_METHOD.values, '연동 방식을 골라 주세요.'),
  apiEnabled: z.boolean(),
  centers: shipperCentersSchema,
  contacts: shipperContactsSchema,
}

// 여러 칸을 함께 보는 규칙 + 개인 사업자면 법인등록번호 비움
export const shipperSchema = z
  .object(shipperShape)
  .superRefine((value, ctx) => {
    if (value.contractEndOn && value.contractEndOn < value.contractStartOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['contractEndOn'],
        message: '계약종료일이 계약시작일보다 빠릅니다.',
      })
    }
  })
  .transform((value) => (value.bizEntity === 'CORP' ? value : { ...value, corpRegNo: null }))

export type ShipperInput = z.input<typeof shipperSchema>
export type ShipperData = z.output<typeof shipperSchema>
export type ShipperCenterInput = z.input<typeof shipperCenterSchema>
export type ShipperContactInput = z.input<typeof shipperContactSchema>

// 상태 변경 (헤더 [상태 변경] 팝업): 일시정지·해지는 사유 필수
export const shipperStatusSchema = z
  .object({
    status: oneOf(SHIPPER_STATUS.values, '상태를 골라 주세요.'),
    reason: optionalText(200),
  })
  .superRefine((value, ctx) => {
    if (SHIPPER_STATUSES_NEEDING_REASON.includes(value.status) && !value.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: '사유를 입력해 주세요.' })
    }
  })

export type ShipperStatusInput = z.input<typeof shipperStatusSchema>
