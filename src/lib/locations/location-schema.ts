import { z } from 'zod'
import { idField, optionalIdSchema } from '@/lib/id'
import { optionalCount, optionalDecimal, optionalText } from '@/lib/validation/common-fields'
import { locationCodeField, locationPatternSchema } from './location-pattern'

// 로케이션 입력 규칙 — 화면·서버 공용 (docs/decisions/0075, docs/specs/location.md)
// 1차 칸은 화면(추가·수정 팝업)에서, 2차 칸은 API만 (보내지 않으면 그대로 → .optional())
// 용량은 항상 cm·kg로 받는다 (화면이 운영사 단위에서 바꿔 보낸다)

// 열·단·연·칸: 영문 대문자·숫자 10자 (비우면 null)
const positionPart = z
  .string()
  .trim()
  .toUpperCase()
  .max(10, '10자 이하입니다.')
  .regex(/^[A-Z0-9]*$/, '영문·숫자만 씁니다.')
  .transform((value) => value || null)

// 상속 칸(예/아니오): null = 창고 값을 따름
const inheritableYn = z.boolean().nullable()
const optionalSeq = optionalCount

export const locationShape = {
  // ① 기본 정보
  zoneId: optionalIdSchema,
  description: optionalText(200),
  // 공통코드 LOC_TYPE (서버가 확인)
  locType: z.string().trim().min(1, '로케이션 유형을 골라 주세요.').max(20),
  remark: optionalText(1000),
  // ② 위치 구성 (1차: 열·단)
  rowNo: positionPart,
  levelNo: positionPart,
  // ③ 용량 (cm·kg)
  widthCm: optionalDecimal(8, 2),
  depthCm: optionalDecimal(8, 2),
  heightCm: optionalDecimal(8, 2),
  maxCbm: optionalDecimal(10, 4),
  maxWeightKg: optionalDecimal(10, 2),
  maxPalletCnt: optionalCount,
  // ④ 운영 속성: 적치·피킹·할당 가능은 null = 창고 값
  inbound: inheritableYn,
  outbound: inheritableYn,
  allocatable: inheritableYn,
  mixItem: z.boolean(),
  mixLot: z.boolean(),
  mixClient: z.boolean(),
  putawaySeq: optionalSeq,
  pickSeq: optionalSeq,

  // ── 2차: API만 (보내지 않으면 그대로)
  bayNo: positionPart.optional(),
  cellNo: positionPart.optional(),
  posX: optionalDecimal(10, 2).optional(),
  posY: optionalDecimal(10, 2).optional(),
  // 잠금: 잠그면 사유(공통코드 LOCK_REASON) 필수
  lock: z.boolean().optional(),
  lockReason: optionalText(20).optional(),
  // 공통코드 ABC_CLASS
  abcClass: optionalText(5).optional(),
  dedicatedShipperId: optionalIdSchema.optional(),
}

// 잠그면 사유 필수 (2차 칸을 보냈을 때만)
const requireLockReason = (
  value: { lock?: boolean; lockReason?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.lock && !value.lockReason) {
    ctx.addIssue({ code: 'custom', path: ['lockReason'], message: '잠금 사유를 골라 주세요.' })
  }
}

// 한 칸 추가: 창고·코드 함께 (등록 후에는 창고·코드를 바꿀 수 없다)
export const locationCreateSchema = z
  .object({
    warehouseId: idField('창고를 골라 주세요.'),
    code: locationCodeField,
    ...locationShape,
  })
  .superRefine(requireLockReason)

export const locationUpdateSchema = z.object(locationShape).superRefine(requireLockReason)

export type LocationCreateInput = z.input<typeof locationCreateSchema>
export type LocationData = z.output<typeof locationUpdateSchema>
export type LocationFormValue = z.input<typeof locationCreateSchema>

// 일괄 생성: 창고·구역 + 패턴 + 만들 로케이션의 공통 속성
export const locationBulkSchema = z.object({
  warehouseId: idField('창고를 골라 주세요.'),
  zoneId: idField('구역을 골라 주세요.'),
  pattern: locationPatternSchema,
  attributes: z.object({
    locType: locationShape.locType,
    widthCm: locationShape.widthCm,
    depthCm: locationShape.depthCm,
    heightCm: locationShape.heightCm,
    maxCbm: locationShape.maxCbm,
    maxWeightKg: locationShape.maxWeightKg,
    maxPalletCnt: locationShape.maxPalletCnt,
    inbound: inheritableYn,
    outbound: inheritableYn,
    allocatable: inheritableYn,
    mixItem: z.boolean(),
    mixLot: z.boolean(),
    mixClient: z.boolean(),
  }),
})
export type LocationBulkInput = z.input<typeof locationBulkSchema>
export type LocationBulkData = z.output<typeof locationBulkSchema>

// 일괄 생성 공통 속성 기본값 (화면 처음 값)
export const DEFAULT_BULK_ATTRIBUTES: LocationBulkInput['attributes'] = {
  locType: 'RACK',
  widthCm: '',
  depthCm: '',
  heightCm: '',
  maxCbm: '',
  maxWeightKg: '',
  maxPalletCnt: null,
  inbound: null,
  outbound: null,
  allocatable: null,
  mixItem: true,
  mixLot: true,
  mixClient: false,
}
