import { test } from '@eventsource/eventstore-test/Functional'
import { MongoClient } from 'mongodb'
import * as MES from '../src/EventStore'

describe('MongoEventStore', () => {
    const client = new MongoClient(
        process.env.MONGO_URL || 'mongodb://mongo:27017/eventstore?replicaSet=rsmongo&writeConcern=majority',
        {
            directConnection: true,
            connectTimeoutMS: 2000,
        }
    )

    const db = client.db('eventstore')
    const collection = db.collection<MES.StoreSchema>('test')
    const es = MES.create({ client, collection })

    beforeAll(async () => {
        await client.connect()
        await MES.createCollectionIfNotExists<MES.StoreSchema>('test')({ db })()
    })

    afterAll(async () => {
        await client.close()
    })

    test({ es })
})
