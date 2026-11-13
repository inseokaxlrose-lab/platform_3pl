import {
  BoxesIcon,
  BuildingIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ContactIcon,
  FilePlusIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  HouseIcon,
  MapIcon,
  MapPinIcon,
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

export type NavAreaKey = 'admin' | 'portal'

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
          href: '/admin/master/company',
          icon: BuildingIcon,
          ready: true,
          permission: 'master.company.read',
        },
        {
          title: '센터',
          href: '/admin/master/centers',
          icon: WarehouseIcon,
          ready: false,
          permission: 'master.centers.read',
        },
        {
          title: '창고',
          href: '/admin/master/warehouses',
          icon: BoxesIcon,
          ready: false,
          permission: 'master.warehouses.read',
        },
        {
          title: '로케이션',
          href: '/admin/master/locations',
          icon: MapPinIcon,
          ready: false,
          permission: 'master.locations.read',
        },
        {
          title: '배송권역',
          href: '/admin/master/delivery-zones',
          icon: MapIcon,
          ready: false,
          permission: 'master.delivery-zones.read',
        },
        {
          title: '단위',
          href: '/admin/master/units',
          icon: RulerIcon,
          ready: false,
          permission: 'master.units.read',
        },
        {
          title: '화주사',
          href: '/admin/master/shippers',
          icon: StoreIcon,
          ready: false,
          permission: 'master.shippers.read',
        },
        {
          title: '품목',
          href: '/admin/master/items',
          icon: PackageIcon,
          ready: false,
          permission: 'master.items.read',
        },
        {
          title: '거래처',
          href: '/admin/master/customers',
          icon: ContactIcon,
          ready: false,
          permission: 'master.customers.read',
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
          ready: false,
          permission: 'inbound.asn.create',
        },
        {
          title: 'ASN 조회',
          href: '/admin/inbound/asn',
          icon: ClipboardListIcon,
          ready: false,
          permission: 'inbound.asn.read',
        },
        {
          title: '입고 검수',
          href: '/admin/inbound/inspection',
          icon: ClipboardCheckIcon,
          ready: false,
          permission: 'inbound.inspection.read',
        },
        {
          title: '라벨 인쇄',
          href: '/admin/inbound/labels',
          icon: PrinterIcon,
          ready: false,
          permission: 'inbound.labels.read',
        },
        {
          title: '입고 확정',
          href: '/admin/inbound/confirm',
          icon: PackageCheckIcon,
          ready: false,
          permission: 'inbound.confirm.read',
        },
        {
          title: '적치',
          href: '/admin/inbound/putaway',
          icon: MapPinIcon,
          ready: false,
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
          ready: false,
          permission: 'stock.inventory.read',
        },
        {
          title: '실사·조정',
          href: '/admin/stock/adjustments',
          icon: ScaleIcon,
          ready: false,
          permission: 'stock.adjustments.read',
        },
        {
          title: '재고 이력',
          href: '/admin/stock/history',
          icon: HistoryIcon,
          ready: false,
          permission: 'stock.history.read',
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
          title: '자료 추출',
          href: '/admin/system/exports',
          icon: FileSpreadsheetIcon,
          ready: false,
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
          ready: false,
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
          ready: false,
          permission: 'portal.asn.create',
        },
        {
          title: 'ASN 조회',
          href: '/portal/asn',
          icon: ClipboardListIcon,
          ready: false,
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
          ready: false,
          permission: 'portal.stock.read',
        },
      ],
    },
  ],
}

export const navigation: Record<NavAreaKey, NavArea> = {
  admin: adminNavigation,
  portal: portalNavigation,
}
