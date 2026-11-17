'use client'

import { MapPinnedIcon, Trash2Icon, WarehouseIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { deleteCenterAction } from './actions'
import { CenterStatusDialog } from './center-status-dialog'

// 센터 수정 화면 헤더의 보조 버튼: [창고 보기] [로케이션 보기] [삭제] [상태 변경] (0073, 0074)
export function CenterHeaderActions({
  center,
  canViewWarehouses,
  canViewLocations,
  canChangeStatus,
  canDelete,
}: {
  center: { id: string; status: string; rowVersion: number }
  canViewWarehouses: boolean
  canViewLocations: boolean
  canChangeStatus: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  return (
    <>
      {canViewWarehouses && (
        <Button asChild type="button" variant="outline">
          <Link href={`/admin/master/warehouses?center=${center.id}`}>
            <WarehouseIcon />
            창고 보기
          </Link>
        </Button>
      )}
      {canViewLocations && (
        <Button asChild type="button" variant="outline">
          <Link href={`/admin/master/locations?center=${center.id}`}>
            <MapPinnedIcon />
            로케이션 보기
          </Link>
        </Button>
      )}
      {canDelete && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline">
              <Trash2Icon />
              삭제
            </Button>
          }
          title="이 센터를 삭제할까요?"
          description="한 번도 쓰이지 않은 센터만 삭제할 수 있습니다. 창고·재고·입고·이용 화주사가 있으면 '폐쇄'로 바꿔 주세요."
          confirmLabel="삭제"
          destructive
          onConfirm={async () => {
            unwrap(await deleteCenterAction({ id: center.id }))
            router.push('/admin/master/centers')
          }}
        />
      )}
      {canChangeStatus && <CenterStatusDialog center={center} onChanged={() => router.refresh()} />}
    </>
  )
}
