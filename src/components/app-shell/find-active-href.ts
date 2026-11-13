// 현재 주소에 해당하는 메뉴 주소 하나를 찾는다
// - 주소가 같거나, 메뉴 주소 + '/'로 시작하면 해당 (예: /admin/inbound/asn/123 → ASN 조회)
// - 여러 개가 해당하면 가장 긴(가장 구체적인) 메뉴 하나만 고른다
//   (예: /admin/inbound/asn/new 는 'ASN 조회'가 아니라 'ASN 등록')
// - exact 메뉴(홈 등)는 주소가 정확히 같을 때만 해당
export function findActiveHref(
  pathname: string,
  items: { href: string; exact?: boolean }[],
): string | null {
  let best: string | null = null

  for (const item of items) {
    const matches = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)

    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href
    }
  }

  return best
}
