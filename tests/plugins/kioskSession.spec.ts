import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinRecord, getDefaultKioskSettings, PIN_LOCKOUT_MS, PIN_MAX_ATTEMPTS } from '@/plugins/kiosk'

const stored = new Map<string, string>()
const settings = { ...getDefaultKioskSettings(), pin: createPinRecord('4821', 'aa', 2) }

const loadSession = async () => {
    vi.resetModules()

    return import('@/plugins/kioskSession')
}

describe('kioskSession', () => {
    beforeEach(() => {
        stored.clear()
        const navigator = { maxTouchPoints: 0, userAgent: 'node' }
        vi.stubGlobal('navigator', navigator)
        vi.stubGlobal('window', {
            navigator,
            innerWidth: 1280,
            innerHeight: 720,
            console,
            localStorage: {
                getItem: (key: string) => stored.get(key) ?? null,
                setItem: (key: string, value: string) => stored.set(key, value),
            },
        })
    })

    it('keeps the failed pin attempts and the lockout across a reload', async () => {
        const now = 5_000_000
        const first = await loadSession()
        for (let attempt = 0; attempt < PIN_MAX_ATTEMPTS; attempt++) first.submitKioskPin('0000', settings, now)
        expect(first.kioskPinLockout(now)).toBe(PIN_LOCKOUT_MS)

        const reloaded = await loadSession()
        expect(reloaded.kioskSession.failedAttempts).toBe(PIN_MAX_ATTEMPTS)
        expect(reloaded.kioskPinLockout(now + 1000)).toBe(PIN_LOCKOUT_MS - 1000)
        expect(reloaded.submitKioskPin('4821', settings, now + 1000)).toBe(false)
        expect(reloaded.submitKioskPin('4821', settings, now + PIN_LOCKOUT_MS)).toBe(true)

        const afterSuccess = await loadSession()
        expect(afterSuccess.kioskSession.failedAttempts).toBe(0)
    })

    it('starts without failed attempts when the stored value is damaged', async () => {
        stored.set('mainsail.kiosk.pinAttempts', '{nonsense')

        expect((await loadSession()).kioskSession.failedAttempts).toBe(0)
    })

    it('refuses a prompt while no pin dialog is on screen', async () => {
        const session = await loadSession()
        const refused = vi.fn()

        await expect(session.requestKioskPin('restart', refused)).resolves.toBe(false)
        expect(refused).toHaveBeenCalledWith('unavailable')
        expect(session.kioskSession.pinReason).toBe(null)
    })

    it('shares one prompt between requests for the same reason', async () => {
        const session = await loadSession()
        session.kioskSession.promptAvailable = true

        const first = session.requestKioskPin('deleteFile')
        const second = session.requestKioskPin('deleteFile')
        session.settleKioskPin(true)

        await expect(first).resolves.toBe(true)
        await expect(second).resolves.toBe(true)
    })

    it('refuses a request for another reason while a prompt is open, and says so', async () => {
        const session = await loadSession()
        session.kioskSession.promptAvailable = true
        const refused = vi.fn()

        const open = session.requestKioskPin('restart')
        await expect(session.requestKioskPin('cancelPrint', refused)).resolves.toBe(false)
        expect(refused).toHaveBeenCalledWith('busy')
        expect(session.kioskSession.pinReason).toBe('restart')

        session.settleKioskPin(true)
        await expect(open).resolves.toBe(true)
    })

    it('denies a pending prompt when it is torn down', async () => {
        const session = await loadSession()
        session.kioskSession.promptAvailable = true

        const pending = session.requestKioskPin('cancelPrint')
        session.settleKioskPin(false)

        await expect(pending).resolves.toBe(false)
        expect(session.kioskSession.pinReason).toBe(null)
    })

    it('remembers what was unlocked for the open page and for the editor separately', async () => {
        const session = await loadSession()

        session.setKioskGrant('route', 'settings')
        session.setKioskGrant('editor', 'configEdit')
        expect(session.grantedKioskActions()).toEqual(['settings', 'configEdit'])

        session.setKioskGrant('editor', null)
        expect(session.grantedKioskActions()).toEqual(['settings'])
    })
})
