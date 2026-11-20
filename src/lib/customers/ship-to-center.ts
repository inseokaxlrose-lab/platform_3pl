import 'server-only'
import type { Db } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/regions/address-normalize'
import type { AddressSearcher } from '@/lib/regions/juso-client'
import { resolveCenterByAddress } from '@/lib/regions/center-resolve'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import type { CenterConfirmReason } from './customer-codes'

// 납품처 배송센터 지정 (docs/decisions/0082, 정의서 4번) — 등록·수정·연동·재지정에서 공통으로 쓴다
// 이 함수는 계산만 한다 (저장은 부르는 쪽). 순서:
//   1. 주소 정제 (원본 우편번호·주소 → 정제 결과·등급, 캐시 사용)
//   2. 권역 기준 센터 (resolveCenterByAddress, 온도대 — 2차 온도대별 센터를 위해 인자로 받는다)
//   3. 입력 센터가 있으면 (연동 IF·화면 MANUAL): 있고 · 화주 이용 센터 · 사용 중이면 지정, 아니면 확인 필요(또는 반려)
//      권역 기준 센터와 다르면 "권역 불일치" 표시만 (저장은 정상)
//   4. 입력 센터가 없으면: 화주 정책 REQUIRED는 반려, 권역 결과가 자동 지정 등급 이상·이용 센터·사용 중이면 AUTO 지정,
//      그 외 AUTO_HOLD는 확인 필요로 저장, AUTO_REJECT는 반려
// 화주 정책은 포털·API에만 적용한다 (운영사 화면은 늘 "확인 필요로 저장" — 운영사가 확인 화면에서 처리)

export type ShipToCenterPolicy = 'AUTO_HOLD' | 'AUTO_REJECT' | 'REQUIRED'

export type AssignShipToInput = {
  operatorId: bigint
  shipperId: bigint
  // 원본 주소 (입력·연동 그대로)
  rawZipCode: string | null
  rawAddress: string
  addressDetail: string | null
  // 입력 센터: 연동은 센터코드, 화면은 센터 키 (둘 다 없으면 권역 자동)
  centerCode?: string | null
  centerId?: bigint | null
  // 입력 센터가 어디서 왔는지 (IF = 연동·업로드, MANUAL = 화면)
  inputType?: 'IF' | 'MANUAL'
  // 화주 정책 (화면 저장은 넘기지 않는다 = 늘 확인 필요로 저장)
  policy?: ShipToCenterPolicy
  tempZone?: string
  searcher?: AddressSearcher
  // false = 정제 캐시를 쓰지 않고 다시 정제 (납품처 목록 [재정제])
  useCache?: boolean
  actor: string
}

// 저장할 칸 (tb_ship_to의 주소·배송센터 칸 이름 그대로)
export type ShipToCenterFields = {
  rawZipCode: string | null
  rawAddress: string
  zipCode: string | null
  address: string
  addressDetail: string | null
  addressJibun: string | null
  regionCode: string | null
  sigunguName: string | null
  bdMgtSn: string | null
  addressGrade: string
  addressNormMethod: string
  addressNormAt: Date
  deliveryCenterId: bigint | null
  centerAssignType: 'IF' | 'AUTO' | 'MANUAL' | null
  centerAssignStatus: 'ASSIGNED' | 'NEED_CONFIRM'
  centerConfirmReason: CenterConfirmReason | null
  regionCenterId: bigint | null
  regionMismatchYn: 'Y' | 'N'
  resolveLevel: string | null
  centerAssignedAt: Date | null
  centerAssignedBy: string | null
}

export type AssignShipToResult = {
  fields: ShipToCenterFields
  // 화주 정책으로 반려 (이 납품처는 저장하지 않는다) — API 건별 오류코드
  rejected: { code: 'CENTER_REQUIRED' | CenterConfirmReason; message: string } | null
  // 정해졌지만 알릴 것 (시군구 추정·우편번호 불일치 등)
  warnings: string[]
  // 화면·응답 표시용
  centerCode: string | null
  centerName: string | null
}

const REASON_MESSAGE: Record<CenterConfirmReason, string> = {
  ADDR_NOT_RESOLVED: '주소를 확인하지 못했거나 자동 지정 등급보다 낮습니다.',
  REGION_UNASSIGNED: '권역설정에 배정되지 않은 지역입니다.',
  REGION_MIXED: '여러 센터가 섞인 지역입니다. 배송센터를 직접 골라 주세요.',
  NOT_SHIPPER_CENTER: '화주가 이용하지 않는 센터입니다.',
  CENTER_INACTIVE: '일시중지·폐쇄된 센터입니다.',
  INVALID_CENTER_CD: '없는 센터코드입니다.',
}

const INACTIVE_CENTER = ['SUSPENDED', 'CLOSED']

