import { Timestamp } from 'mongodb'
/**
 * @internal
 */
export const msFromTimestamp = (timestamp: Timestamp) => timestamp.getHighBits() * 1000 + timestamp.getLowBits()
/**
 * @internal
 */
export const timestampFromMs = (date: number) => new Timestamp({ t: Number((date / 1000).toFixed(0)), i: date % 1000 })
/**
 * @interrnal
 */
export const getUTCTimestamp = (date: Date) => date.getTime()
