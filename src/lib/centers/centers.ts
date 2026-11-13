import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { saveExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma } from '@/lib/prisma'
import { ensureCenterDefaults } from './center-defaults'
import type { CenterData } from './center-schema'

// 센터 저장 (docs/decisions/0026). 권한·데이터 범위 검사는 서버 액션에서 한다

// 사용자 코드 검사: 시스템 코드 모양 금지(자기 것 제외), 다른 센터와 중복 금지
async function assertUserCode(code: string, ownSystemCode: string, exceptId?: string) {
  if (code !== ownSystemCode && looksLikeSystemCode('CENTER', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 센터 코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await prisma.center.findUnique({ where: { code }, select: { id: true } })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이미 사용 중인 센터 코드입니다: ${code}`)
  }
}

// DB 칸으로 옮길 값: 이름으로 골라 담는다 (사용자 코드·외부 코드는 따로 처리)
function centerFields(data: CenterData) {
  return {
    name: data.name,
    phone: data.phone,
    fax: data.fax,
    managerName: data.managerName,
    managerPhone: data.managerPhone,
    zipCode: data.zipCode,
    address: data.address,
    addressDetail: data.addressDetail,
  }
}

// 등록: 시스템 코드 발급 → 센터 → 입고대기 창고·기본 로케이션 → 외부 코드 (한 트랜잭션)
export async function createCenter(data: CenterData) {
  return prisma.$transaction(async (tx) => {
    const systemCode = await nextSystemCode('CENTER', tx)
    const code = data.code || systemCode
    await assertUserCode(code, systemCode)
    const center = await tx.center.create({
      data: { systemCode, code, ...centerFields(data) },
      select: { id: true, systemCode: true, code: true },
    })
    await ensureCenterDefaults(tx, center.id)
    await saveExternalCodes(tx, 'CENTER', center.id, data.externalCodes)
    return center
  })
}

// 수정: 시스템 코드는 바뀌지 않는다. 사용자 코드를 비우면 시스템 코드로
export async function updateCenter(id: string, data: CenterData) {
  const current = await prisma.center.findUnique({ where: { id }, select: { systemCode: true } })
  if (!current) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
  const code = data.code || current.systemCode
  await assertUserCode(code, current.systemCode, id)
  return prisma.$transaction(async (tx) => {
    await tx.center.update({ where: { id }, data: { code, ...centerFields(data) } })
    await saveExternalCodes(tx, 'CENTER', id, data.externalCodes)
    return { id, code }
  })
}
