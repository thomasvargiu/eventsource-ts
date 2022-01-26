import * as E from 'fp-ts/Either'
import type { Task } from 'fp-ts/Task'
import type { TaskEither } from 'fp-ts/TaskEither'
import { flow, pipe } from 'fp-ts/function'
import { defer, from, of, switchMap, throwError } from 'rxjs'

/**
 * @internal
 */
export const taskToObservable = <A>(task: Task<A>) => defer(() => from(task()))

/**
 * @internal
 */
export const taskEitherToObservable = <E, A>(taskEither: TaskEither<E, A>) =>
    pipe(taskToObservable(taskEither), switchMap(flow(E.match(throwError, a => of(a)))))
