import Vue from 'vue'
import { isRecord, setDataDeep } from '@/plugins/helpers'

const NOT_FOUND = 404

// Read through the websocket: the request is answered after the writes this session already sent.
export const readStoredSetting = async (key: string): Promise<{ value: unknown } | null> => {
    try {
        const result = await Vue.$socket.emitAndWait('server.database.get_item', { namespace: 'mainsail', key })

        return { value: result.value }
    } catch (error) {
        return isRecord(error) && error.code === NOT_FOUND ? { value: undefined } : null
    }
}

export const withStoredValues = <T>(defaults: T, stored: unknown): T => {
    setDataDeep(defaults, isRecord(stored) ? stored : {})

    return defaults
}

let pending: Promise<unknown> = Promise.resolve()

// One at a time: a read that is answered while an earlier change is still being written would undo it locally.
export const inOrder = <T>(task: () => Promise<T>): Promise<T> => {
    const run = pending.then(task, task)
    pending = run.catch(() => undefined)

    return run
}

export const isSameSetting = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
