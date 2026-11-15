'use client'

import { useState } from 'react'
import { ExcelUploadDialog } from '@/components/excel-upload'
import { buildPreview, requiredIssues, type UploadTemplate } from '@/lib/excel/upload'

// 엑셀 업로드 공통 대화상자 예시 (서버 대신 화면 안의 가짜 검증: 필수 칸 + 수량은 숫자)
const TEMPLATE: UploadTemplate = {
  name: '예시업로드',
  guide: ['예시 양식입니다. 첫 줄 제목은 바꾸지 마세요.'],
  columns: [
    { key: 'code', header: '품목코드', required: true, example: 'WATER' },
    { key: 'qty', header: '수량', required: true, example: '24', note: '숫자' },
    { key: 'memo', header: '비고' },
  ],
}

export function ExcelUploadShowcase() {
  const [done, setDone] = useState(0)
  return (
    <div className="flex items-center gap-3">
      <ExcelUploadDialog
        template={TEMPLATE}
        title="예시 엑셀 업로드"
        validate={async (rows) => {
          const issues = [
            ...requiredIssues(TEMPLATE, rows),
            ...rows
              .filter((r) => r.values.qty && !/^\d+(\.\d+)?$/.test(r.values.qty))
              .map((r) => ({ rowNo: r.rowNo, column: 'qty', message: '숫자로 넣어 주세요.' })),
          ]
          return { ok: true, data: buildPreview(TEMPLATE, rows, issues) }
        }}
        commit={async (rows) => ({
          ok: true,
          data: { message: `${rows.length}행을 등록했습니다.` },
        })}
        onDone={() => setDone((n) => n + 1)}
      />
      <span className="text-sm text-muted-foreground">등록 완료 {done}번</span>
    </div>
  )
}
