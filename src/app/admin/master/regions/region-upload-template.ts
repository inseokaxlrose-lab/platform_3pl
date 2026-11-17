import type { UploadTemplate } from '@/lib/excel/upload'

// 권역설정 엑셀 업로드 양식 (화면·서버 공용)
export const REGION_UPLOAD_TEMPLATE: UploadTemplate = {
  name: '권역설정업로드',
  columns: [
    { key: 'zipCode', header: '우편번호', required: true, example: '16613', width: 10 },
    {
      key: 'tempZone',
      header: '온도대',
      example: '',
      note: '비우면 전체(ALL). 특정 온도대만 다른 센터가 맡을 때 상온·냉장·냉동·항온',
      width: 10,
    },
    {
      key: 'centerCode',
      header: '센터코드',
      example: 'ICN',
      note: '비우면 그 우편번호·온도대의 배정을 해제합니다',
      width: 12,
    },
  ],
  guide: [
    '우편번호(5자리)마다 배송센터를 정합니다. 한 번에 1,000행까지 올릴 수 있습니다 (더 많으면 화면의 지역 지정·붙여넣기를 쓰세요).',
    '같은 우편번호·온도대가 두 번 나오면 오류입니다. 올린 행만 바뀌고 나머지 배정은 그대로입니다.',
    '[엑셀 다운로드]로 받은 현재 배정표를 고쳐서 올려도 됩니다 (우편번호·온도대·센터코드 칸만 읽습니다).',
  ],
}
