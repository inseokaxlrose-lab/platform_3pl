import type { UploadTemplate } from '@/lib/excel/upload'

// ASN 엑셀 업로드 양식 (docs/decisions/0050) — 화면·서버 공용
// 한 행 = ASN 라인 하나. 묶음키가 같은 행들이 ASN 하나가 된다 (헤더 칸은 묶음 안에서 같아야 한다)
// 운영사 화면(대리 등록)은 화주사코드 칸이 있고, 화주 포털은 없다 (자기 화주사)

export function asnUploadTemplate(withShipper: boolean): UploadTemplate {
  return {
    name: 'ASN업로드',
    guide: [
      '한 줄이 입고 품목 하나입니다. 묶음키가 같은 줄들이 ASN 하나로 등록됩니다.',
      '같은 묶음 안에서는 화주사·센터·입고예정일·화주사문서번호가 같아야 합니다.',
      '오류가 하나라도 있으면 파일 전체가 등록되지 않습니다. 미리보기에서 오류 사유를 보고 고쳐 다시 올려 주세요.',
    ],
    columns: [
      {
        key: 'groupKey',
        header: '묶음키',
        required: true,
        example: '1',
        note: '같은 값의 줄이 ASN 하나 (숫자·글자 아무거나)',
      },
      ...(withShipper
        ? [
            {
              key: 'shipperCode',
              header: '화주사코드',
              required: true,
              example: 'GANA',
              note: '화주사의 코드',
            },
          ]
        : []),
      {
        key: 'centerCode',
        header: '센터코드',
        required: true,
        example: 'ICN',
        note: '입고 센터의 코드',
      },
      {
        key: 'expectedOn',
        header: '입고예정일',
        required: true,
        example: '2026-11-20',
        note: 'YYYY-MM-DD (엑셀 날짜 칸도 됩니다)',
      },
      {
        key: 'shipperRefNo',
        header: '화주사문서번호',
        example: 'PO-1001',
        note: '발주번호 등 (선택)',
      },
      { key: 'itemCode', header: '품목코드', required: true, example: 'WATER' },
      {
        key: 'unit',
        header: '단위',
        example: 'BOX',
        note: '비우면 기본단위. 품목의 기본단위 또는 환산단위 코드',
      },
      {
        key: 'qty',
        header: '수량',
        required: true,
        example: '3',
        note: '고른 단위의 수량 (0보다 큼)',
      },
      { key: 'lotNo', header: '로트번호', example: 'L240101', note: '로트 관리 품목만 (선택)' },
      {
        key: 'expiryOn',
        header: '유통기한',
        example: '2027-01-31',
        note: '유통기한 관리 품목만 (선택)',
      },
      {
        key: 'mfgOn',
        header: '제조일',
        example: '2026-01-31',
        note: '유통기한 관리 품목만 (선택). 제조일 입력 품목은 이 값으로 유통기한을 계산합니다',
      },
      { key: 'remark', header: '비고', note: '줄 비고 (선택)' },
    ],
  }
}
