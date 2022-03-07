export class StreamNotFoundError extends Error {
    constructor(streamName: string) {
        super(`Stream "${streamName}" not found`)
        Object.setPrototypeOf(this, StreamNotFoundError.prototype)
    }
}
