// 기준정보 입력 화면 틀 (docs/ui-guidelines.md)
// MasterFormPage(섹션 목차·저장 막대) + FormGrid/Field(12칸) + EditableSubTable(1:N) + useMasterForm(값·검사·저장)
export { EditableSubTable, type SubTableCell, type SubTableColumn } from './editable-sub-table'
export { Field, FormGrid, type FieldProps, type FieldSpan } from './form-grid'
export { MasterFormPage, type MasterFormSection } from './master-form-page'
export { useDirtyGuard } from './use-dirty-guard'
export { useMasterForm, type FormErrors, type MasterFormState } from './use-master-form'
