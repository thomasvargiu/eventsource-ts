import { toError } from 'fp-ts/Either'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import type { Db } from 'mongodb'

type Dependencies = {
    db: Db
}

const collectionExists =
    (name: string) =>
    ({ db }: Dependencies) =>
        pipe(
            TE.tryCatch(() => db.listCollections({ name }).toArray(), toError),
            TE.map(infos => infos.length !== 0)
        )

const getCollection =
    <A>(name: string) =>
    ({ db }: Dependencies) =>
        TE.of(db.collection<A>(name))

const createMongoCollection =
    <A>(name: string) =>
    ({ db }: Dependencies) =>
        pipe(
            TE.tryCatch(() => db.createCollection<A>(name), toError),
            TE.chainFirst(collection =>
                pipe(
                    TE.Do,
                    TE.chain(() =>
                        TE.tryCatch(
                            () =>
                                collection.createIndexes([
                                    { key: { stream: 1, revision: 1 }, unique: true },
                                    { key: { id: 1 }, unique: true },
                                    { key: { timestamp: 1 } },
                                ]),
                            toError
                        )
                    )
                )
            )
        )

export const createCollection = <A>(name: string) =>
    pipe(
        RTE.Do,
        RTE.chain(() => collectionExists(name)),
        RTE.chain(exists => (exists ? getCollection<A>(name) : createMongoCollection<A>(name)))
    )
