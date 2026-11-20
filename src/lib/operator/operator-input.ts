import { isYes } from '@/lib/yn'
import type { OperatorInput } from './operator-schema'

// 저장한 운영사 값 → 화면 입력값 (빈 칸 null → 빈 글자, 날짜 → 'YYYY-MM-DD', 대표 'Y' → true)
// 서버(화면 불러오기)와 브라우저(저장 후 다시 맞추기)가 같이 쓴다. 번호는 숫자 그대로 (입력 부품이 하이픈을 붙여 보여준다)
type OperatorValues = {
  name: string
  nameEn: string | null
  shortName: string | null
  type: string
  businessNumber: string
  bizEntity: string
  corpRegNo: string | null
  subBizNo: string | null
  taxType: string
  ceoName: string | null
  businessType: string | null
  businessItem: string | null
  establishedOn: Date | null
  phone: string | null
  fax: string | null
  email: string | null
  zipCode: string | null
  address: string | null
  addressDetail: string | null
  addressJibun: string | null
  remark: string | null
  contacts: {
    duty: string
    name: string
    phone: string | null
    email: string | null
    isPrimary: string | boolean
    deptName: string | null
    positionName: string | null
    notifyYn?: string
    notify?: boolean
  }[]
}

const text = (value: string | null | undefined) => value ?? ''

export function toOperatorInput(row: OperatorValues): OperatorInput {
  return {
    name: row.name,
    nameEn: text(row.nameEn),
    shortName: text(row.shortName),
    type: row.type,
    businessNumber: row.businessNumber,
    bizEntity: row.bizEntity,
    corpRegNo: text(row.corpRegNo),
    subBizNo: text(row.subBizNo),
    taxType: row.taxType,
    ceoName: text(row.ceoName),
    businessType: text(row.businessType),
    businessItem: text(row.businessItem),
    establishedOn: row.establishedOn ? row.establishedOn.toISOString().slice(0, 10) : '',
    phone: text(row.phone),
    fax: text(row.fax),
    email: text(row.email),
    zipCode: text(row.zipCode),
    address: text(row.address),
    addressDetail: text(row.addressDetail),
    addressJibun: text(row.addressJibun),
    remark: text(row.remark),
    contacts: row.contacts.map((c) => ({
      duty: c.duty,
      name: c.name,
      phone: text(c.phone),
      email: text(c.email),
      isPrimary: typeof c.isPrimary === 'boolean' ? c.isPrimary : isYes(c.isPrimary),
      deptName: text(c.deptName),
      positionName: text(c.positionName),
      notify: c.notify ?? isYes(c.notifyYn ?? 'Y'),
    })),
  }
}
