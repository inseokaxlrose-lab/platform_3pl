import 'server-only'
import { DEFAULT_CODE_GROUPS } from '@/config/defaults/codes'
import { toYn } from '@/lib/yn'
import { DEFAULT_GROUPS } from '@/config/defaults/roles'
import type { Db } from '@/lib/prisma'

// 운영사 기본값 넣기 (docs/decisions/0039 3c)
// 새 운영사에 기본 공통코드·권한그룹을 복사한다. 단위는 복사하지 않는다 (시스템 기본 단위는 모든 운영사가 함께 보는 한 벌, 0078). 플랫폼의 운영사 등록과 개발 시드가 같이 쓴다
// - "없으면 만들기": 여러 번 불러도 안전하고, 운영사가 화면에서 고친 이름·순서·사용 여부를 되돌리지 않는다
// - 운영사 키는 직접 받는다 (플랫폼·시드는 운영사 출입증 밖에서 부른다)
// - 같은 트랜잭션(db)에서 부르면 운영사 등록과 함께 만들어지거나 함께 취소된다

type ProvisionOptions = {
  // true: 기본 권한그룹의 권한 목록을 정의와 똑같이 다시 맞춘다 (개발 시드 — 새 메뉴를 추가했을 때)
  // false: 새로 만든 그룹에만 권한을 채운다 (운영사가 고친 권한을 지킨다)
  syncGroupPermissions?: boolean
}

// 공통코드: 시스템 그룹 (이미 있으면 시스템 표시만 맞춘다)
async function provisionCodes(db: Db, operatorId: bigint) {
  for (const { items, faultParty = false, ...group } of DEFAULT_CODE_GROUPS) {
    const saved = await db.codeGroup.upsert({
      where: { operatorId_code: { operatorId, code: group.code } },
      create: { ...group, operatorId, isSystem: 'Y', faultPartyYn: toYn(faultParty) },
      update: { isSystem: 'Y' },
    })
    for (const [index, { faultParty: party, ...item }] of items.entries()) {
      await db.codeItem.upsert({
        where: { groupId_code: { groupId: saved.id, code: item.code } },
        create: {
          ...item,
          faultParty: party ?? null,
          operatorId,
          groupId: saved.id,
          sortOrder: (index + 1) * 10,
        },
        update: {},
      })
    }
  }
}

async function provisionGroups(db: Db, operatorId: bigint, sync: boolean) {
  const ids = new Map<string, bigint>()
  for (const definition of DEFAULT_GROUPS) {
    const where = { operatorId_name: { operatorId, name: definition.name } }
    const existing = await db.permissionGroup.findUnique({ where, select: { id: true } })
    const group = existing
      ? await db.permissionGroup.update({
          where,
          data: { area: definition.area, description: definition.description },
          select: { id: true },
        })
      : await db.permissionGroup.create({
          data: {
            operatorId,
            name: definition.name,
            area: definition.area,
            description: definition.description,
          },
          select: { id: true },
        })
    if (!existing || sync) {
      const codes = [...new Set(definition.codes)]
      await db.permissionGroupPermission.deleteMany({ where: { groupId: group.id } })
      await db.permissionGroupPermission.createMany({
        data: codes.map((permissionCode) => ({ groupId: group.id, permissionCode })),
      })
    }
    ids.set(definition.name, group.id)
  }
  return ids
}

// 한 운영사에 기본값을 모두 넣는다. 돌려주는 값: 기본 권한그룹 이름 → 키
export async function provisionOperator(
  db: Db,
  operatorId: bigint,
  { syncGroupPermissions = false }: ProvisionOptions = {},
) {
  await provisionCodes(db, operatorId)
  return provisionGroups(db, operatorId, syncGroupPermissions)
}
