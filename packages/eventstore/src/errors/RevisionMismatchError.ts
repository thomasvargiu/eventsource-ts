export class RevisionMismatchError extends Error {
    constructor(public readonly expectedRevision: bigint, public readonly currentRevision: bigint) {
        super()
        this.message = `Invalid revision. Expected "${expectedRevision}", got ${currentRevision}`
    }
}
