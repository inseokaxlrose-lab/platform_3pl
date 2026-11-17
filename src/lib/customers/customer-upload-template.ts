import type { UploadTemplate } from '@/lib/excel/upload'

// 거래처 엑셀 업로드 양식 (docs/decisions/0082 ③) — 화면·서버 공용
// 한 줄 = 납품처 하나. 같은 화주사코드 + 거래처코드의 줄들이 거래처 하나 (거래처 칸은 반복, 다르면 오류)
// 비운 칸은 "안 보냄" — 이미 있는 거래처는 그 칸을 그대로 둔다 (API upsert와 같은 규칙)

export const customerUploadTemplate: UploadTemplate = {
  name: '거래처업로드',
  guide: [
    '한 줄이 납품처 하나입니다. 화주사코드와 거래처코드가 같은 줄들이 거래처 하나로 등록됩니다 (거래처 칸은 줄마다 같게).',
    '납품처코드를 비우면 거래처만 등록·수정합니다. 새 거래처에 납품처가 없으면 거래처 주소로 기본 납품처를 만듭니다.',
    '이미 있는 거래처는 비운 칸을 그대로 두고, 넣은 칸만 고칩니다. 이미 있는 납품처도 같습니다 (빠진 납품처는 지우지 않음).',
    '배송센터코드를 비우면 주소(권역설정)로 정합니다. 정하지 못한 납품처는 오류가 아니라 "확인 필요"로 저장됩니다.',
    '오류가 하나라도 있으면 파일 전체가 등록되지 않습니다. 미리보기에서 오류 사유를 보고 고쳐 다시 올려 주세요.',
  ],
  columns: [
    { key: 'shipperCode', header: '화주사코드', required: true, example: 'GANA', width: 12 },
    {
      key: 'partnerCd',
      header: '거래처코드',
      required: true,
      example: 'P10023',
      note: '영문·숫자·-·_ 30자, 등록 후 바꿀 수 없음',
      width: 14,
    },
    {
      key: 'partnerNm',
      header: '거래처명',
      example: '행복마트 강남점',
      note: '새 거래처는 필수',
      width: 20,
    },
    { key: 'shortNm', header: '약칭', example: '행복강남' },
    {
      key: 'partnerType',
      header: '거래처유형',
      example: 'STORE',
      note: '공통코드 PARTNER_TYPE의 코드',
    },
    { key: 'partnerGroup', header: '거래처그룹', example: '수도권 매장' },
    { key: 'bizRegNo', header: '사업자등록번호', example: '120-81-23456' },
    { key: 'ceoNm', header: '대표자' },
    { key: 'telNo', header: '대표전화', example: '02-555-1234' },
    { key: 'faxNo', header: '팩스' },
    { key: 'email', header: '이메일' },
    { key: 'zipCd', header: '우편번호', example: '06236' },
    { key: 'addr1', header: '주소', example: '서울 강남구 테헤란로 152', width: 30 },
    { key: 'addr2', header: '상세주소', example: '1층' },
    { key: 'minShelfDays', header: '최소잔여유통기한(일)', example: '120', note: '숫자' },
    {
      key: 'status',
      header: '거래상태',
      example: '거래중',
      note: '거래중 / 거래중지 (비우면 그대로·새 거래처는 거래중)',
    },
    {
      key: 'shipToCd',
      header: '납품처코드',
      example: 'P10023-01',
      note: '비우면 거래처만',
      width: 14,
    },
    {
      key: 'shipToNm',
      header: '납품처명',
      example: '강남점 후문',
      note: '새 납품처는 필수',
      width: 18,
    },
    { key: 'shipToDefault', header: '기본납품처', example: 'Y', note: 'Y / N (거래처당 1곳)' },
    { key: 'shipToZipCd', header: '납품처우편번호', example: '06236' },
    { key: 'shipToAddr1', header: '납품처주소', example: '서울 강남구 테헤란로 152', width: 30 },
    { key: 'shipToAddr2', header: '납품처상세주소', example: '후문' },
    { key: 'receiverNm', header: '수령담당자', example: '김납품' },
    { key: 'receiverTelNo', header: '수령연락처', example: '010-1234-5678' },
    { key: 'deliveryMemo', header: '배송메모', example: '후문 하차' },
    { key: 'centerCd', header: '배송센터코드', example: '', note: '비우면 주소로 자동 지정' },
    { key: 'shipToStatus', header: '납품처상태', example: '사용', note: '사용 / 사용중지' },
  ],
}
