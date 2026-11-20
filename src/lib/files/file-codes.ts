import { codeSet } from '@/config/operator-codes'

// 첨부파일 값 목록·한도 (docs/decisions/0091) — 화면·서버 공용
// 대상 종류·용도는 상수 + DB 검사 조건 (tb_file_link), db-value-sets 테스트가 같은지 확인한다

// 여러 장 붙는 대상: 품목 이미지 · 검수 사진 (운영사 로고·직인은 운영사 칸이 파일을 바로 가리킨다)
export const FILE_ENTITY = codeSet({ ITEM: '품목', INSPECTION: '검수' })
export const FILE_PURPOSE = codeSet({ IMAGE: '이미지', PHOTO: '사진' })
export type FileEntity = (typeof FILE_ENTITY.values)[number]

// 대상별 용도 (대상 하나에 용도 하나)
export const PURPOSE_OF: Record<FileEntity, (typeof FILE_PURPOSE.values)[number]> = {
  ITEM: 'IMAGE',
  INSPECTION: 'PHOTO',
}

// 한 파일 최대 10MB, 대상 하나에 최대 20장
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_ENTITY = 20

// 받는 형식: 이미지만 (PNG·JPEG·WEBP·GIF) — 확장자가 아니라 파일 앞부분(매직 바이트)으로도 확인한다
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')

// 파일 주소 (로그인·데이터 범위를 확인한 뒤 내려 준다: src/app/api/files/[id]/route.ts)
export const fileUrl = (fileId: string | bigint) => `/api/files/${fileId}`

// 사람이 읽는 크기 (1.2 MB)
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
