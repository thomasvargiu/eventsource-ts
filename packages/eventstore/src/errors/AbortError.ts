export class AbortError extends Error {
    constructor(message = 'The operation has been aborted') {
        super(message)
        Object.setPrototypeOf(this, AbortError.prototype)
    }
}
