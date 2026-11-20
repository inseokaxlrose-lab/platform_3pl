import {
  BoxesIcon,
  HashIcon,
  SlidersHorizontalIcon,
  BuildingIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ContactIcon,
  FilePlusIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  HouseIcon,
  LinkIcon,
  ListTreeIcon,
  MapIcon,
  MapPinIcon,
  MapPinnedIcon,
  PackageCheckIcon,
  PackageIcon,
  PrinterIcon,
  RulerIcon,
  ScaleIcon,
  ShieldIcon,
  StoreIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
  KeyRoundIcon,
  LayersIcon,
  ActivityIcon,
  TruckIcon,
  SignatureIcon,
} from 'lucide-react'
import type { PermissionCode } from './permissions'

// 메뉴 목록은 이 파일 한 곳에서 관리한다
// M1에서 각 메뉴에 권한 코드를 붙여, 권한에 따라 보이고 숨기게 한다

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  // false면 "준비 중"으로 흐리게 표시하고 누를 수 없다 (화면을 만들면 true로 바꾼다)
  ready: boolean
  // true면 주소가 정확히 같을 때만 선택 표시 (홈처럼 다른 메뉴의 앞부분이 되는 주소)
  exact?: boolean
  // 이 메뉴를 보려면 필요한 권한 (없으면 그 영역에 들어온 사람 누구나: 홈)
  // 숨김 처리는 "화면: 권한에 따른 메뉴·버튼 표시" 작업에서 한다
  permission?: PermissionCode
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export type NavArea = {
  title: string
  homeHref: string
  groups: NavGroup[]
}

export type NavAreaKey = 'admin' | 'portal' | 'platform'

const adminNavigation: NavArea = {
  title: '운영사 화면',
  homeHref: '/admin',
  groups: [
    {
      items: [{ title: '홈', href: '/admin', icon: HouseIcon, ready: true, exact: true }],
    },
    {
      label: '기준정보',
      items: [
        {
          title: '운영사',
          href: '/admin/master/operator',
          icon: BuildingIcon,
          ready: true,
          permission: 'master.operator.read',
        },
        {
          title: '센터',
          href: '/admin/master/centers',
          icon: WarehouseIcon,
          ready: true,
          permission: 'master.centers.read',
        },
        {
          title: '창고',
          href: '/admin/master/warehouses',
          icon: BoxesIcon,
          ready: true,
          permission: 'master.warehouses.read',
        },
        {
          title: '로케이션',
          href: '/admin/master/locations',
          icon: MapPinIcon,
          ready: true,
          permission: 'master.locations.read',
        },
        {
          title: '권역설정',
          href: '/admin/master/regions',
          icon: MapIcon,
          ready: true,
          permission: 'master.regions.read',
        },
        {
          title: '단위',
          href: '/admin/master/units',
          icon: RulerIcon,
          ready: true,
          permission: 'master.units.read',
        },
        {
          // 팔레트 종류 (0083): 품목 PLT 계산 기준 — 권한은 단위와 같다
          title: '팔레트 종류',
          href: '/admin/master/pallet-types',
          icon: LayersIcon,
          ready: true,
          permission: 'master.units.read',
        },
        {
          title: '화주사',
          href: '/admin/master/shippers',
          icon: StoreIcon,
          ready: true,
          permission: 'master.shippers.read',
        },
        {
          title: '품목',
          href: '/admin/master/items',
          icon: PackageIcon,
          ready: true,
          permission: 'master.items.read',
        },
        {
          title: '거래처',
          href: '/admin/master/customers',
          icon: ContactIcon,
          ready: true,
          permission: 'master.customers.read',
        },
        {
          // 납품처 (0082 ②): 배송센터 확인 필요·권역 불일치를 모아 처리 — 권한은 거래처와 같다
          title: '납품처',
          href: '/admin/master/ship-tos',
          icon: MapPinnedIcon,
          ready: true,
          permission: 'master.customers.read',
        },
        {
          // 운송사·운송 계약 (0094)
          title: '운송사',
          href: '/admin/master/carriers',
          icon: TruckIcon,
          ready: true,
          permission: 'master.carriers.read',
        },
        {
          title: '운송 계약',
          href: '/admin/master/carrier-contracts',
          icon: SignatureIcon,
          ready: true,
          permission: 'master.carrier-contracts.read',
        },
        {
          title: '외부코드 매핑',
          href: '/admin/master/external-codes',
          icon: LinkIcon,
          ready: true,
          permission: 'master.external-codes.read',
        },
      ],
    },
    {
      label: '입고',
      items: [
        {
          title: 'ASN 등록',
          href: '/admin/inbound/asn/new',
          icon: FilePlusIcon,
          ready: true,
          permission: 'inbound.asn.create',
        },
        {
          title: 'ASN 조회',
          href: '/admin/inbound/asn',
          icon: ClipboardListIcon,
          ready: true,
          permission: 'inbound.asn.read',
        },
        {
          title: '입고 검수',
          href: '/admin/inbound/inspection',
          icon: ClipboardCheckIcon,
          ready: true,
          permission: 'inbound.inspection.read',
        },
        {
          title: '라벨 인쇄',
          href: '/admin/inbound/labels',
          icon: PrinterIcon,
          ready: true,
          permission: 'inbound.labels.read',
        },
        {
          title: '입고 확정',
          href: '/admin/inbound/confirm',
          icon: PackageCheckIcon,
          ready: true,
          permission: 'inbound.confirm.read',
        },
        {
          title: '적치',
          href: '/admin/inbound/putaway',
          icon: MapPinIcon,
          ready: true,
          permission: 'inbound.putaway.read',
        },
      ],
    },
    {
      label: '재고',
      items: [
        {
          title: '재고 조회',
          href: '/admin/stock',
          icon: BoxesIcon,
          ready: true,
          permission: 'stock.inventory.read',
        },
        {
          title: '실사·조정',
          href: '/admin/stock/adjustments',
          icon: ScaleIcon,
          ready: true,
          permission: 'stock.adjustments.read',
        },
        {
          title: '재고 이력',
          href: '/admin/stock/history',
          icon: HistoryIcon,
          ready: true,
          permission: 'stock.history.read',
        },
      ],
    },
    {
      // 화주 연동 API (0081)
      label: '연동',
      items: [
        {
          title: 'API 키',
          href: '/admin/integration/api-keys',
          icon: KeyRoundIcon,
          ready: true,
          permission: 'integration.api-keys.read',
        },
        {
          title: 'API 호출 이력',
          href: '/admin/integration/api-logs',
          icon: ActivityIcon,
          ready: true,
          permission: 'integration.api-logs.read',
        },
      ],
    },
    {
      label: '시스템',
      items: [
        {
          title: '사용자',
          href: '/admin/system/users',
          icon: UsersIcon,
          ready: true,
          permission: 'system.users.read',
        },
        {
          title: '권한그룹',
          href: '/admin/system/roles',
          icon: ShieldIcon,
          ready: true,
          permission: 'system.roles.read',
        },
        {
          title: '공통코드',
          href: '/admin/system/codes',
          icon: ListTreeIcon,
          ready: true,
          permission: 'system.codes.read',
        },
        {
          // 체번 규칙 (0085): 코드·문서번호 모양
          title: '체번 규칙',
          href: '/admin/system/numbering',
          icon: HashIcon,
          ready: true,
          permission: 'system.numbering.read',
        },
        {
          // 운영 설정 (0092): 운영사가 바꾸는 키-값 설정
          title: '운영 설정',
          href: '/admin/system/settings',
          icon: SlidersHorizontalIcon,
          ready: true,
          permission: 'system.settings.read',
        },
        {
          title: '자료 추출',
          href: '/admin/system/exports',
          icon: FileSpreadsheetIcon,
          ready: true,
          permission: 'system.exports.read',
        },
      ],
    },
  ],
}

