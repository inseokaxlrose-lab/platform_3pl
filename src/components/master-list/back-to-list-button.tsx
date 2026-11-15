'use client'

import { ListIcon } from 'lucide-react'
import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { listReturnKey } from './use-list-query'

const readReturnUrl = (listPath: string) => {
  try {
    return sessionStorage.getItem(listReturnKey(listPath))
  } catch {
    return null
  }
}

// 상세·수정 화면의 [목록] 버튼: 마지막으로 본 목록 주소(검색 조건·페이지·정렬 포함)로 돌아간다
// 목록을 거치지 않고 들어왔으면 목록 첫 화면으로
export function BackToListButton({
  listPath,
  label = '목록',
}: {
  listPath: string
  label?: string
}) {
  const href = useSyncExternalStore(
    () => () => {},
    () => readReturnUrl(listPath) ?? listPath,
    () => listPath,
  )
  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <ListIcon />
        {label}
      </Link>
    </Button>
  )
}
