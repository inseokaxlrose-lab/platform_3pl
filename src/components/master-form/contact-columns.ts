import type { SubTableColumn } from './editable-sub-table'

// 담당자 표 공통 칸: 부서·직책·알림 수신 (운영사·센터·화주사·거래처 담당자, 0084 ④-3)
// 각 화면의 담당자 EditableSubTable columns에서 이메일 칸 뒤에 펼쳐 넣는다
type ContactExtra = { deptName?: string | null; positionName?: string | null; notify?: boolean }

export function contactExtraColumns<TRow extends ContactExtra>(): SubTableColumn<TRow>[] {
  return [
    { key: 'deptName' as keyof TRow & string, label: '부서', width: '7rem' },
    { key: 'positionName' as keyof TRow & string, label: '직책', width: '6rem' },
    {
      key: 'notify' as keyof TRow & string,
      label: '알림',
      width: '4.5rem',
      input: 'checkbox',
      checkLabel: '받음',
    },
  ]
}
