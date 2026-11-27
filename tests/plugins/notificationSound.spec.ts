import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playSoundOn } from '@/plugins/notificationSound'

const createContext = (state: string, resume: (context: { state: string }) => Promise<void>) => {
    const started: number[] = []
    const context = {
        state,
        currentTime: 10,
        destination: {},
        resume: vi.fn(() => resume(context)),
        createOscillator: vi.fn(() => ({
            type: 'sine',
            frequency: { value: 0 },
            connect: vi.fn(),
            start: (time: number) => started.push(time),
            stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
        })),
    }

    return { context: context as unknown as AudioContext, started, resume: context.resume }
}

describe('playSoundOn', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('schedules the tones on a running audio context', async () => {
        const { context, started, resume } = createContext('running', () => Promise.resolve())

        await expect(playSoundOn(context, 'success')).resolves.toBe(true)
        expect(resume).not.toHaveBeenCalled()
        expect(started).toHaveLength(2)
        expect(started[0]).toBe(10)
    })

    it('resumes a suspended audio context before it schedules the tones', async () => {
        const { context, started, resume } = createContext('suspended', (audio) => {
            audio.state = 'running'

            return Promise.resolve()
        })

        await expect(playSoundOn(context, 'error')).resolves.toBe(true)
        expect(resume).toHaveBeenCalledTimes(1)
        expect(started).toHaveLength(3)
    })

    it('drops the sound when the browser keeps the audio context suspended', async () => {
        const { context, started } = createContext('suspended', () => new Promise(() => undefined))

        const played = playSoundOn(context, 'warning')
        await vi.advanceTimersByTimeAsync(2000)

        await expect(played).resolves.toBe(false)
        expect(started).toHaveLength(0)
    })

    it('drops the sound when resuming fails', async () => {
        const { context, started } = createContext('suspended', () => Promise.reject(new Error('not allowed')))

        await expect(playSoundOn(context, 'info')).resolves.toBe(false)
        expect(started).toHaveLength(0)
    })
})