const portalNavigation: NavArea = {
  title: '화주 포털',
  homeHref: '/portal',
  groups: [
    {
      items: [{ title: '홈', href: '/portal', icon: HouseIcon, ready: true, exact: true }],
    },
    {
      label: '품목',
      items: [
        {
          title: '품목',
          href: '/portal/items',
          icon: PackageIcon,
          ready: true,
          permission: 'portal.items.read',
        },
      ],
    },
    {
      label: 'ASN',
      items: [
        {
          title: 'ASN 등록',
          href: '/portal/asn/new',
          icon: FilePlusIcon,
          ready: true,
          permission: 'portal.asn.create',
        },
        {
          title: 'ASN 조회',
          href: '/portal/asn',
          icon: ClipboardListIcon,
          ready: true,
          permission: 'portal.asn.read',
        },
      ],
    },
    {
      label: '재고',
      items: [
        {
          title: '내 재고',
          href: '/portal/stock',
          icon: BoxesIcon,
          ready: true,
          permission: 'portal.stock.read',
        },
      ],
    },
  ],
}

// 플랫폼 화면: 플랫폼 관리자가 운영사를 관리하고, 운영사를 골라 그 운영사로 작업한다 (0039)
const platformNavigation: NavArea = {
  title: '플랫폼',
  homeHref: '/platform',
  groups: [
    {
      items: [{ title: '홈', href: '/platform', icon: HouseIcon, ready: true, exact: true }],
    },
    {
      label: '운영사',
      items: [
        {
          title: '운영사',
          href: '/platform/operators',
          icon: BuildingIcon,
          ready: true,
          permission: 'platform.operators.read',
        },
      ],
    },
  ],
}

export const navigation: Record<NavAreaKey, NavArea> = {
  admin: adminNavigation,
  portal: portalNavigation,
  platform: platformNavigation,
}
