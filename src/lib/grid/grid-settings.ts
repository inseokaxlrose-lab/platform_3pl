import 'server-only'
import { parseGridSettings, type GridSettings } from '@/components/data-grid/settings'
import { prisma } from '@/lib/prisma'

// 그리드 이름(DataGrid id) 규칙: 영문 소문자·숫자·하이픈 (예: system-users)
export const GRID_ID_PATTERN = /^[a-z0-9-]{1,60}$/

// 한 사용자의 모든 그리드 설정 (레이아웃에서 한 번 읽어 화면 전체에 나눠준다)
// 모양이 깨진 설정은 빠진다 → 그 그리드는 기본 모습
export async function loadUserGridSettings(userId: string): Promise<Record<string, GridSettings>> {
  const rows = await prisma.userGridSetting.findMany({
    where: { userId },
    select: { gridId: true, settings: true },
  })
  return Object.fromEntries(rows.map((row) => [row.gridId, parseGridSettings(row.settings)]))
}
