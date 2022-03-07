import type { TaskEither } from 'fp-ts/TaskEither'

export type QueryMap<Q = any, R = unknown> = [Q, R]

type Queries<A extends QueryMap> = A[0]
type QueryResult<A extends QueryMap, B extends Queries<A>> = {
    [K in Queries<A>]: B extends K ? (Extract<A, [K, any]> extends [K, infer U] ? U : never) : never
}[B]

export type QueryBus<A extends QueryMap = QueryMap> = {
    readonly execute: <B extends Queries<A>>(query: B) => TaskEither<Error, QueryResult<A, B>>
}
