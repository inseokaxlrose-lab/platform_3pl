import type { UploadTemplate } from '@/lib/excel/upload'

// 로케이션 엑셀 일괄 업로드 양식 (docs/decisions/0071) — 화면·서버 공용
// 한 줄 = 로케이션 하나. [일괄 생성](구역 × 열 × 단 범위)으로 만들기 어려운 창고용
// 코드 규칙은 한 칸 추가·일괄 생성과 같다 (영문 대문자·숫자·하이픈)

// 구역: 영문 1~3자, 열·단: 숫자 1~3자리 (비워도 된다)
export const UPLOAD_ZONE_PATTERN = /^[A-Z]{1,3}$/
export const UPLOAD_NUMBER_PATTERN = /^\d{1,3}$/

export const locationUploadTemplate: UploadTemplate = {
  name: '로케이션업로드',
  guide: [
    '한 줄이 로케이션 하나입니다. 보관 창고(입고대기 창고 제외)에만 만들 수 있습니다.',
    '로케이션 코드는 영문·숫자·하이픈 1~30자입니다 (소문자는 대문자로 저장). 명칭을 비우면 코드와 같게 저장합니다.',
    '이미 있는 로케이션 코드는 건너뜁니다 (같은 파일을 다시 올려도 안전).',
    '오류가 하나라도 있으면 파일 전체가 등록되지 않습니다. 미리보기에서 오류 사유를 보고 고쳐 다시 올려 주세요.',
  ],
  columns: [
    { key: 'centerCode', header: '센터코드', required: true, example: 'ICN' },
    { key: 'warehouseCode', header: '창고코드', required: true, example: 'GEN01' },
    {
      key: 'code',
      header: '로케이션코드',
      required: true,
      example: 'F1-07-3',
      note: '영문·숫자·하이픈 1~30자',
    },
    {
      key: 'name',
      header: '명칭',
      example: '냉동실 입구 옆',
      note: '한글 가능, 100자 이하 (비우면 코드와 같게)',
    },
    { key: 'zone', header: '구역', example: 'F', note: '영문 1~3자 (선택)' },
    { key: 'aisle', header: '열', example: '07', note: '숫자 1~3자리 (선택)' },
    { key: 'level', header: '단', example: '3', note: '숫자 1~3자리 (선택)' },
    { key: 'remark', header: '비고', note: '1000자 이하 (선택)' },
  ],
}
