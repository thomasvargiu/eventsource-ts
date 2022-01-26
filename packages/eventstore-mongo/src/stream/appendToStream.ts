import type { EventData, EventType } from '@eventsource/events/Event'
import { RevisionMismatchError } from '@eventsource/eventstore'
import type { AppendToStreamOptions } from '@eventsource/eventstore/EventStore'
import { nonEmptyArray } from 'fp-ts'
import { toError } from 'fp-ts/Either'
import type { NonEmptyArray } from 'fp-ts/NonEmptyArray'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { constVoid, pipe } from 'fp-ts/function'
import { Collection, CommandOperationOptions, MongoClient, ReadPreference, TransactionOptions } from 'mongodb'
import { monotonicFactory } from 'ulid'
import type { StoreSchema } from '../EventStore'
import { eventToSchema } from '../internal/eventToSchema'
import { getStreamRevision } from './getStreamRevision'

const ulid = monotonicFactory()

type Dependencies<E extends EventType> = {
    client: MongoClient
    collection: Collection<StoreSchema<E>>
}

export type MongoAppendToStreamOptions = AppendToStreamOptions & {
    /**
     * Check revision on database. Enabling it asserts the sequence of the revision.
     */
    checkRevision?: boolean
    commandOptions?: CommandOperationOptions
}

const transactionOptions: TransactionOptions = {
    readPreference: new ReadPreference('primary'),
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' },
}

const writeDocuments =
    <E extends EventType>(
        documents: StoreSchema<E>[],
        commandOptions: CommandOperationOptions = {}
    ): RTE.ReaderTaskEither<Dependencies<E>, Error, void> =>
    ({ collection }) =>
        pipe(
            TE.tryCatch(() => collection.insertMany(documents, commandOptions), toError),
            TE.map(constVoid)
        )

const writeMultipleDocuments =
    <E extends EventType>(
        documents: StoreSchema<E>[],
        commandOptions: CommandOperationOptions = {}
    ): RTE.ReaderTaskEither<Dependencies<E>, Error, void> =>
    ({ client, collection }) =>
        pipe(
            TE.tryCatch(
                () =>
                    client.withSession(session =>
                        session.withTransaction(
                            () => collection.insertMany(documents, commandOptions),
                            transactionOptions
                        )
                    ),
                toError
            ),
            TE.map(constVoid)
        )

const writeEvents =
    (commandOptions: CommandOperationOptions = {}) =>
    <E extends EventType>(documents: StoreSchema<E>[]) =>
        pipe(
            documents.length > 1
                ? writeMultipleDocuments(documents, commandOptions)
                : writeDocuments(documents, commandOptions)
        )

const checkExpectedRevision = (stream: string, expectedRevision?: bigint) =>
    pipe(
        getStreamRevision(stream),
        RTE.chainW(
            RTE.fromPredicate(
                revision => expectedRevision === undefined || revision === expectedRevision,
                revision => new RevisionMismatchError(expectedRevision || BigInt(-1), revision)
            )
        )
    )

export const appendToStream = <E extends EventType>(
    stream: string,
    events: EventData<E> | NonEmptyArray<EventData<E>>,
    { expectedRevision, checkRevision = false, commandOptions = {} }: MongoAppendToStreamOptions = {}
) =>
    pipe(
        RTE.Do,
        RTE.bind('timestamp', () => RTE.right(Date.now())),
        RTE.bind('currentRevision', () =>
            checkRevision
                ? checkExpectedRevision(stream, expectedRevision)
                : RTE.of(expectedRevision !== undefined ? expectedRevision : BigInt(-1))
        ),
        RTE.bind('nextRevision', ({ currentRevision }) => RTE.of(currentRevision)),
        RTE.bind('events', () => RTE.of(Array.isArray(events) ? events : ([events] as NonEmptyArray<EventData<E>>))),
        RTE.chain(({ timestamp, currentRevision, nextRevision, events }) =>
            pipe(
                events,
                nonEmptyArray.map(event =>
                    eventToSchema({ streamId: stream, revision: ++nextRevision, timestamp, position: ulid() })(event)
                ),
                writeEvents(commandOptions),
                RTE.mapLeft(error =>
                    error.message.startsWith('E11000')
                        ? new RevisionMismatchError(expectedRevision || BigInt(-1), currentRevision)
                        : error
                ),
                RTE.map(() => ({ revision: nextRevision + BigInt(events.length - 1) }))
            )
        )
    )
