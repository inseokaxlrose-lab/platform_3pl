// 개발용 역할별 권한그룹·견본 계정 정의 (prisma/seed.ts가 사용, docs/decisions/0020)
// PRD "사용자와 역할"의 4가지 역할. 실제 운영에서는 권한그룹 관리 화면에서 회사에 맞게 바꾼다
import {
  ALL_PERMISSION_CODES,
  PERMISSION_MENUS,
  type PermissionAction,
  type PermissionCode,
  type PermissionMenu,
} from '../src/config/permissions'

type UserType = 'OPERATOR' | 'CENTER' | 'SHIPPER'

const menuOf = (code: PermissionCode) => code.slice(0, code.lastIndexOf('.')) as PermissionMenu

// 한 메뉴의 권한 코드: 동작을 고르지 않으면 그 메뉴의 모든 동작
function menu(name: PermissionMenu, actions?: readonly PermissionAction[]): PermissionCode[] {
  const all = PERMISSION_MENUS[name].actions as readonly PermissionAction[]
  return (actions ?? all).map((action) => `${name}.${action}` as PermissionCode)
}

// 여러 메뉴의 조회 권한만
const readOnly = (...names: PermissionMenu[]) => names.flatMap((name) => menu(name, ['read']))

// 운영사 화면의 모든 권한 ("슈퍼 관리자" 그룹)
export const ADMIN_AREA_CODES = ALL_PERMISSION_CODES.filter(
  (code) => PERMISSION_MENUS[menuOf(code)].area === 'admin',
)

export const SUPER_GROUP_NAME = '슈퍼 관리자'

type SeedGroup = {
  name: string
  area: 'ADMIN' | 'PORTAL'
  description: string
  codes: readonly PermissionCode[]
}

// 시드가 관리하는 권한그룹: 시드를 실행할 때마다 권한 목록을 이 정의와 똑같이 맞춘다
export const SEED_GROUPS: readonly SeedGroup[] = [
  {
    name: SUPER_GROUP_NAME,
    area: 'ADMIN',
    description: '운영사 화면의 모든 권한 (시드가 관리)',
    codes: ADMIN_AREA_CODES,
  },
  {
    name: '센터 운영자',
    area: 'ADMIN',
    description: '센터 사무직: 전표 수신·작업 지시, 실사 확정 (시드가 관리)',
    codes: [
      ...readOnly(
        'master.company',
        'master.centers',
        'master.warehouses',
        'master.locations',
        'master.delivery-zones',
        'master.units',
        'master.shippers',
      ),
      ...menu('master.items'),
      ...menu('master.customers'),
      ...menu('inbound.asn'),
      ...menu('inbound.inspection'),
      ...menu('inbound.labels'),
      ...menu('inbound.confirm'),
      ...menu('inbound.putaway'),
      ...menu('stock.inventory'),
      ...menu('stock.adjustments'),
      ...menu('stock.history'),
    ],
  },
  {
    name: '센터 작업자',
    area: 'ADMIN',
    description: '센터 현장 직원: 검수·라벨·확정·적치, 실사 등록 (시드가 관리)',
    codes: [
      ...readOnly('master.items', 'master.locations', 'inbound.asn', 'stock.inventory'),
      ...menu('inbound.inspection'),
      ...menu('inbound.labels'),
      ...menu('inbound.confirm'),
      ...menu('inbound.putaway'),
      // 실사는 등록까지만, 확정은 센터 운영자
      ...menu('stock.adjustments', ['read', 'create']),
    ],
  },
  {
    name: '화주사 사용자',
    area: 'PORTAL',
    description: '화주사 담당자: 품목·ASN 등록, 자기 재고 조회 (시드가 관리)',
    codes: [...menu('portal.items'), ...menu('portal.asn'), ...menu('portal.stock')],
  },
]

type SampleAccount = {
  username: string
  name: string
  userType: UserType
  group: string
  // 소속: 예시 센터·화주사 코드
  centerCodes?: string[]
  shipperCode?: string
}

// 역할별 견본 계정 (비밀번호는 .env의 SEED_SAMPLE_PASSWORD)
export const SAMPLE_ACCOUNTS: readonly SampleAccount[] = [
  { username: 'ops.admin', name: '운영 관리자', userType: 'OPERATOR', group: SUPER_GROUP_NAME },
  {
    username: 'center.manager',
    name: '이천 운영자',
    userType: 'CENTER',
    group: '센터 운영자',
    centerCodes: ['ICN'],
  },
  {
    username: 'center.worker',
    name: '이천 작업자',
    userType: 'CENTER',
    group: '센터 작업자',
    centerCodes: ['ICN'],
  },
  {
    username: 'shipper.user',
    name: '가나식품 담당자',
    userType: 'SHIPPER',
    group: '화주사 사용자',
    shipperCode: 'GANA',
  },
]
