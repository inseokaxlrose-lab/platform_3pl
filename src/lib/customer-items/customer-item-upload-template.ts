import type { UploadTemplate } from '@/lib/excel/upload'

// 거래처별 품목코드 엑셀 업로드 양식 (docs/decisions/0098) — 화면·서버 공용
// 한 줄 = 거래처 × 품목 하나. 거래처·품목은 화주사의 연동 조회 키(0084)로 찾는다
// 이미 있으면 넣은 칸만 고친다 (비운 칸은 그대로), 없으면 새로 만든다

export const customerItemUploadTemplate: UploadTemplate = {
  name: '거래처별품목코드업로드',
  guide: [
    '한 줄이 거래처 × 품목 하나입니다. 같은 거래처·같은 품목은 한 줄만 넣어 주세요.',
    '화주사의 연동 조회 키가 "사용자 정의 코드"면 거래처코드·품목코드 대신 거래처사용자정의코드·품목사용자정의코드로 찾습니다.',
    '이미 등록된 거래처 × 품목은 넣은 칸만 고치고 비운 칸은 그대로 둡니다. 없으면 새로 만듭니다.',
    '거래처는 매출처(또는 매출·매입)만 됩니다. 납품단위는 그 품목의 단위코드(EA·BOX 등)입니다.',
    '오류가 하나라도 있으면 파일 전체가 등록되지 않습니다. 미리보기에서 오류 사유를 보고 고쳐 다시 올려 주세요.',
  ],
  columns: [
    { key: 'shipperCode', header: '화주사코드', required: true, example: 'GANA', width: 12 },
    {
      key: 'customerCd',
      header: '거래처코드',
      example: 'EMART',
      note: '화주사 조회 키가 거래처코드(기본)면 필수',
      width: 14,
    },
    {
      key: 'customerCustCd',
      header: '거래처사용자정의코드',
      example: 'ERP-C001',
      note: '화주사 조회 키가 사용자 정의 코드면 필수',
      width: 14,
    },
    {
      key: 'itemCd',
      header: '품목코드',
      example: 'GNS000001',
      note: '화주사 조회 키가 품목코드(기본)면 필수',
      width: 14,
    },
    {
      key: 'itemCustCd',
      header: '품목사용자정의코드',
      example: 'ERP-I001',
      note: '화주사 조회 키가 사용자 정의 코드면 필수',
      width: 14,
    },
    {
      key: 'custItemCode',
      header: '거래처품목코드',
      required: true,
      example: '8801234500017',
      note: '거래처의 상품코드, 거래처 안에서 겹칠 수 없음',
      width: 16,
    },
    { key: 'custItemName', header: '거래처품목명', example: '가나 생수 2L', width: 20 },
    { key: 'custBarcode', header: '거래처바코드', example: '8801234500017', width: 16 },
    {
      key: 'deliveryUnit',
      header: '납품단위',
      example: 'BOX',
      note: '품목의 단위코드 (비우면 품목의 기본 주문단위)',
    },
    {
      key: 'minShelfDays',
      header: '최소잔여일수',
      example: '30',
      note: '0~9999, 거래처 값과 다를 때만',
    },
    {
      key: 'minShelfRatio',
      header: '최소잔여비율',
      example: '70',
      note: '0~100 (%), 거래처 값과 다를 때만',
    },
    {
      key: 'useYn',
      header: '사용여부',
      example: 'Y',
      note: 'Y 사용 / N 사용 중지 (새 줄은 비우면 Y)',
    },
    { key: 'remark', header: '비고', width: 20 },
  ],
}