export async function assignShipToCenter(
  db: Db,
  input: AssignShipToInput,
): Promise<AssignShipToResult> {
  // 1. 주소 정제
  const norm = await normalizeAddress(
    db,
    { address: input.rawAddress, zipCode: input.rawZipCode, detail: input.addressDetail },
    { searcher: input.searcher, useCache: input.useCache },
  )
  const sigungu = norm.sigunguCode
    ? await db.regionBjd.findFirst({
        where: { sigunguCode: norm.sigunguCode },
        select: { sigunguName: true },
      })
    : null
  const now = new Date()
  const base = {
    rawZipCode: input.rawZipCode,
    rawAddress: input.rawAddress,
    // 정제 실패(F)면 원본을 그대로 주소에 둔다
    zipCode: norm.zipCode ?? (input.rawZipCode?.replace(/\D/g, '').slice(0, 10) || null),
    address: (norm.roadAddress ?? input.rawAddress).slice(0, 200),
    addressDetail: input.addressDetail ?? norm.detailAddress ?? null,
    addressJibun: norm.jibunAddress?.slice(0, 200) ?? null,
    regionCode: norm.bjdCode,
    sigunguName: sigungu?.sigunguName ?? null,
    bdMgtSn: norm.bdMgtSn,
    addressGrade: norm.grade,
    addressNormMethod: norm.method,
    addressNormAt: now,
  }

  // 2. 권역 기준 센터
  const resolution = await resolveCenterByAddress(
    db,
    input.operatorId,
    norm,
    input.tempZone ?? TEMP_ZONE_ALL,
  )
  const regionCenterId = resolution.centerId
  const shipperCenters = await db.shipperCenter.findMany({
    where: { shipperId: input.shipperId, status: 'ACTIVE' },
    select: { center: { select: { id: true, code: true, name: true, status: true } } },
  })
  const shipperCenterOf = (id: bigint | null) =>
    id === null ? undefined : shipperCenters.find((c) => c.center.id === id)?.center

  const policy = input.policy
  const hold = (reason: CenterConfirmReason): AssignShipToResult => {
    const reject =
      policy === 'AUTO_REJECT' || policy === 'REQUIRED'
        ? { code: reason, message: REASON_MESSAGE[reason] }
        : null
    return {
      fields: {
        ...base,
        deliveryCenterId: null,
        centerAssignType: null,
        centerAssignStatus: 'NEED_CONFIRM',
        centerConfirmReason: reason,
        regionCenterId,
        regionMismatchYn: 'N',
        resolveLevel: resolution.resolveLevel,
        centerAssignedAt: null,
        centerAssignedBy: null,
      },
      rejected: reject,
      warnings: resolution.warnings,
      centerCode: null,
      centerName: null,
    }
  }
  const assign = (
    center: { id: bigint; code: string; name: string },
    type: 'IF' | 'AUTO' | 'MANUAL',
  ): AssignShipToResult => ({
    fields: {
      ...base,
      deliveryCenterId: center.id,
      centerAssignType: type,
      centerAssignStatus: 'ASSIGNED',
      centerConfirmReason: null,
      regionCenterId,
      // 권역 기준 센터가 있고 다르면 불일치 (저장은 정상)
      regionMismatchYn: regionCenterId !== null && regionCenterId !== center.id ? 'Y' : 'N',
      resolveLevel: resolution.resolveLevel,
      centerAssignedAt: now,
      centerAssignedBy: type === 'AUTO' ? 'SYSTEM' : input.actor,
    },
    rejected: null,
    warnings: resolution.warnings,
    centerCode: center.code,
    centerName: center.name,
  })

  // 3. 입력 센터가 있는 경우
  const code = input.centerCode?.trim().toUpperCase()
  if (code || input.centerId) {
    const center = code
      ? await db.center.findFirst({
          where: { operatorId: input.operatorId, code },
          select: { id: true, code: true, name: true, status: true },
        })
      : await db.center.findUnique({
          where: { id: input.centerId! },
          select: { id: true, code: true, name: true, status: true },
        })
    if (!center) return hold('INVALID_CENTER_CD')
    if (!shipperCenterOf(center.id)) return hold('NOT_SHIPPER_CENTER')
    if (INACTIVE_CENTER.includes(center.status)) return hold('CENTER_INACTIVE')
    return assign(center, input.inputType ?? (code ? 'IF' : 'MANUAL'))
  }

  // 4. 입력 센터가 없는 경우
  if (policy === 'REQUIRED') {
    const held = hold('ADDR_NOT_RESOLVED')
    return {
      ...held,
      rejected: { code: 'CENTER_REQUIRED', message: '이 화주는 배송센터를 꼭 지정해야 합니다.' },
    }
  }
  if (regionCenterId === null) {
    // 주소를 못 찾음 / 센터가 섞임 / 미배정
    if (!norm.bjdCode && !norm.zipCode && !norm.sigunguCode) return hold('ADDR_NOT_RESOLVED')
    return hold(resolution.candidates.length > 1 ? 'REGION_MIXED' : 'REGION_UNASSIGNED')
  }
  // 센터는 나왔지만 자동 지정 등급보다 낮은 주소
  if (resolution.needConfirm) return hold('ADDR_NOT_RESOLVED')
  const center = shipperCenterOf(regionCenterId)
  if (!center) return hold('NOT_SHIPPER_CENTER')
  if (INACTIVE_CENTER.includes(center.status)) return hold('CENTER_INACTIVE')
  return assign(center, 'AUTO')
}
