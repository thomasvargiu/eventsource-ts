import type { Event } from '@eventsource/eventstore/Event'
import { BACKWARDS, END } from '@eventsource/eventstore/EventStore'
import { StreamNotFoundError } from '@eventsource/eventstore/errors'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Reader'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { flow, pipe } from 'fp-ts/function'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import type { Dependencies, MongoEvent } from '../EventStore'
import { readStream } from './readStream'

/**
 * @internal
 */
export const getStreamRevision = <E extends Event>(stream: string) => {
    return pipe(
        readStream<E>({ stream, direction: BACKWARDS, fromRevision: END, maxCount: 1 }) as R.Reader<
            Dependencies<E>,
            AsyncIterable<MongoEvent<E>>
        >,
        R.map(
            IXO.catchError((err: unknown) =>
                err instanceof StreamNotFoundError ? IX.of({ revision: BigInt(-1) }) : IX.throwError(err)
            )
        ),
        R.map(as => TE.tryCatch(() => IX.toArray(as), E.toError)),
        RTE.map(
            flow(
                A.head,
                O.map(({ revision }) => BigInt(revision.toString())),
                O.getOrElse(() => BigInt(-1))
            )
        )
    )
}
