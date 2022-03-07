import { test } from '@eventsource/eventstore-test/Functional'
import { create } from '../../src/EventStore'

describe('InMemoryEventStore', () => {
    const es = create()
    const eventStoreProvider = () => es

    test({ eventStoreProvider })
})
