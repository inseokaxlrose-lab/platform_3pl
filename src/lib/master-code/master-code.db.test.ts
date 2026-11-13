import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { formatSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { prisma } from '@/lib/prisma'
import { resetDatabase } from '@/test/reset-database'
import {
  deleteExternalCodes,
  findByExternalCode,
  getExternalCodes,
  saveExternalCodes,
} from './external-codes'
import { nextSystemCode } from './system-code'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('시스템 코드', () => {
  it('종류별 접두어 + 0을 채운 번호, 부를 때마다 커진다', async () => {
    const first = await nextSystemCode('CENTER')
    const second = await nextSystemCode('CENTER')
    expect(first).toMatch(/^CT\d{6}$/)
    expect(Number(second.slice(2))).toBe(Number(first.slice(2)) + 1)
    expect(await nextSystemCode('ITEM')).toMatch(/^IT\d{8}$/)
  })

  it('동시에 여러 건을 받아도 겹치지 않는다', async () => {
    const codes = await Promise.all(Array.from({ length: 20 }, () => nextSystemCode('WAREHOUSE')))
    expect(new Set(codes).size).toBe(20)
  })

  it('트랜잭션 안에서도 받을 수 있다', async () => {
    const code = await prisma.$transaction((tx) => nextSystemCode('SHIPPER', tx))
    expect(code).toMatch(/^SH\d{6}$/)
  })

  it('번호 모양 만들기', () => {
    expect(formatSystemCode('CENTER', 1)).toBe('CT000001')
    expect(formatSystemCode('CUSTOMER', BigInt(1234))).toBe('CU00001234')
  })
})

describe('외부 코드 매핑', () => {
  it('채운 칸은 저장하고, 고치면 바뀌고, 비우면 지운다', async () => {
    await saveExternalCodes(prisma, 'CENTER', 'c1', { SAP: ' 1000 ', ERP: 'W-ICN' })
    expect(await getExternalCodes('CENTER', 'c1')).toEqual({ SAP: '1000', ERP: 'W-ICN' })

    await saveExternalCodes(prisma, 'CENTER', 'c1', { SAP: '1001', ERP: '' })
    expect(await getExternalCodes('CENTER', 'c1')).toEqual({ SAP: '1001', ERP: '' })
    expect(await prisma.externalCode.count()).toBe(1)
  })

  it('같은 연동 상대·같은 종류에서 다른 대상이 쓰는 코드는 거부한다 (종류가 다르면 허용)', async () => {
    await saveExternalCodes(prisma, 'CENTER', 'c1', { SAP: '1000' })

    await expect(saveExternalCodes(prisma, 'CENTER', 'c2', { SAP: '1000' })).rejects.toThrow(
      ActionError,
    )
    await expect(saveExternalCodes(prisma, 'CENTER', 'c2', { SAP: '1000' })).rejects.toThrow(
      /SAP 코드 '1000'/,
    )
    // 같은 대상이 같은 코드로 다시 저장하는 것은 괜찮다
    await saveExternalCodes(prisma, 'CENTER', 'c1', { SAP: '1000' })
    // 다른 연동 상대, 다른 종류는 같은 글자여도 괜찮다
    await saveExternalCodes(prisma, 'CENTER', 'c2', { ERP: '1000' })
    await saveExternalCodes(prisma, 'WAREHOUSE', 'w1', { SAP: '1000' })
    expect(await prisma.externalCode.count()).toBe(3)
  })

  it('DB 규칙으로도 중복을 막는다 (프로그램을 거치지 않아도)', async () => {
    await prisma.externalCode.create({
      data: { system: 'SAP', entityType: 'CENTER', entityId: 'c1', code: 'X' },
    })
    await expect(
      prisma.externalCode.create({
        data: { system: 'SAP', entityType: 'CENTER', entityId: 'c2', code: 'X' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      prisma.externalCode.create({
        data: { system: 'SAP', entityType: 'CENTER', entityId: 'c1', code: 'Y' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('외부 코드로 우리 대상을 찾고, 대상이 사라지면 매핑도 정리한다', async () => {
    await saveExternalCodes(prisma, 'CENTER', 'c1', { SAP: '1000', ERP: 'E1' })
    expect(await findByExternalCode('SAP', 'CENTER', ' 1000')).toBe('c1')
    expect(await findByExternalCode('SAP', 'CENTER', 'nope')).toBeNull()

    await deleteExternalCodes(prisma, 'CENTER', 'c1')
    expect(await getExternalCodes('CENTER', 'c1')).toEqual({ SAP: '', ERP: '' })
  })
})
