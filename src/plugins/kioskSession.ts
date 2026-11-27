import Vue from 'vue'
import {
    isSmallTouchScreen,
    KioskAction,
    KioskDeviceMode,
    KioskSettings,
    parseDeviceMode,
    pinLockoutRemaining,
    resolveKioskMode,
    verifyPin,
} from '@/plugins/kiosk'

export type KioskPinReason = KioskAction | 'exit' | 'changePin'
export type KioskPinRefusal = 'busy' | 'unavailable'
export type KioskGrantSource = 'route' | 'editor'

const DEVICE_MODE_KEY = 'mainsail.kiosk.deviceMode'
const PIN_ATTEMPTS_KEY = 'mainsail.kiosk.pinAttempts'
const SALT_BYTES = 16

const readDeviceMode = (): KioskDeviceMode => {
    try {
        return parseDeviceMode(window.localStorage.getItem(DEVICE_MODE_KEY))
    } catch {
        return null
    }
}

const readPinAttempts = (): { failedAttempts: number; lastFailureAt: number } => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(PIN_ATTEMPTS_KEY) ?? '{}')
        const failedAttempts =
            Number.isInteger(stored.failedAttempts) && stored.failedAttempts > 0 ? stored.failedAttempts : 0
        const lastFailureAt = typeof stored.lastFailureAt === 'number' ? stored.lastFailureAt : 0

        return { failedAttempts, lastFailureAt }
    } catch {
        return { failedAttempts: 0, lastFailureAt: 0 }
    }
}

const storePinAttempts = (): void => {
    try {
        const { failedAttempts, lastFailureAt } = kioskSession
        window.localStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify({ failedAttempts, lastFailureAt }))
    } catch {
        window.console.warn('[Kiosk] the failed PIN attempts could not be stored')
    }
}

const detectTouch = (): boolean => {
    // maxTouchPoints === 256 is reported by some Windows 10 browsers without a touch screen
    return 'ontouchstart' in window || (navigator.maxTouchPoints > 0 && navigator.maxTouchPoints !== 256)
}

export const kioskSession = Vue.observable({
    deviceMode: readDeviceMode(),
    width: window.innerWidth,
    height: window.innerHeight,
    touch: detectTouch(),
    pinReason: null as KioskPinReason | null,
    promptAvailable: false,
    ...readPinAttempts(),
    dashboardPanel: null as string | null,
    urlParameterApplied: false,
    urlLeavePending: false,
    localChange: false,
    grants: { route: null, editor: null } as Record<KioskGrantSource, KioskAction | null>,
})

let pendingPin: { promise: Promise<boolean>; resolve: (allowed: boolean) => void } | null = null

export const setKioskDeviceMode = (mode: 'on' | 'off'): void => {
    kioskSession.deviceMode = mode

    try {
        window.localStorage.setItem(DEVICE_MODE_KEY, mode)
    } catch {
        window.console.warn('[Kiosk] the choice for this device could not be stored')
    }
}

export const updateKioskScreen = (): void => {
    kioskSession.width = window.innerWidth
    kioskSession.height = window.innerHeight
    kioskSession.touch = detectTouch()
}

export const kioskModeFor = (settings: KioskSettings): { active: boolean; suggest: boolean } => {
    return resolveKioskMode({
        deviceMode: kioskSession.deviceMode,
        smallScreens: settings.smallScreens,
        smallTouchScreen: isSmallTouchScreen(kioskSession),
    })
}

export const requestKioskPin = (
    reason: KioskPinReason,
    onRefused: (why: KioskPinRefusal) => void = () => undefined
): Promise<boolean> => {
    if (pendingPin !== null) {
        if (kioskSession.pinReason === reason) return pendingPin.promise

        onRefused('busy')
        return Promise.resolve(false)
    }
    if (!kioskSession.promptAvailable) {
        onRefused('unavailable')
        return Promise.resolve(false)
    }

    let resolve: (allowed: boolean) => void = () => undefined
    const promise = new Promise<boolean>((done) => (resolve = done))
    pendingPin = { promise, resolve }
    kioskSession.pinReason = reason

    return promise
}

export const settleKioskPin = (allowed: boolean): void => {
    pendingPin?.resolve(allowed)
    pendingPin = null
    kioskSession.pinReason = null
}

export const kioskPinLockout = (now: number): number => {
    return pinLockoutRemaining(kioskSession.failedAttempts, kioskSession.lastFailureAt, now)
}

export const submitKioskPin = (pin: string, settings: KioskSettings, now: number): boolean => {
    if (kioskPinLockout(now) > 0) return false

    if (!verifyPin(pin, settings.pin)) {
        kioskSession.failedAttempts++
        kioskSession.lastFailureAt = now
        storePinAttempts()
        return false
    }

    kioskSession.failedAttempts = 0
    storePinAttempts()
    return true
}

export const grantedKioskActions = (): KioskAction[] => {
    return Object.values(kioskSession.grants).filter((action): action is KioskAction => action !== null)
}

export const setKioskGrant = (source: KioskGrantSource, action: KioskAction | null): void => {
    kioskSession.grants[source] = action
}

export const withLocalKioskChange = (change: () => void): void => {
    kioskSession.localChange = true
    change()
    Vue.nextTick(() => (kioskSession.localChange = false))
}

export const createPinSalt = (): string => {
    const bytes = new Uint8Array(SALT_BYTES)
    window.crypto.getRandomValues(bytes)

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
