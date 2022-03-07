import { event, EventFromCreator } from '@eventsource/eventstore/Event'

export const created = (name: string) => event({
    type: 'Created',
    data: {
        name
    }
})
export type Created = EventFromCreator<typeof created>

export const nameChanged = (name: string) => event({
    type: 'NameChanged',
    data: {
        name
    }
})
export type NameChanged = EventFromCreator<typeof nameChanged>

export const removed = () => event({
    type: 'Removed',
    data: {}
})
export type Removed = EventFromCreator<typeof removed>

export type UserEvent = Created | NameChanged | Removed
