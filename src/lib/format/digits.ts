// 숫자만 남기기 (하이픈·띄어쓰기 등 제거) — DB에는 이 모양으로 저장한다 (docs/decisions/0029)
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

// 숫자·하이픈·띄어쓰기 외의 글자가 섞였는지 (섞였으면 숫자만 남겨도 의미가 바뀌므로 거부)
export const hasOnlyDigitsAndSeparators = (value: string) => /^[\d\s-]*$/.test(value)
