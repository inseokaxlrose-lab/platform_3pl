'use client'

import { useRouter } from 'next/navigation'
import { ExcelUploadDialog } from '@/components/excel-upload'
import type { ActionResult } from '@/lib/actions/result'
import type { UploadPreview, UploadRow } from '@/lib/excel/upload'
import { asnUploadTemplate } from '@/lib/inbound/asn-upload-template'

// ASN 엑셀 업로드 버튼 (0050) — 등록 화면 머리글에 둔다. 등록이 끝나면 ASN 목록으로
export function AsnUploadButton({
  withShipper,
  listPath,
  validate,
  commit,
}: {
  // 운영사 화면: 화주사코드 칸 있음 / 화주 포털: 없음
  withShipper: boolean
  listPath: string
  validate: (rows: UploadRow[]) => Promise<ActionResult<UploadPreview>>
  commit: (rows: UploadRow[]) => Promise<ActionResult<{ message: string }>>
}) {
  const router = useRouter()
  return (
    <ExcelUploadDialog
      template={asnUploadTemplate(withShipper)}
      title="ASN 엑셀 업로드"
      description="묶음키가 같은 줄들이 ASN 하나가 됩니다. 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
      validate={validate}
      commit={commit}
      onDone={() => router.push(listPath)}
    />
  )
}
