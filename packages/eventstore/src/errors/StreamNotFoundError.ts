export class StreamNotFoundError extends Error {
    constructor(streamName: string) {
        super()
        this.message = `Stream "${streamName}" not found`
    }
}
