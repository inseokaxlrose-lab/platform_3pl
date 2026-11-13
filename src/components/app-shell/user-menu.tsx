'use client'

import { ChevronDownIcon, LogOutIcon, UserIcon } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOutAction } from '@/lib/auth-actions'

const USER_TYPE_LABELS = { OPERATOR: '운영사', CENTER: '센터', SHIPPER: '화주사' } as const

type UserMenuProps = {
  user: { name: string; username: string; userType: keyof typeof USER_TYPE_LABELS }
}

// 상단 바 사용자 메뉴: 이름 · 아이디 · 로그아웃
export function UserMenu({ user }: UserMenuProps) {
  const [pending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          <UserIcon />
          <span className="max-w-32 truncate">{user.name}</span>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">
            {user.username} · {USER_TYPE_LABELS[user.userType]}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => startTransition(() => signOutAction())}>
          <LogOutIcon />
          {pending ? '로그아웃 중…' : '로그아웃'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
