import type { StatusFormat } from '@/components/data-grid'
import { codeSet, STOCK_STATUS } from '@/config/operator-codes'
import { isYes } from '@/lib/yn'

// 창고 유형·상태·유형별 기본값 (docs/decisions/0074) — 화면·서버 공용
// 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건 (운영사 공통코드가 아니다, 0030·0040)
// 값을 더하면 마이그레이션의 검사 조건(tb_warehouse_type_check 등)도 함께 바꾼다

export const WAREHOUSE_TYPE = codeSet({
  STORAGE: '일반 보관',
  INBOUND: '입고대기',
  OUTBOUND: '출고대기',
  RETURN: '반품대기',
  QC: '검수·보류',
  DAMAGED: '불량',
  VAS: '유통가공',
  CROSSDOCK: '크로스도킹',
})
export type WarehouseTypeKey = (typeof WAREHOUSE_TYPE.values)[number]

// 상태: 로케이션과 같은 값 체계 (사용 / 사용 중지)
export const WAREHOUSE_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용 중지' })

// 유형을 고르면 채우는 운영 속성 기본값 (사용자가 고칠 수 있다)
// 출고대기는 이미 할당·피킹된 재고가 머무는 곳이라 다시 할당하지 않는다
export type WarehouseOps = {
  inbound: boolean
  outbound: boolean
  allocatable: boolean
  defaultStockStatus: (typeof STOCK_STATUS.values)[number]
}
export const WAREHOUSE_TYPE_DEFAULTS: Record<WarehouseTypeKey, WarehouseOps> = {
  STORAGE: { inbound: true, outbound: true, allocatable: true, defaultStockStatus: 'NORMAL' },
  INBOUND: { inbound: true, outbound: false, allocatable: false, defaultStockStatus: 'NORMAL' },
  OUTBOUND: { inbound: false, outbound: true, allocatable: false, defaultStockStatus: 'NORMAL' },
  RETURN: { inbound: true, outbound: false, allocatable: false, defaultStockStatus: 'HOLD' },
  QC: { inbound: true, outbound: false, allocatable: false, defaultStockStatus: 'HOLD' },
  DAMAGED: { inbound: true, outbound: false, allocatable: false, defaultStockStatus: 'DAMAGED' },
  VAS: { inbound: true, outbound: true, allocatable: false, defaultStockStatus: 'NORMAL' },
  CROSSDOCK: { inbound: true, outbound: true, allocatable: false, defaultStockStatus: 'NORMAL' },
}

// 시스템 기본 창고 (센터 등록 때 자동 생성): 센터마다 입고·출고·반품 대기 1개씩
// 삭제·코드·유형·명칭 변경·사용 중지 불가, 로케이션 추가 불가(기본 로케이션 DEFAULT 하나만)
export const SYSTEM_WAREHOUSE_TYPES = ['INBOUND', 'OUTBOUND', 'RETURN'] as const
export const isSystemWarehouse = (warehouse: { systemYn: string }) => isYes(warehouse.systemYn)

// 기본 창고 온도대: 센터 취급 온도대 중 상온, 없으면 첫 번째(상수 순서), 하나도 없으면 상온
export function pickSystemTempZone(centerZones: readonly string[]) {
  const order = ['AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT']
  return [...centerZones].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'AMBIENT'
}

// 목록 배지
export const WAREHOUSE_TYPE_BADGE: StatusFormat = Object.fromEntries(
  WAREHOUSE_TYPE.options.map(({ value, label }) => [
    value,
    {
      label,
      tone: value === 'STORAGE' ? 'neutral' : value === 'DAMAGED' ? 'danger' : 'info',
    },
  ]),
)

export const TEMP_ZONE_BADGE: StatusFormat = {
  AMBIENT: { label: '상온', tone: 'neutral' },
  CHILLED: { label: '냉장', tone: 'info' },
  FROZEN: { label: '냉동', tone: 'warning' },
  CONSTANT: { label: '항온', tone: 'success' },
}
