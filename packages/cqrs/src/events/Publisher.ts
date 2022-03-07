import type { TaskEither } from 'fp-ts/TaskEither'

export type Publisher<E> = {
    readonly publish: (event: E) => TaskEither<Error, void>
    readonly publishAll: (events: ReadonlyArray<E>) => TaskEither<Error, void>
}
