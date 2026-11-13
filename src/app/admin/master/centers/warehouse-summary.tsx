import { FormSection, StatusBadge } from '@/components/common'
import type { CenterForEdit } from './queries'

const TYPE_LABELS = { GENERAL: '일반', INBOUND_STAGING: '입고대기' } as const

// 센터 수정 화면 오른쪽: 이 센터의 창고 (읽기 전용, 관리는 "창고" 메뉴에서)
export function WarehouseSummary({ warehouses }: { warehouses: CenterForEdit['warehouses'] }) {
  return (
    <FormSection
      title={`창고 (${warehouses.length})`}
      description="입고대기 창고는 센터 등록 때 자동으로 만들어집니다. 창고 추가·수정은 창고 메뉴에서 합니다."
    >
      <ul className="divide-y rounded-md border text-sm">
        {warehouses.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {w.name} <span className="text-muted-foreground">({w.code})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {w.systemCode} · 로케이션 {w.locationCount}개
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <StatusBadge tone={w.type === 'INBOUND_STAGING' ? 'info' : 'neutral'}>
                {TYPE_LABELS[w.type]}
              </StatusBadge>
              {!w.isActive && <StatusBadge tone="danger">사용 중지</StatusBadge>}
            </div>
          </li>
        ))}
      </ul>
    </FormSection>
  )
}
