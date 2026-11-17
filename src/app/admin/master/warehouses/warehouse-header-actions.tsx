'use client'

import { MapPinnedIcon, PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { deleteWarehousesAction, setWarehousesActiveAction } from './actions'

// 창고 수정 화면 헤더의 보조 버튼: [로케이션 보기] [삭제] [사용 중지 / 다시 사용] (0074)
// 시스템 기본 창고는 삭제·사용 중지 버튼이 없다
export function WarehouseHeaderActions({
  warehouse,
  canViewLocations,
  canChangeStatus,
  canDelete,
}: {
  warehouse: { id: string; isActive: boolean; isSystem: boolean }
  canViewLocations: boolean
  canChangeStatus: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const { id, isActive, isSystem } = warehouse
  return (
    <>
      {canViewLocations && (
        <Button asChild type="button" variant="outline">
          <Link href={`/admin/master/locations?warehouse=${id}`}>
            <MapPinnedIcon />
            로케이션 보기
          </Link>
        </Button>
      )}
      {canDelete && !isSystem && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline">
              <Trash2Icon />
              삭제
            </Button>
          }
          title="이 창고를 삭제할까요?"
          description="로케이션·재고 기록이 하나도 없는 창고만 삭제할 수 있습니다. 쓰인 창고는 '사용 중지'해 주세요. 목록의 '삭제됨'에서 되살릴 수 있습니다."
          confirmLabel="삭제"
          destructive
          onConfirm={async () => {
            unwrap(await deleteWarehousesAction({ ids: [id] }))
            router.push('/admin/master/warehouses')
          }}
        />
      )}
      {canChangeStatus && !isSystem && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant={isActive ? 'outline' : 'default'}>
              {isActive ? <PowerIcon /> : <PlayIcon />}
              {isActive ? '사용 중지' : '다시 사용'}
            </Button>
          }
          title={isActive ? '이 창고를 사용 중지할까요?' : '이 창고를 다시 사용할까요?'}
          description={
            isActive
              ? '재고가 남아 있으면 사용 중지할 수 없습니다. 사용 중지하면 이 창고의 로케이션은 입고·출고 대상에서 빠집니다.'
              : '이 창고를 다시 입고·출고에 쓸 수 있게 됩니다.'
          }
          confirmLabel={isActive ? '사용 중지' : '다시 사용'}
          destructive={isActive}
          onConfirm={async () => {
            unwrap(await setWarehousesActiveAction({ ids: [id], isActive: !isActive }))
            router.refresh()
          }}
        />
      )}
    </>
  )
}
