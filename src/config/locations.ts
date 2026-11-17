// 로케이션 설정 값 (docs/decisions/0075)

// 일괄 생성 한 번에 만들 수 있는 최대 개수 (실수로 수만 개가 생기는 것을 막는다)
export const LOCATION_BULK_MAX = 5000

// 일괄 생성 기본 코드 패턴: A-01-02 (구역-열-단)
export const DEFAULT_LOCATION_PATTERN = '{ZONE}-{ROW}-{LEVEL}'
