import type { TaskEither } from 'fp-ts/TaskEither'

export type CommandMap<Q = any, R = unknown> = [Q, R]

type Commands<A extends CommandMap> = A[0]
type CommandResult<A extends CommandMap, B extends Commands<A>> = {
    [K in Commands<A>]: B extends K ? (Extract<A, [K, any]> extends [K, infer U] ? U : never) : never
}[B]

export type CommandBus<A extends CommandMap = CommandMap> = {
    readonly execute: <B extends Commands<A>>(command: B) => TaskEither<Error, CommandResult<A, B>>
}
