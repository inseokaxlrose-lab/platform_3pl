// 쇼케이스용 가짜 재고 데이터 1,000건 (실제 DB 구조와 무관한 예시)
// 매번 같은 결과가 나오도록 고정된 씨앗값(seed)으로 난수를 만든다

export type FakeInventoryRow = {
  id: string
  centerName: string
  location: string
  shipperName: string
  itemCode: string
  itemName: string
  lotNo: string | null
  expiryDate: string | null
  qty: string // 재고 수량은 Decimal → 문자열
  unit: string
  status: 'NORMAL' | 'EXPIRING' | 'HOLD'
  updatedAt: string
}

// 간단한 고정 난수 생성기 (mulberry32)
function createRandom(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CENTERS = ['이천센터', '김해센터']
const SHIPPERS = [
  { name: '가나식품', usesLot: true },
  { name: '다라전자', usesLot: false },
  { name: '마바화장품', usesLot: true },
  { name: '사아생활', usesLot: false },
]
const ITEMS = [
  '생수 2L',
  '컵라면',
  '보조배터리',
  '선크림',
  '샴푸',
  '건전지 AA',
  '김치 1kg',
  '마스크팩',
]

function pad(n: number, size: number) {
  return String(n).padStart(size, '0')
}

export function createFakeInventory(count = 1000): FakeInventoryRow[] {
  const random = createRandom(20261113)
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]
  const base = Date.UTC(2026, 10, 13)

  return Array.from({ length: count }, (_, i) => {
    const shipper = pick(SHIPPERS)
    const itemIndex = Math.floor(random() * ITEMS.length)
    const daysToExpiry = Math.floor(random() * 400) - 20
    const status: FakeInventoryRow['status'] =
      random() < 0.05 ? 'HOLD' : shipper.usesLot && daysToExpiry < 30 ? 'EXPIRING' : 'NORMAL'
    const isKg = itemIndex === 6
    const qty = isKg
      ? (random() * 5000).toFixed(3) // KG는 소수 3자리
      : String(Math.floor(random() * 120000))

    return {
      id: `INV-${pad(i + 1, 5)}`,
      centerName: pick(CENTERS),
      location: `${pick(['A', 'B', 'C'])}-${pad(1 + Math.floor(random() * 10), 2)}-${pad(1 + Math.floor(random() * 5), 2)}`,
      shipperName: shipper.name,
      itemCode: `SKU-${pad(100 + itemIndex, 4)}`,
      itemName: ITEMS[itemIndex],
      lotNo: shipper.usesLot ? `L${pad(Math.floor(random() * 99999), 5)}` : null,
      expiryDate: shipper.usesLot
        ? new Date(base + daysToExpiry * 86_400_000).toISOString().slice(0, 10)
        : null,
      qty,
      unit: isKg ? 'KG' : 'EA',
      status,
      updatedAt: new Date(base - Math.floor(random() * 30 * 86_400_000)).toISOString(),
    }
  })
}
