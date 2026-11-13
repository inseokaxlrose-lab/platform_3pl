'use client'

import { createContext, useContext, useMemo } from 'react'
import type { PermissionCode } from '@/config/permissions'

type PermissionContextValue = {
  codes: ReadonlySet<PermissionCode>
  can: (code: PermissionCode) => boolean
}

const PermissionContext = createContext<PermissionContextValue | null>(null)

// 서버(레이아웃)가 계산한 권한을 화면 전체에 나눠준다
// 화면에서 숨기는 것은 편의일 뿐, 서버에서도 같은 코드로 다시 검사한다 (CLAUDE.md 절대 규칙)
export function PermissionProvider({
  codes,
  children,
}: {
  codes: readonly PermissionCode[]
  children: React.ReactNode
}) {
  const value = useMemo<PermissionContextValue>(() => {
    const set = new Set(codes)
    return { codes: set, can: (code) => set.has(code) }
  }, [codes])
  return <PermissionContext value={value}>{children}</PermissionContext>
}

// 권한 확인: const { can } = usePermission(); can('inbound.asn.close')
export function usePermission() {
  const value = useContext(PermissionContext)
  if (!value) throw new Error('usePermission은 PermissionProvider 안에서만 쓸 수 있습니다.')
  return value
}
