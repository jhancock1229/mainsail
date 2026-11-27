import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketClient } from '@/plugins/webSocketClient'
import type { RPCMethods } from '@/types/moonraker'

class FakeSocket {
    static OPEN = 1
    static CONNECTING = 0
    static instances: FakeSocket[] = []

    readyState = FakeSocket.OPEN
    sent: { method: string; id: number }[] = []
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((message: { data: string }) => void) | null = null

    constructor() {
        FakeSocket.instances.push(this)
    }

    send(body: string): void {
        const parsed = JSON.parse(body)
        this.sent.push(...(Array.isArray(parsed) ? parsed : [parsed]))
    }

    close(): void {
        this.readyState = 3
    }
}

const connect = () => {
    const store = { dispatch: vi.fn(), state: { socket: { initializationList: [] } } }
    const client = new WebSocketClient({ url: 'ws://printer', store: store as never })
    client.connect()

    return { client, socket: () => FakeSocket.instances[FakeSocket.instances.length - 1] }
}

const sentMethods = (socket: FakeSocket): string[] => socket.sent.map((message) => message.method)
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
const restart = 'printer.restart' as RPCMethods
const info = 'printer.info' as RPCMethods

describe('WebSocketClient request guard', () => {
    beforeEach(() => {
        FakeSocket.instances = []
        vi.stubGlobal('WebSocket', FakeSocket)
        vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' })
        vi.stubGlobal('window', { addEventListener: vi.fn(), setTimeout, clearTimeout })
    })

    it('sends everything while no guard is set', () => {
        const { client, socket } = connect()
        client.emit('printer.restart', {})

        expect(sentMethods(socket())).toEqual(['printer.restart'])
    })

    it('sends a permitted request right away and drops a denied one', async () => {
        const { client, socket } = connect()
        client.setRequestGuard((method) => (method === 'printer.restart' ? Promise.resolve(false) : true))

        client.emit('printer.info', {})
        client.emit('printer.restart', {})
        await settled()

        expect(sentMethods(socket())).toEqual(['printer.info'])
    })

    it('sends a request once the guard permits it', async () => {
        const { client, socket } = connect()
        let permit: (allowed: boolean) => void = () => undefined
        client.setRequestGuard(() => new Promise<boolean>((resolve) => (permit = resolve)))

        client.emit('printer.restart', {})
        expect(socket().sent).toEqual([])

        permit(true)
        await settled()
        expect(sentMethods(socket())).toEqual(['printer.restart'])
    })

    it('guards a request that waits for its answer and rejects it when denied', async () => {
        const { client, socket } = connect()
        client.setRequestGuard((method) => (method === 'printer.restart' ? Promise.resolve(false) : true))

        await expect(client.emitAndWait(restart)).rejects.toThrow('printer.restart is not permitted')
        expect(socket().sent).toEqual([])

        client.emitAndWait(info)
        expect(sentMethods(socket())).toEqual(['printer.info'])
    })

    it('guards every request of a batch and sends the batch only when all are permitted', async () => {
        const { client, socket } = connect()
        client.setRequestGuard((method) => (method === 'server.files.delete_file' ? Promise.resolve(false) : true))

        client.emitBatch([
            { method: 'server.files.metadata', params: {}, emitOptions: {} },
            { method: 'server.files.delete_file', params: {}, emitOptions: {} },
        ])
        await settled()
        expect(socket().sent).toEqual([])

        client.emitBatch([{ method: 'server.files.metadata', params: {}, emitOptions: {} }])
        expect(sentMethods(socket())).toEqual(['server.files.metadata'])
    })

    it('does not send a request that was permitted after the connection was replaced', async () => {
        const { client, socket } = connect()
        let permit: (allowed: boolean) => void = () => undefined
        client.setRequestGuard(() => new Promise<boolean>((resolve) => (permit = resolve)))

        client.emit('printer.print.cancel', {})
        const first = socket()
        client.connect()
        permit(true)
        await settled()

        expect(first.sent).toEqual([])
        expect(socket()).not.toBe(first)
        expect(socket().sent).toEqual([])
    })

    it('rejects a waiting request that was permitted after the connection was replaced', async () => {
        const { client } = connect()
        let permit: (allowed: boolean) => void = () => undefined
        client.setRequestGuard(() => new Promise<boolean>((resolve) => (permit = resolve)))

        const answer = client.emitAndWait(restart)
        client.connect()
        permit(true)

        await expect(answer).rejects.toThrow('not permitted')
    })
})
