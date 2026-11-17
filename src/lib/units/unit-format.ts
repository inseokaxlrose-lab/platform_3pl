// 단위 표시용 작은 함수 (화면·서버 공용, 0078)

// 소수 글자 정리: 끝의 0과 점을 뗀다 ('0.0010000000' → '0.001', '1000' → '1000', '1.0' → '1')
// 환산계수(소수 10자리)처럼 수량 함수(6자리)로는 다룰 수 없는 값에 쓴다
export const decimalText = (value: string) =>
  value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
