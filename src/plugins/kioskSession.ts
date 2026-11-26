import Vue from 'vue'
import {
    effectiveActionRule,
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

const DEVICE_MODE_KEY = 'mainsail.kiosk.deviceMode'
const SALT_BYTES = 16

const readDeviceMode = (): KioskDeviceMode => {
    try {
        return parseDeviceMode(window.localStorage.getItem(DEVICE_MODE_KEY))
    } catch {
        return null
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
    failedAttempts: 0,
    lastFailureAt: 0,
    dashboardPanel: null as string | null,
    urlParameterApplied: false,
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

export const requestKioskPin = (reason: KioskPinReason): Promise<boolean> => {
    if (pendingPin !== null) return kioskSession.pinReason === reason ? pendingPin.promise : Promise.resolve(false)

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
        return false
    }

    kioskSession.failedAttempts = 0
    return true
}

export const authorizeKioskAction = (
    action: KioskAction,
    settings: KioskSettings,
    onBlocked: (action: KioskAction) => void
): true | Promise<boolean> => {
    const rule = effectiveActionRule(action, settings)
    if (rule === 'allow') return true
    if (rule === 'pin') return requestKioskPin(action)

    onBlocked(action)
    return Promise.resolve(false)
}

export const createPinSalt = (): string => {
    const bytes = new Uint8Array(SALT_BYTES)
    window.crypto.getRandomValues(bytes)

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
