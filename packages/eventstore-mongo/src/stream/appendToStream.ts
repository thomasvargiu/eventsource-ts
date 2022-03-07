import type { Event } from '@eventsource/eventstore/Event'
import {
    ANY,
    AppendResult,
    AppendToStreamOptions,
    ExpectedRevision,
    NO_STREAM,
} from '@eventsource/eventstore/EventStore'
import { RevisionMismatchError } from '@eventsource/eventstore/errors'
import { readonlyArray } from 'fp-ts'
import { toError } from 'fp-ts/Either'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { constVoid, pipe } from 'fp-ts/function'
import { CommandOperationOptions, MongoClient, ReadPreference, TransactionOptions } from 'mongodb'
import type { StoreCollection, StoreSchema } from '../EventStore'
import { eventToSchema } from '../internal/eventToSchema'
import { getStreamRevision } from './getStreamRevision'

type Dependencies<E extends Event> = {
    client: MongoClient
    collection: StoreCollection<E>
}

const transactionOptions: TransactionOptions = {
    readPreference: new ReadPreference('primary'),
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' },
}

const writeSingleDocument =
    <E extends Event>(documents: ReadonlyArray<StoreSchema<E>>, commandOptions: CommandOperationOptions = {}) =>
    ({ collection }: Dependencies<E>) =>
        pipe(
            TE.tryCatch(() => collection.insertMany(documents as StoreSchema<E>[], commandOptions), toError),
            TE.map(constVoid)
        )

const writeDocumentsInTransaction =
    <E extends Event>(documents: ReadonlyArray<StoreSchema<E>>, commandOptions: CommandOperationOptions = {}) =>
    ({ client, collection }: Dependencies<E>) =>
        pipe(
            TE.tryCatch(
                () =>
                    client.withSession(session =>
                        session.withTransaction(
                            () => collection.insertMany(documents as StoreSchema<E>[], commandOptions),
                            transactionOptions
                        )
                    ),
                toError
            ),
            TE.map(constVoid)
        )

const writeEvents =
    (commandOptions: CommandOperationOptions = {}) =>
    <E extends Event>(documents: ReadonlyArray<StoreSchema<E>>) =>
        pipe(
            documents.length > 1
                ? writeDocumentsInTransaction<E>(documents, commandOptions)
                : writeSingleDocument<E>(documents, commandOptions),
            RTE.map(constVoid)
        )

/**
 * Check the expected revision
 */
const checkExpectedRevision = <E extends Event>(stream: string, expectedRevision: ExpectedRevision = ANY) =>
    expectedRevision !== ANY
        ? RTE.right(expectedRevision === NO_STREAM ? BigInt(-1) : expectedRevision)
        : getStreamRevision<E>(stream)

// expectedRevision = ANY => just append a new event, we should get the last revision first (then retry on failures?)
// expectedRevision = NO_STREAM => we can just set the expectedRevision to -1n, the store can trigger an exception on duplicate key

export const appendToStream =
    <E2 extends Event>({ stream, expectedRevision = ANY }: AppendToStreamOptions) =>
    <E extends E2>(events: E | ReadonlyArray<E>): RTE.ReaderTaskEither<Dependencies<E>, Error, AppendResult> =>
        pipe(
            RTE.ask<Dependencies<E>>(),
            RTE.map(() => ({})),
            RTE.bind('timestamp', () => RTE.fromIO(() => Date.now())),
            RTE.bind('currentRevision', () => checkExpectedRevision<E>(stream, expectedRevision)),
            RTE.chain(({ timestamp, currentRevision }) => {
                let revision = currentRevision
                return pipe(
                    (Array.isArray(events) ? events : [events]) as ReadonlyArray<E>,
                    readonlyArray.map(eventToSchema({ stream, revision: ++revision, timestamp })),
                    RTE.right,
                    RTE.chainW(writeEvents()),
                    RTE.bimap(
                        error =>
                            error.message.startsWith('E11000')
                                ? new RevisionMismatchError(expectedRevision, currentRevision)
                                : error,
                        () => revision
                    )
                )
            }),
            RTE.map(revision => ({ revision }))
        )
