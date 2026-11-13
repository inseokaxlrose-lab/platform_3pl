'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { navigation, type NavAreaKey } from '@/config/navigation'
import { findBreadcrumb } from './find-breadcrumb'

// 상단 바 경로 표시: 운영사 화면 › 입고 › ASN 조회
export function AppBreadcrumb({ area }: { area: NavAreaKey }) {
  const pathname = usePathname()
  const entries = findBreadcrumb(pathname, navigation[area])

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1
          return (
            <Fragment key={`${entry.label}-${index}`}>
              {/* 좁은 화면에서는 마지막(현재 화면)만 보여준다 */}
              <BreadcrumbItem className={isLast ? undefined : 'hidden md:inline-flex'}>
                {entry.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={entry.href}>{entry.label}</Link>
                  </BreadcrumbLink>
                ) : isLast ? (
                  <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                ) : (
                  <span>{entry.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className="hidden md:block" />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
