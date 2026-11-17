import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { TEMP_ZONE } from '@/config/operator-codes'
import { WAREHOUSE_TYPE, isSystemWarehouse } from '@/lib/warehouses/warehouse-codes'
import type { CenterForEdit } from './queries'

// 센터 수정 화면의 "창고" 섹션 내용: 이 센터의 창고 목록 (창고 메뉴와 연결)
export function WarehouseSummary({
  warehouses,
  canView,
}: {
  warehouses: CenterForEdit['warehouses']
  // 창고 조회 권한: 줄을 누르면 창고 수정으로
  canView: boolean
}) {
  return (
    <ul className="divide-y rounded-md border text-sm">
      {warehouses.map((w) => {
        const body = (
          <>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {w.name} <span className="text-muted-foreground">({w.code})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {w.systemCode} ·{' '}
                {TEMP_ZONE.labels[w.tempZone as keyof typeof TEMP_ZONE.labels] ?? w.tempZone} ·
                로케이션 {w.locationCount}개
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {isSystemWarehouse(w) && <StatusBadge tone="info">기본</StatusBadge>}
              <StatusBadge tone="neutral">
                {WAREHOUSE_TYPE.labels[w.type as keyof typeof WAREHOUSE_TYPE.labels] ?? w.type}
              </StatusBadge>
              {!w.isActive && <StatusBadge tone="danger">사용 중지</StatusBadge>}
            </div>
          </>
        )
        const rowClass = 'flex items-center justify-between gap-3 px-3 py-2'
        return (
          <li key={w.id}>
            {canView ? (
              <Link
                href={`/admin/master/warehouses/${w.id}`}
                className={`${rowClass} hover:bg-muted/50`}
              >
                {body}
              </Link>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// 창고 섹션 제목 오른쪽 [창고 추가] (이 센터를 미리 고른 등록 화면으로)
export function AddWarehouseButton({ centerId }: { centerId: string }) {
  return (
    <Button asChild type="button" variant="outline" size="sm">
      <Link href={`/admin/master/warehouses/new?centerId=${centerId}`}>
        <PlusIcon />
        창고 추가
      </Link>
    </Button>
  )
}
