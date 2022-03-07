import { pipe } from 'fp-ts/function'
import { throwIfAborted } from 'ix/aborterror'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import type { Readable } from 'stream'

/**
 * @internal
 */
export const fromReadable = <A>(stream: Readable): AsyncIterable<A> => {
    const abort = () => {
        stream.destroyed || stream.destroy()
    }

    return pipe(
        IX.create<A>(async function* (signal) {
            throwIfAborted(signal)

            signal?.addEventListener('abort', abort, { once: true })

            try {
                for await (const item of stream) {
                    yield item
                }
            } finally {
                signal?.removeEventListener('abort', abort)
                abort()
            }
        }),
        IXO.finalize(() => abort())
    )
}
