import type { ExpectedRevision } from '../EventStore'

export class RevisionMismatchError extends Error {
    constructor(public readonly expectedRevision: ExpectedRevision, public readonly currentRevision: ExpectedRevision) {
        super(`Invalid revision. Expected "${expectedRevision}", got ${currentRevision}`)
        Object.setPrototypeOf(this, RevisionMismatchError.prototype)
    }
}
