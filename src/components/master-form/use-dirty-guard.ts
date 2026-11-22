'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isOtherMenu, setLeaveRequest, setPageDirty } from '@/lib/navigation/page-dirty'

// 저장하지 않은 변경이 있을 때 화면을 떠나지 못하게 한 번 묻는다
// - 새로고침·창 닫기·주소 직접 입력: 브라우저 기본 확인 창 (beforeunload — 문구는 브라우저가 정한다)
// - 화면 안의 링크(사이드바 메뉴 등): 링크 클릭을 가로채 우리 확인 창을 띄운다
//   App Router에는 "이동 직전" 알림이 없어서 문서 전체의 클릭을 먼저(capture) 받아 막는 방식
// - 브라우저 [뒤로] 버튼은 막지 못한다 (docs/ui-guidelines.md "남은 제약")
// - 작성 내용을 보관해 두었으면(0097) 다른 메뉴로 가는 링크는 묻지 않고 보낸다 → 돌아오면 이어서 쓴다
//   같은 메뉴 안의 이동(수정 → 목록 등)은 지금처럼 묻고, [나가기]면 보관한 것도 버린다
export function useDirtyGuard(
  dirty: boolean,
  draft?: {
    // 지금 작성 내용이 보관돼 있는지
    kept: () => boolean
    // [나가기]: 보관한 작성 내용을 버린다
    drop: () => void
  },
) {
  const router = useRouter()
  // 확인 창을 띄운 이동 대상 주소 (null = 창 닫힘)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const dirtyRef = useRef(dirty)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    dirtyRef.current = dirty
    // 메뉴 탭의 ● 표시 (0069)
    setPageDirty(dirty)
  }, [dirty])

  // 메뉴 탭 [×]로 이 화면을 닫을 때도 같은 확인 창을 쓰게 (0069). 화면을 떠나면 표시를 지운다
  useEffect(() => {
    setLeaveRequest((href) => setPendingHref(href))
    return () => {
      setLeaveRequest(null)
      setPageDirty(false)
    }
  }, [])

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      event.preventDefault()
    }
    function onClick(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return
      // 새 탭·새 창으로 여는 클릭은 이 화면을 떠나지 않는다
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin) return
      // 같은 화면 안의 이동(#목차 등)은 막지 않는다
      if (url.pathname === location.pathname && url.search === location.search) return
      // 다른 메뉴로 가는데 작성 내용을 보관해 두었으면 묻지 않는다 (메뉴 탭에 ● 가 남는다)
      if (draftRef.current?.kept() && isOtherMenu(location.pathname, url.pathname)) return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  return {
    pendingHref,
    // [나가기]: 변경을 버리고 이동
    leave() {
      if (!pendingHref) return
      dirtyRef.current = false
      draftRef.current?.drop()
      setPendingHref(null)
      router.push(pendingHref)
    },
    // [계속 작성]
    stay() {
      setPendingHref(null)
    },
  }
}
