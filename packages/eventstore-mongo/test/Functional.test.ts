import { test } from '@eventsource/eventstore-test/Functional'
import type { Event } from '@eventsource/eventstore/Event'
import * as T from 'fp-ts/Task'
import { MongoClient } from 'mongodb'
import * as MES from '../src/EventStore'

describe('MongoEventStore', () => {
    const client = new MongoClient(
        process.env.MONGO_URL || 'mongodb://mongo:27017/eventstore?replicaSet=rs0&writeConcern=majority',
        {
            directConnection: true,
            connectTimeoutMS: 2000,
        }
    )

    const db = client.db('eventstore')
    const collection = db.collection<MES.StoreSchema<Event>>('test')
    const deps = { client, collection }
    const eventStoreProvider = () => {
        return MES.create({
            ...deps,
            subscribeStart: Date.now(),
            clockSkew: 120,
            batchSize: 1,
        })
    }

    beforeAll(async () => {
        await client.connect()
    }, 60000)

    beforeEach(async () => {
        await T.delay(1)(T.of(undefined))()
        await db.collection('test').drop()
        await MES.createCollectionIfNotExists<MES.StoreSchema>('test')({ db })()
    })

    afterAll(async () => {
        await client.close()
    })

    test({ eventStoreProvider })
})
