import { z } from 'zod'

// 운영사 설정 (docs/decisions/0092) — 운영사가 시스템 > 운영 설정에서 바꾸는 값
// 키 목록·기본값·검사 규칙은 여기, 값은 tb_operator_setting (행이 없으면 기본값)
// 플랫폼이 정하는 값(API 1회 최대 건수·로그 보관일·비밀번호 규칙 등)은 각 기능의 상수로 둔다 — 운영사마다 다를 이유가 없거나 법·성능 기준이라서
// 새 설정: 여기에 한 줄 + 쓰는 곳에서 getOperatorSetting

// 비우면 "사용 안 함"인 정수 칸
const optionalDays = (max: number) =>
  z
    .number({ error: '숫자로 넣어 주세요.' })
    .int('정수로 넣어 주세요.')
    .min(1, '1 이상으로 넣어 주세요.')
    .max(max, `${max} 이하로 넣어 주세요.`)
    .nullable()

export const OPERATOR_SETTINGS = {
  // 품목에 임박 기준 일수가 없을 때 쓰는 기본값 (비우면 기준 없는 품목은 만료만 표시)
  expiryAlertDays: {
    label: '기본 임박 알림 일수',
    description:
      '품목에 임박 기준이 없을 때, 유통기한이 이 일수 이하로 남으면 재고 조회에서 임박으로 표시합니다.',
    unit: '일',
    schema: optionalDays(3650),
    default: null as number | null,
  },
  // API 키 최대 유효기간: 발급 때 만료일이 필수가 되고, 오늘부터 이 일수 안이어야 한다 (비우면 제한 없음)
  apiKeyMaxDays: {
    label: 'API 키 최대 유효기간',
    description:
      '화주 API 키를 발급할 때 만료일을 필수로 하고, 오늘부터 이 일수 안으로만 정할 수 있게 합니다.',
    unit: '일',
    schema: optionalDays(3650),
    default: null as number | null,
  },
} as const

export type OperatorSettingKey = keyof typeof OPERATOR_SETTINGS
export type OperatorSettingValue<K extends OperatorSettingKey> = z.output<
  (typeof OPERATOR_SETTINGS)[K]['schema']
>
export const OPERATOR_SETTING_KEYS = Object.keys(OPERATOR_SETTINGS) as OperatorSettingKey[]

// 저장 입력 (화면·서버 공용): 모든 키를 한 번에
export const operatorSettingsSchema = z.object(
  Object.fromEntries(OPERATOR_SETTING_KEYS.map((key) => [key, OPERATOR_SETTINGS[key].schema])) as {
    [K in OperatorSettingKey]: (typeof OPERATOR_SETTINGS)[K]['schema']
  },
)
export type OperatorSettingsInput = z.input<typeof operatorSettingsSchema>
