import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// 파일 저장소 (docs/decisions/0091) — 첨부파일의 실제 바이트를 두는 곳
// 프로그램은 이 세 동작만 쓴다. 저장소를 바꿀 때(운영 S3·Blob 등, 배포 결정 0067) 구현 하나만 더하면 된다
export interface FileStorage {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  remove(key: string): Promise<void>
}

// 저장 키 검사: {운영사}/{연}/{월}/{무작위} 모양만 (폴더 밖으로 나가는 '..' 등 차단)
const KEY_PATTERN = /^\d{1,19}\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/
function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error(`잘못된 파일 저장 키입니다: ${key}`)
}

// 로컬 폴더 저장소 (개발·단일 서버용). 기본 폴더: 프로젝트의 storage/ (git 제외)
export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private pathOf(key: string) {
    assertKey(key)
    return path.join(this.root, ...key.split('/'))
  }

  async put(key: string, bytes: Uint8Array) {
    const file = this.pathOf(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.pathOf(key)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async remove(key: string) {
    await rm(this.pathOf(key), { force: true })
  }
}

// 지금 쓰는 저장소 (.env FILE_STORAGE — 지금은 local만, FILE_STORAGE_DIR로 폴더를 바꿀 수 있다)
let storage: FileStorage | null = null
export function fileStorage(): FileStorage {
  if (storage) return storage
  const kind = process.env.FILE_STORAGE ?? 'local'
  if (kind !== 'local') {
    throw new Error(`아직 연결하지 않은 파일 저장소입니다: ${kind} (0091 — 배포 결정 때 연결)`)
  }
  storage = new LocalFileStorage(
    process.env.FILE_STORAGE_DIR ?? path.join(process.cwd(), 'storage'),
  )
  return storage
}

// 테스트에서 임시 폴더로 바꿀 때
export function useFileStorage(next: FileStorage | null) {
  storage = next
}
