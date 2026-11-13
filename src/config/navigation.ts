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
        { title: '운영사', href: '/admin/master/company', icon: BuildingIcon, ready: false },
        { title: '센터', href: '/admin/master/centers', icon: WarehouseIcon, ready: false },
        { title: '창고', href: '/admin/master/warehouses', icon: BoxesIcon, ready: false },
        { title: '로케이션', href: '/admin/master/locations', icon: MapPinIcon, ready: false },
        { title: '배송권역', href: '/admin/master/delivery-zones', icon: MapIcon, ready: false },
        { title: '단위', href: '/admin/master/units', icon: RulerIcon, ready: false },
        { title: '화주사', href: '/admin/master/shippers', icon: StoreIcon, ready: false },
        { title: '품목', href: '/admin/master/items', icon: PackageIcon, ready: false },
        { title: '거래처', href: '/admin/master/customers', icon: ContactIcon, ready: false },
      ],
    },
    {
      label: '입고',
      items: [
        { title: 'ASN 등록', href: '/admin/inbound/asn/new', icon: FilePlusIcon, ready: false },
        { title: 'ASN 조회', href: '/admin/inbound/asn', icon: ClipboardListIcon, ready: false },
        {
          title: '입고 검수',
          href: '/admin/inbound/inspection',
          icon: ClipboardCheckIcon,
          ready: false,
        },
        { title: '라벨 인쇄', href: '/admin/inbound/labels', icon: PrinterIcon, ready: false },
        {
          title: '입고 확정',
          href: '/admin/inbound/confirm',
          icon: PackageCheckIcon,
          ready: false,
        },
        { title: '적치', href: '/admin/inbound/putaway', icon: MapPinIcon, ready: false },
      ],
    },
    {
      label: '재고',
      items: [
        { title: '재고 조회', href: '/admin/stock', icon: BoxesIcon, ready: false },
        { title: '실사·조정', href: '/admin/stock/adjustments', icon: ScaleIcon, ready: false },
        { title: '재고 이력', href: '/admin/stock/history', icon: HistoryIcon, ready: false },
      ],
    },
    {
      label: '시스템',
      items: [
        { title: '사용자', href: '/admin/system/users', icon: UsersIcon, ready: false },
        { title: '권한그룹', href: '/admin/system/roles', icon: ShieldIcon, ready: false },
        {
          title: '자료 추출',
          href: '/admin/system/exports',
          icon: FileSpreadsheetIcon,
          ready: false,
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
      items: [{ title: '품목', href: '/portal/items', icon: PackageIcon, ready: false }],
    },
    {
      label: 'ASN',
      items: [
        { title: 'ASN 등록', href: '/portal/asn/new', icon: FilePlusIcon, ready: false },
        { title: 'ASN 조회', href: '/portal/asn', icon: ClipboardListIcon, ready: false },
      ],
    },
    {
      label: '재고',
      items: [{ title: '내 재고', href: '/portal/stock', icon: BoxesIcon, ready: false }],
    },
  ],
}

export const navigation: Record<NavAreaKey, NavArea> = {
  admin: adminNavigation,
  portal: portalNavigation,
}
