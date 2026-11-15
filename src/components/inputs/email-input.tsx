import { Input } from '@/components/ui/input'

// 이메일 입력 (권장 span 6~8): 형식 검사는 입력 규칙(optionalEmail)에서 하고, 저장은 소문자
export function EmailInput(
  props: Omit<React.ComponentProps<typeof Input>, 'type' | 'inputMode'> & {
    value: string
  },
) {
  return (
    <Input
      placeholder="name@example.com"
      autoComplete="email"
      spellCheck={false}
      {...props}
      type="text"
      inputMode="email"
    />
  )
}
