// Settings of the error explainer and the printer event notifications (gui store key "alerts").
import { isRecord } from '@/plugins/helpers'
import { printerEventNames } from '@/plugins/printerEvents'
import type { PrinterEventName, PrinterEventSeverity } from '@/plugins/printerEvents'

export const notificationChannels = ['toast', 'sound', 'browser'] as const

export type NotificationChannel = (typeof notificationChannels)[number]

// all channels off means the event is silent
export type NotificationRule = Record<NotificationChannel, boolean>

export interface AlertSettings {
    explainErrors: boolean
    notifyEnabled: boolean
    events: Record<PrinterEventName, NotificationRule>
}

export type BrowserNotificationStatus = 'granted' | 'default' | 'denied' | 'unsupported' | 'insecure'

export interface SoundNote {
    frequency: number
    start: number
    duration: number
}

const defaultRule: NotificationRule = { toast: true, sound: false, browser: false }

export const getDefaultAlertSettings = (): AlertSettings => {
    const events = {} as Record<PrinterEventName, NotificationRule>
    printerEventNames.forEach((name) => {
        events[name] = { ...defaultRule }
    })

    return { explainErrors: true, notifyEnabled: true, events }
}

const booleanOr = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

// settings from the database can be incomplete (saved by an older version) or broken
export const resolveAlertSettings = (stored: unknown): AlertSettings => {
    const settings = getDefaultAlertSettings()
    if (!isRecord(stored)) return settings

    settings.explainErrors = booleanOr(stored.explainErrors, settings.explainErrors)
    settings.notifyEnabled = booleanOr(stored.notifyEnabled, settings.notifyEnabled)

    const storedEvents = isRecord(stored.events) ? stored.events : {}
    printerEventNames.forEach((name) => {
        const storedRule = storedEvents[name]
        if (!isRecord(storedRule)) return

        notificationChannels.forEach((channel) => {
            settings.events[name][channel] = booleanOr(storedRule[channel], settings.events[name][channel])
        })
    })

    return settings
}

export const getBrowserNotificationStatus = (environment: {
    hasApi: boolean
    secureContext: boolean
    permission: string
}): BrowserNotificationStatus => {
    if (!environment.hasApi) return 'unsupported'
    // browsers only allow notifications on https and localhost
    if (!environment.secureContext) return 'insecure'
    if (environment.permission === 'granted' || environment.permission === 'denied') return environment.permission

    return 'default'
}

// The settings are shared by all browsers, the permission is not: an event with a browser notification falls
// back to a toast in a browser that cannot show it, so it does not get lost.
export const resolveChannels = (
    settings: AlertSettings,
    event: PrinterEventName,
    browserStatus: BrowserNotificationStatus
): NotificationChannel[] => {
    if (!settings.notifyEnabled) return []

    const rule = settings.events[event]
    const browser = rule.browser && browserStatus === 'granted'
    const toast = rule.toast || (rule.browser && !browser)
    const active: Record<NotificationChannel, boolean> = { toast, sound: rule.sound, browser }

    return notificationChannels.filter((channel) => active[channel])
}

const soundPatterns: Record<PrinterEventSeverity, SoundNote[]> = {
    info: [{ frequency: 660, start: 0, duration: 0.18 }],
    success: [
        { frequency: 660, start: 0, duration: 0.16 },
        { frequency: 880, start: 0.17, duration: 0.3 },
    ],
    warning: [
        { frequency: 587, start: 0, duration: 0.16 },
        { frequency: 587, start: 0.24, duration: 0.16 },
    ],
    error: [
        { frequency: 523, start: 0, duration: 0.2 },
        { frequency: 392, start: 0.22, duration: 0.2 },
        { frequency: 311, start: 0.44, duration: 0.4 },
    ],
}

export const getSoundPattern = (severity: PrinterEventSeverity): SoundNote[] => soundPatterns[severity]

const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// toasts render their message as HTML
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => htmlEntities[char])
