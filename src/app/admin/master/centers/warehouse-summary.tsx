import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { FormSection, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { STORAGE_CONDITION_LABELS, WAREHOUSE_TYPE_LABELS } from '@/lib/warehouses/warehouse-labels'
import type { CenterForEdit } from './queries'

// 센터 수정 화면 오른쪽: 이 센터의 창고 (창고 메뉴와 연결)
export function WarehouseSummary({
  centerId,
  warehouses,
  canView,
  canAdd,
}: {
  centerId: string
  warehouses: CenterForEdit['warehouses']
  // 창고 조회 권한: 줄을 누르면 창고 수정으로
  canView: boolean
  // 창고 등록 권한: [창고 추가] (이 센터를 미리 고른 등록 화면)
  canAdd: boolean
}) {
  return (
    <FormSection
      title={`창고 (${warehouses.length})`}
      description="입고대기 창고는 센터 등록 때 자동으로 만들어집니다."
      action={
        canAdd && (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/admin/master/warehouses/new?centerId=${centerId}`}>
              <PlusIcon />
              창고 추가
            </Link>
          </Button>
        )
      }
    >
      <ul className="divide-y rounded-md border text-sm">
        {warehouses.map((w) => {
          const body = (
            <>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {w.name} <span className="text-muted-foreground">({w.code})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {w.systemCode} · {STORAGE_CONDITION_LABELS[w.storageCondition]} · 로케이션{' '}
                  {w.locationCount}개
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <StatusBadge tone={w.type === 'INBOUND_STAGING' ? 'info' : 'neutral'}>
                  {WAREHOUSE_TYPE_LABELS[w.type]}
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
    </FormSection>
  )
}
