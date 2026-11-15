// 번호 포맷 ↔ 숫자 변환 공통 유틸 (docs/decisions/0029)
// DB에는 숫자만 저장하고, 화면에 보여줄 때만 하이픈을 붙인다
export { formatBusinessNumber, isValidBusinessNumber } from './business-number'
export { formatCorpRegNumber, isValidCorpRegNumber } from './corp-reg-number'
export { digitsOnly } from './digits'
export { formatPhone, isValidPhone } from './phone'
