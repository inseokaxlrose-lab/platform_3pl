import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { ASN_SCOPE } from '@/lib/inbound/asns'
import { ITEM_SCOPE } from '@/lib/items/item-list'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import {
  IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_ENTITY,
  PURPOSE_OF,
  type FileEntity,
} from './file-codes'
import { fileStorage } from './storage'

// 첨부파일 (docs/decisions/0091)
// - 올리기: 형식(매직 바이트)·크기 검사 → 저장소에 넣기 → 파일 줄. DB가 실패하면 저장소의 파일도 지운다
// - 대상(품목·검수)에 붙이기/떼기, 운영사 로고·직인 바꾸기
// - 읽기: 운영사가 같고 대상이 사용자 데이터 범위 안일 때만
// 권한 검사는 서버 액션에서, 데이터 범위는 여기서

// 파일 앞부분으로 형식 확인 (브라우저가 알려 준 형식은 믿지 않는다)
function sniffImage(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const at = (i: number) => bytes[i]
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'image/gif'
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

const storageKey = (operatorId: bigint) => {
  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${operatorId}/${now.getUTCFullYear()}/${month}/${randomUUID()}`
}

// 이미지 파일 하나 저장 → 파일 키 (운영사 출입증 안에서)
export async function saveImage(file: File): Promise<bigint> {
  const operatorId = requireOperatorId()
  if (file.size === 0) throw new ActionError('VALIDATION', '빈 파일입니다.')
  if (file.size > MAX_FILE_BYTES) {
    throw new ActionError('VALIDATION', `파일은 ${MAX_FILE_BYTES / 1024 / 1024}MB까지입니다.`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = sniffImage(bytes)
  if (!mimeType) throw new ActionError('VALIDATION', 'PNG·JPEG·WEBP·GIF 이미지만 올릴 수 있습니다.')
  const key = storageKey(operatorId)
  await fileStorage().put(key, bytes, mimeType)
  try {
    const saved = await prisma.file.create({
      data: {
        operatorId,
        storageKey: key,
        originalName: (file.name || 'image').slice(0, 255),
        mimeType,
        sizeBytes: BigInt(bytes.length),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        createdBy: currentActor(),
      },
      select: { id: true },
    })
    return saved.id
  } catch (error) {
    await fileStorage().remove(key)
    throw error
  }
}

// 파일 줄과 저장소의 파일을 함께 지운다 (연결 줄은 DB가 함께 지운다)
async function removeFiles(fileIds: bigint[]) {
  if (fileIds.length === 0) return
  const files = await prisma.file.findMany({
    where: { id: { in: fileIds } },
    select: { storageKey: true },
  })
  await prisma.file.deleteMany({ where: { id: { in: fileIds } } })
  for (const f of files) await fileStorage().remove(f.storageKey)
}

// 대상이 사용자 데이터 범위 안인지 (품목: 화주사·이용 센터 / 검수: ASN의 센터·화주사)
export async function isEntityInScope(scope: DataScope, entity: FileEntity, id: bigint) {
  if (entity === 'ITEM') {
    return (
      (await prisma.item.count({ where: { AND: [{ id }, scopeFilter(scope, ITEM_SCOPE)] } })) > 0
    )
  }
  const inspection = await prisma.inboundInspection.findUnique({
    where: { id },
    select: { asnId: true },
  })
  if (!inspection) return false
  return (
    (await prisma.asn.count({
      where: { AND: [{ id: inspection.asnId }, scopeFilter(scope, ASN_SCOPE)] },
    })) > 0
  )
}

async function assertEntity(scope: DataScope, entity: FileEntity, id: bigint) {
  if (!(await isEntityInScope(scope, entity, id))) {
    throw new ActionError('NOT_FOUND', '대상을 찾을 수 없습니다.')
  }
}

// 대상의 첨부 목록 (순서대로)
export async function listAttachments(scope: DataScope, entity: FileEntity, id: bigint) {
  await assertEntity(scope, entity, id)
  const links = await prisma.fileLink.findMany({
    where: { entityType: entity, entityId: id },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          createdBy: true,
        },
      },
    },
  })
  return links.map(({ file }) => ({
    id: file.id,
    name: file.originalName,
    mimeType: file.mimeType,
    size: Number(file.sizeBytes),
    createdAt: file.createdAt,
    createdBy: file.createdBy,
  }))
}

// 대상에 이미지 붙이기
export async function attachImage(scope: DataScope, entity: FileEntity, id: bigint, file: File) {
  await assertEntity(scope, entity, id)
  const count = await prisma.fileLink.count({ where: { entityType: entity, entityId: id } })
  if (count >= MAX_FILES_PER_ENTITY) {
    throw new ActionError('VALIDATION', `한 곳에 ${MAX_FILES_PER_ENTITY}장까지 붙일 수 있습니다.`)
  }
  const fileId = await saveImage(file)
  try {
    await prisma.fileLink.create({
      data: {
        operatorId: requireOperatorId(),
        fileId,
        entityType: entity,
        entityId: id,
        purpose: PURPOSE_OF[entity],
        sortOrder: count + 1,
        createdBy: currentActor(),
      },
    })
  } catch (error) {
    await removeFiles([fileId])
    throw error
  }
  return { id: fileId }
}

// 대상에서 떼기 (파일도 지운다)
export async function detachFile(scope: DataScope, entity: FileEntity, id: bigint, fileId: bigint) {
  await assertEntity(scope, entity, id)
  const link = await prisma.fileLink.findFirst({
    where: { fileId, entityType: entity, entityId: id },
    select: { id: true },
  })
  if (!link) throw new ActionError('NOT_FOUND', '파일을 찾을 수 없습니다.')
  await removeFiles([fileId])
}

// 대상이 지워질 때 그 첨부를 모두 지운다 (검수 기록 삭제 등)
export async function removeAttachmentsOf(entity: FileEntity, ids: bigint[]) {
  if (ids.length === 0) return
  const links = await prisma.fileLink.findMany({
    where: { entityType: entity, entityId: { in: ids } },
    select: { fileId: true },
  })
  await removeFiles(links.map((l) => l.fileId))
}

// 운영사 로고·직인 바꾸기 (file이 null이면 지우기) — 지금 운영사의 것만
export async function setOperatorImage(kind: 'logo' | 'stamp', file: File | null) {
  const operatorId = requireOperatorId()
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    select: { logoFileId: true, stampFileId: true },
  })
  const previous = kind === 'logo' ? operator.logoFileId : operator.stampFileId
  const fileId = file ? await saveImage(file) : null
  await prisma.operator.update({
    where: { id: operatorId },
    data: kind === 'logo' ? { logoFileId: fileId } : { stampFileId: fileId },
  })
  if (previous) await removeFiles([previous])
  return { fileId }
}

// 읽기: 같은 운영사 + (연결된 대상이면) 그 대상이 범위 안 + (연결이 없으면 운영사 로고·직인만)
export async function readFileFor(scope: DataScope, fileId: bigint) {
  if (scope.kind === 'NONE') return null
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      operatorId: true,
      storageKey: true,
      mimeType: true,
      originalName: true,
      link: { select: { entityType: true, entityId: true } },
      operatorLogos: { select: { id: true } },
      operatorStamps: { select: { id: true } },
    },
  })
  if (!file || file.operatorId !== scope.operatorId) return null
  if (file.link) {
    if (!(await isEntityInScope(scope, file.link.entityType as FileEntity, file.link.entityId))) {
      return null
    }
  } else if (file.operatorLogos.length === 0 && file.operatorStamps.length === 0) {
    return null
  }
  const bytes = await fileStorage().get(file.storageKey)
  if (!bytes) return null
  return { bytes, mimeType: file.mimeType, name: file.originalName }
}
