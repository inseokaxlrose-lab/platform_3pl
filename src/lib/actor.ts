import { AsyncLocalStorage } from 'node:async_hooks'

// 지금 DB를 바꾸는 사람과 그 사람의 운영사 (요청 하나 동안 기억하는 "출입증")
// - actor: 등록·수정자 칸 created_by/updated_by에 자동으로 들어간다 (docs/db-conventions.md)
// - operatorId: 운영사 표를 읽고 쓸 때 자동으로 이 운영사로 거르고 채운다 (prisma.ts, docs/decisions/0039)
// 서버 액션(createAction)은 로그인 사용자로, 시드는 'seed'로 감싸서 실행한다
// 감싸지 않은 곳(화면 조회 함수·테스트 준비 데이터 등)은 작업자 'system', 운영사 없음(자동 거르기 안 함)
export type ActorContext = { actor: string; operatorId?: bigint }

const storage = new AsyncLocalStorage<ActorContext>()

export const SYSTEM_ACTOR = 'system'

// fn 안에서 일어나는 DB 쓰기의 작업자·운영사를 정한다
// 결과를 이 안에서 기다린다: Prisma 쿼리는 await할 때 실행되므로, 밖에서 기다리면 정보가 사라진다
export async function runInContext<T>(
  context: ActorContext,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  return storage.run({ ...context, actor: context.actor.slice(0, 50) }, async () => await fn())
}

// 작업자만 정한다 (운영사는 바깥 출입증의 것을 그대로 쓴다)
export async function runAsActor<T>(username: string, fn: () => T | PromiseLike<T>): Promise<T> {
  return runInContext({ actor: username, operatorId: storage.getStore()?.operatorId }, fn)
}

// 지금 작업자 아이디 (없으면 'system')
export function currentActor(): string {
  return storage.getStore()?.actor ?? SYSTEM_ACTOR
}

// 지금 운영사 키 (서버 액션 밖이면 undefined)
export function currentOperatorId(): bigint | undefined {
  return storage.getStore()?.operatorId
}

// 지금 운영사 키 (꼭 있어야 하는 곳: 운영사 데이터를 새로 만드는 함수)
// 서버 액션 밖에서 부르면 개발 실수 → 오류 (시드·테스트는 runInContext로 감싼다)
export function requireOperatorId(): bigint {
  const operatorId = currentOperatorId()
  if (operatorId === undefined) {
    throw new Error('운영사 출입증이 없습니다. createAction 또는 runInContext 안에서 불러 주세요.')
  }
  return operatorId
}

// 운영사 거르기를 잠깐 끄고 실행 (작업자 기록은 그대로)
// 쓰는 곳은 두 가지뿐이다:
// - 운영사와 상관없이 전체에서 하나여야 하는 값(로그인 아이디·이메일)의 중복 검사 — 결과로 "있다/없다"만 쓴다
// - 플랫폼의 운영사 등록 — 새 운영사의 키를 직접 넣어 만든다 (작업 중인 운영사와 섞이지 않게)
export async function acrossOperators<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  return runInContext({ actor: currentActor() }, fn)
}
