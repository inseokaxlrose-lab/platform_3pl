import { z } from 'zod'
import { TEMP_ZONE } from '@/config/operator-codes'
import { contactSchema } from '@/lib/contacts/contact-schema'
import { optionalIdSchema } from '@/lib/id'
import {
  addressShape,
  exactlyOne,
  optionalBusinessNumber,
  optionalCount,
  optionalDateText,
  optionalDecimal,
  optionalEmail,
  optionalPhone,
  optionalText,
  oneOf,
  optionalTime,
  requiredText,
} from '@/lib/validation/common-fields'
import { CENTER_STATUS, CENTER_STATUSES_NEEDING_REASON, CENTER_TYPE } from './center-status'

// 센터 입력 규칙 — 화면·서버 공용 (docs/decisions/0073, docs/specs/center.md)
// 1차 칸은 화면에서 입력, 2차 칸은 API만 받는다(보내지 않으면 그대로 둔다 → .optional())

// 센터코드: 영문 대문자·숫자 1~20자, 필수 (소문자는 대문자로). 등록 후 바꿀 수 없다 (서버가 무시)
export const centerCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '센터코드를 입력해 주세요.')
  .max(20, '20자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9]*$/, '센터코드는 영문 대문자·숫자만 씁니다.')

// 센터 담당자 (0073): 운영사 담당자 규칙 + 숨은 줄 키(있으면 고치고, 없으면 새로), 최대 10명, 대표 1명
export const MAX_CENTER_CONTACTS = 10
export const CENTER_CONTACT_ROLE_GROUP = 'CENTER_CONTACT_ROLE'
export const centerContactSchema = contactSchema.and(
  z.object({ id: optionalIdSchema.default(null) }),
)
export const centerContactsSchema = z
  .array(centerContactSchema)
  .max(MAX_CENTER_CONTACTS, `담당자는 ${MAX_CENTER_CONTACTS}명까지 등록할 수 있습니다.`)
  .superRefine(exactlyOne('isPrimary', '대표 담당자를 1명 정해 주세요.'))

// 운영 요일: 월~일 Y/N 7글자 (기본 평일)
export const DEFAULT_WORK_DAYS = 'YYYYYNN'
const workDaysField = z.string().regex(/^[YN]{7}$/, '운영 요일을 확인해 주세요.')

const yn = z.boolean()
// 상속 칸(예/아니오): null = 운영사 값
const inheritableYn = z.boolean().nullable()

export const centerShape = {
  // ① 기본 정보
  name: requiredText('센터명을 입력해 주세요.', 100),
  nameEn: optionalText(100),
  shortName: optionalText(30),
  type: oneOf(CENTER_TYPE.values, '센터 유형을 골라 주세요.'),
  openedOn: optionalDateText,
  businessNumber: optionalBusinessNumber,
  subBizNo: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4}$/.test(value), '종사업장번호는 숫자 4자리입니다.')
    .transform((value) => value || null),
  sortOrder: z.number().int('정수로 입력해 주세요.').min(0).max(9999),
  remark: optionalText(1000),
  // ② 위치·연락처 (센터는 주소 필수: 택배 집하·배차 기준)
  ...addressShape,
  addressJibun: optionalText(200),
  regionName: optionalText(50),
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  directions: optionalText(1000),
  // ③ 시설 정보 (1차)
  floorAreaM2: optionalDecimal(12, 2),
  storageAreaM2: optionalDecimal(12, 2),
  dockCount: optionalCount,
  // 하나 이상 (창고 온도대는 이 안에서 고른다, 0074)
  tempZones: z
    .array(oneOf(TEMP_ZONE.values, '알 수 없는 온도대입니다.'))
    .min(1, '취급 온도대를 하나 이상 골라 주세요.')
    .transform((values) => [...new Set(values)]),
  // ④ 시설 자격 (1차)
  bondedYn: yn,
  // ⑤ 운영 설정 (1차)
  workStartTime: optionalTime,
  workEndTime: optionalTime,
  workDays: workDaysField,
  inboundCutoffTime: optionalTime,
  // 상속: null = 운영사 값
  shipCutoffTime: optionalTime,
  defaultInboundLocId: optionalIdSchema,
  defaultOutboundLocId: optionalIdSchema,
  defaultReturnLocId: optionalIdSchema,
  contacts: centerContactsSchema,

  // ── 2차: API만 (보내지 않으면 그대로)
  landAreaM2: optionalDecimal(12, 2).optional(),
  floorCount: optionalCount.optional(),
  ceilingHeightM: optionalDecimal(5, 2).optional(),
  palletCapacity: optionalCount.optional(),
  warehouseRegNo: optionalText(30).optional(),
  glnCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{13}$/.test(value), 'GLN은 숫자 13자리입니다.')
    .transform((value) => value || null)
    .optional(),
  bondedType: z
    .enum(['BW_COMMERCIAL', 'BW_PRIVATE', 'BONDED_FACTORY', 'GENERAL_BONDED', 'FTZ'])
    .nullable()
    .optional(),
  bondedLicenseNo: optionalText(30).optional(),
  bondedAreaCode: optionalText(20).optional(),
  customsOfficeCode: optionalText(10).optional(),
  hazmatYn: yn.optional(),
  foodStorageYn: yn.optional(),
  pharmaYn: yn.optional(),
  timezone: optionalText(50).optional(),
  allocRule: z.enum(['FIFO', 'FEFO', 'LIFO']).nullable().optional(),
  useLot: inheritableYn.optional(),
  useExpiry: inheritableYn.optional(),
  useSerial: inheritableYn.optional(),
}

// 주소 필수 (화면·서버에서만, 기존 센터는 주소가 비어 있을 수 있어 DB는 막지 않는다)
export const requireAddress = (
  value: { zipCode: string | null; address: string | null },
  ctx: z.RefinementCtx,
) => {
  if (!value.zipCode || !value.address) {
    ctx.addIssue({
      code: 'custom',
      path: ['address'],
      message: '주소를 입력해 주세요. ([주소 검색])',
    })
  }
}

// 수정: 코드는 받지 않는다 (바꿀 수 없음)
export const centerSchema = z.object(centerShape).superRefine(requireAddress)

// 등록: 센터코드 필수
export const centerCreateSchema = z
  .object({ code: centerCodeField, ...centerShape })
  .superRefine(requireAddress)

export type CenterInput = z.input<typeof centerSchema>
export type CenterData = z.output<typeof centerSchema>
export type CenterCreateInput = z.input<typeof centerCreateSchema>
export type CenterCreateData = z.output<typeof centerCreateSchema>

// 상태 변경 (헤더 배지 → 상태 변경 팝업): 일시중지·폐쇄는 사유, 폐쇄는 운영 종료일 필수
export const centerStatusSchema = z
  .object({
    status: oneOf(CENTER_STATUS.values, '상태를 골라 주세요.'),
    reason: optionalText(200),
    closedOn: optionalDateText,
  })
  .superRefine((value, ctx) => {
    if (CENTER_STATUSES_NEEDING_REASON.includes(value.status) && !value.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: '사유를 입력해 주세요.' })
    }
    if (value.status === 'CLOSED' && !value.closedOn) {
      ctx.addIssue({ code: 'custom', path: ['closedOn'], message: '운영 종료일을 입력해 주세요.' })
    }
  })

export type CenterStatusInput = z.input<typeof centerStatusSchema>

// 등록 입력 → 수정 입력 (센터코드는 바꿀 수 없어 수정 때 보내지 않는다)
export function withoutCode<T extends { code: string }>({ code, ...rest }: T): Omit<T, 'code'> {
  void code
  return rest
}
