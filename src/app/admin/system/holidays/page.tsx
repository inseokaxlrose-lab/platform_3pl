import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { holidayApiConfigured } from '@/lib/holidays/holiday-api'
import { ensureNationalHolidays, holidayYearStatus } from '@/lib/holidays/holiday-sync'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { scopeFilter } from '@/lib/scope/data-scope'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { kstToday } from '@/lib/stock/expiry'
import { HolidaysList } from './holidays-list'

export const metadata: Metadata = { title: '휴무관리' }

// 휴무관리 (0096): 국가 공휴일(API 자동) + 운영사·센터 휴무·특근
export default async function HolidaysPage() {
  if (!(await hasPermission('system.holidays.read'))) return <AccessDenied />
  const thisYear = Number(kstToday().slice(0, 4))
  const apiReady = holidayApiConfigured()
  // 화면을 열 때 올해·내년 공휴일이 아직 없으면 API로 가져온다 (실패해도 화면은 그린다)
  if (apiReady) {
    try {
      await ensureNationalHolidays([thisYear, thisYear + 1])
    } catch (error) {
      console.error('[휴무관리] 국가 공휴일 자동 가져오기 실패', error)
    }
  }
  const scope = await getCurrentScope()
  const [centers, years, create, update, remove] = await Promise.all([
    scope.operatorId === undefined
      ? []
      : prisma.center.findMany({
          where: scopeFilter(scope, { center: 'id' }),
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          select: { id: true, code: true, name: true },
        }),
    holidayYearStatus([thisYear - 1, thisYear, thisYear + 1]),
    hasPermission('system.holidays.create'),
    hasPermission('system.holidays.update'),
    hasPermission('system.holidays.delete'),
  ])
  return (
    <HolidaysList
      thisYear={thisYear}
      apiReady={apiReady}
      years={years}
      centers={textIds(centers)}
      // 운영사 전체 휴일은 운영사 전체 범위만 고친다 (센터 직원은 센터를 골라야 한다)
      canOperatorWide={scope.kind === 'ALL'}
      can={{ create, update, delete: remove }}
    />
  )
}
