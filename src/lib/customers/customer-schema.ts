import { z } from 'zod'
import { contactsSchema } from '@/lib/contacts/contact-schema'
import { idField, optionalIdSchema } from '@/lib/id'
import {
  addressShape,
  oneOf,
  optionalBusinessNumber,
  optionalCount,
  optionalDecimal,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
} from '@/lib/validation/common-fields'
import { ORDER_ADDR_MODE, SHIP_TO_STATUS } from './customer-codes'

// 거래처·납품처 입력 규칙 — 화면·서버 공용 (docs/decisions/0043, 0082)

// 담당자 규칙은 운영사·화주사와 같다
export {
  CONTACT_ROLE_GROUP,
  EMPTY_CONTACT,
  MAX_CONTACTS as MAX_CUSTOMER_CONTACTS,
} from '@/lib/contacts/contact-schema'

// 거래처코드·납품처코드: 영문·숫자·하이픈·밑줄 30자 이하 (소문자는 대문자로), 등록 후 변경 불가
// 비우면 자동 체번 — 거래처 {화주 접두어}C000001, 납품처 {거래처코드}-01 (0084)
const codeField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .max(max, `${max}자 이하로 입력해 주세요.`)
    .regex(/^[A-Z0-9_-]*$/, `${label}는 영문·숫자·하이픈·밑줄만 씁니다.`)

export const customerCodeField = codeField('거래처코드', 30)
export const shipToCodeField = codeField('납품처코드', 40)

// 법정동코드 10자리 (주소 검색 결과를 자동으로 채운다, 화면 미노출)
const regionCodeField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{10}$/.test(value), '법정동코드는 숫자 10자리입니다.')
  .transform((value) => value || null)

// ── 납품처 한 곳
// centerMode: AUTO = 권역 자동 (배송센터를 비우면 주소로 정한다) / MANUAL = 화면에서 고른 센터
// 저장할 때 주소·센터를 바꾸지 않은 납품처는 기존 지정(연동 IF 포함)을 그대로 둔다
export const shipToSchema = z
  .object({
    // 있으면 고치고, 없으면 새로
    id: optionalIdSchema.default(null),
    code: shipToCodeField,
    // 사용자 정의 코드 (화주 시스템의 납품처코드, 0084)
    custCode: optionalText(50),
    name: requiredText('납품처명을 입력해 주세요.', 200),
    isDefault: z.boolean(),
    // 기본 납품처: 거래처 주소와 함께 바뀜 (켜져 있으면 주소 칸은 거래처 주소를 쓴다)
    addrSync: z.boolean(),
    status: oneOf(SHIP_TO_STATUS.values, '상태를 골라 주세요.'),
    zipCode: z.string().trim().max(10),
    address: z.string().trim().max(200),
    addressDetail: optionalText(200),
    regionCode: regionCodeField,
    receiverName: optionalText(50),
    receiverPhone: optionalPhone,
    receiverPhone2: optionalPhone,
    deliveryMemo: optionalText(200),
    // IF = 연동(API·엑셀)이 보낸 센터코드 (centerCode). 화면은 AUTO·MANUAL만 쓴다
    centerMode: z.enum(['AUTO', 'MANUAL', 'IF']),
    deliveryCenterId: optionalIdSchema.default(null),
    centerCode: z.string().trim().max(20).optional(),
    remark: optionalText(1000),
  })
  .superRefine((row, ctx) => {
    if (!row.addrSync && !row.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: '납품처 주소를 입력해 주세요.' })
    }
    if (row.centerMode === 'IF' && !row.centerCode) {
      ctx.addIssue({ code: 'custom', path: ['centerCode'], message: '센터코드를 넣어 주세요.' })
    }
    if (row.centerMode === 'MANUAL' && !row.deliveryCenterId) {
      ctx.addIssue({
        code: 'custom',
        path: ['deliveryCenterId'],
        message: '배송센터를 고르거나 "권역 자동"으로 두세요.',
      })
    }
  })

// 기본 납품처 정확히 1곳(사용 중), 사용 중 1곳 이상, 코드 겹침 없음
const shipTosSchema = z
  .array(shipToSchema)
  .max(200, '납품처는 한 번에 200곳까지입니다.')
  .superRefine((rows, ctx) => {
    if (rows.length === 0) return
    // 비운 코드는 저장할 때 자동 체번 — 넣은 코드끼리만 비교
    const codes = rows.map((r) => r.code).filter(Boolean)
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({ code: 'custom', message: '같은 납품처코드가 두 번 있습니다.' })
    }
    const defaults = rows.filter((r) => r.isDefault)
    // params.apiCode: 연동 API의 건별 오류코드 (0082 ③)
    if (defaults.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: '기본 납품처를 1곳 정해 주세요.',
        params: { apiCode: 'DEFAULT_SHIP_TO_REQUIRED' },
      })
    } else if (defaults[0].status !== 'ACTIVE') {
      ctx.addIssue({
        code: 'custom',
        message: '기본 납품처는 사용 중이어야 합니다.',
        params: { apiCode: 'LAST_SHIP_TO_INACTIVE' },
      })
    }
    if (!rows.some((r) => r.status === 'ACTIVE')) {
      ctx.addIssue({
        code: 'custom',
        message: '사용 중인 납품처가 1곳 이상 있어야 합니다.',
        params: { apiCode: 'LAST_SHIP_TO_INACTIVE' },
      })
    }
  })

const customerShape = {
  // 사용자 정의 코드 (화주 시스템의 거래처코드, 0084) — 수정할 수 있다
  custCode: optionalText(50),
  name: requiredText('거래처명을 입력해 주세요.', 200),
  shortName: optionalText(30),
  customerType: optionalText(20),
  customerGroup: optionalText(30),
  businessNumber: optionalBusinessNumber,
  ceoName: optionalText(50),
  orderAddrMode: oneOf(ORDER_ADDR_MODE.values, '주문 주소 사용 방식을 골라 주세요.'),
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  // 주소 (납품처가 하나도 없으면 필수 — 기본 납품처를 이 주소로 만든다)
  ...addressShape,
  addressJibun: optionalText(200),
  regionCode: regionCodeField,
  // 출고 조건
  minShelfDays: optionalCount.refine((v) => v === null || v <= 9999, '9999일 이하입니다.'),
  minShelfRatio: optionalDecimal(5, 2).refine(
    (v) => v === null || Number(v) <= 100,
    '100% 이하입니다.',
  ),
  remark: optionalText(1000),
  contacts: contactsSchema,
  shipTos: shipTosSchema,
}

// 납품처가 없으면 거래처 주소 필수 (PARTNER_ADDRESS_REQUIRED)
const requireAddressWithoutShipTo = (
  value: { shipTos: unknown[]; address: string | null; zipCode: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.shipTos.length === 0 && !value.address) {
    ctx.addIssue({
      code: 'custom',
      path: ['address'],
      message: '납품처가 없으면 거래처 주소가 필요합니다. (이 주소로 기본 납품처를 만듭니다)',
      params: { apiCode: 'PARTNER_ADDRESS_REQUIRED' },
    })
  }
}

// 수정: 화주사·거래처코드는 바꿀 수 없다 (받지 않는다)
export const customerSchema = z.object(customerShape).superRefine(requireAddressWithoutShipTo)

// 등록: 화주사를 고르고 거래처코드를 넣는다
export const customerCreateSchema = z
  .object({
    shipperId: idField('화주사를 골라 주세요.'),
    code: customerCodeField,
    ...customerShape,
  })
  .superRefine(requireAddressWithoutShipTo)

export type CustomerInput = z.input<typeof customerSchema>
export type CustomerData = z.output<typeof customerSchema>
export type CustomerCreateInput = z.input<typeof customerCreateSchema>
export type CustomerCreateData = z.output<typeof customerCreateSchema>
export type ShipToInput = z.input<typeof shipToSchema>
export type ShipToData = z.output<typeof shipToSchema>

export const EMPTY_SHIP_TO: ShipToInput = {
  id: '',
  code: '',
  custCode: '',
  name: '',
  isDefault: false,
  addrSync: false,
  status: 'ACTIVE',
  zipCode: '',
  address: '',
  addressDetail: '',
  regionCode: '',
  receiverName: '',
  receiverPhone: '',
  receiverPhone2: '',
  deliveryMemo: '',
  centerMode: 'AUTO',
  deliveryCenterId: '',
  remark: '',
}
