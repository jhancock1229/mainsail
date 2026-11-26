import { describe, expect, it } from 'vitest'
import {
    escapeHtml,
    getBrowserNotificationStatus,
    getDefaultAlertSettings,
    getSoundPattern,
    resolveAlertSettings,
    resolveChannels,
} from '@/plugins/notificationRules'
import { printerEventNames } from '@/plugins/printerEvents'
import { getDefaultState } from '@/store/gui'
import { mutations } from '@/store/gui/mutations'
import type { GuiState } from '@/store/gui/types'
import en from '@/locales/en.json'

type AnyFn = (...args: unknown[]) => unknown

describe('getDefaultAlertSettings', () => {
    it('is quiet by default: a toast for every event, no sound, no browser notification', () => {
        const defaults = getDefaultAlertSettings()

        expect(defaults.notifyEnabled).toBe(true)
        expect(defaults.explainErrors).toBe(true)
        expect(Object.keys(defaults.events).sort()).toEqual([...printerEventNames].sort())
        printerEventNames.forEach((name) => {
            expect(defaults.events[name]).toEqual({ toast: true, sound: false, browser: false })
        })
    })

    it('is the default of the gui store', () => {
        expect(getDefaultState().alerts).toEqual(getDefaultAlertSettings())
    })
})

describe('resolveAlertSettings', () => {
    it('returns the defaults for settings saved before the feature existed', () => {
        expect(resolveAlertSettings(undefined)).toEqual(getDefaultAlertSettings())
        expect(resolveAlertSettings(null)).toEqual(getDefaultAlertSettings())
        expect(resolveAlertSettings('broken')).toEqual(getDefaultAlertSettings())
        expect(resolveAlertSettings({})).toEqual(getDefaultAlertSettings())
    })

    it('keeps stored values and fills in what is missing', () => {
        const result = resolveAlertSettings({
            notifyEnabled: false,
            events: {
                printFinished: { toast: false, sound: true, browser: true },
                printFailed: { sound: true },
            },
        })

        expect(result.notifyEnabled).toBe(false)
        expect(result.explainErrors).toBe(true)
        expect(result.events.printFinished).toEqual({ toast: false, sound: true, browser: true })
        expect(result.events.printFailed).toEqual({ toast: true, sound: true, browser: false })
        expect(result.events.printStarted).toEqual({ toast: true, sound: false, browser: false })
    })

    it('ignores values of the wrong type and unknown events', () => {
        const result = resolveAlertSettings({
            notifyEnabled: 'yes',
            explainErrors: null,
            events: {
                printPaused: null,
                klipperError: { toast: 'no', sound: 1, browser: true },
                somethingElse: { toast: false },
            },
        })

        expect(result.notifyEnabled).toBe(true)
        expect(result.explainErrors).toBe(true)
        expect(result.events.printPaused).toEqual({ toast: true, sound: false, browser: false })
        expect(result.events.klipperError).toEqual({ toast: true, sound: false, browser: true })
        expect(Object.keys(result.events).sort()).toEqual([...printerEventNames].sort())
    })

    it('does not hand out the defaults by reference', () => {
        resolveAlertSettings(undefined).events.printStarted.toast = false

        expect(resolveAlertSettings(undefined).events.printStarted.toast).toBe(true)
    })

    it('resolves the state that gui/saveSetting writes', () => {
        const state = getDefaultState() as GuiState
        ;(mutations.saveSetting as AnyFn)(state, { name: 'alerts.events.printFinished.sound', value: true })
        ;(mutations.saveSetting as AnyFn)(state, { name: 'alerts.notifyEnabled', value: false })

        const result = resolveAlertSettings(state.alerts)
        expect(result.events.printFinished).toEqual({ toast: true, sound: true, browser: false })
        expect(result.events.printFailed).toEqual({ toast: true, sound: false, browser: false })
        expect(result.notifyEnabled).toBe(false)
    })
})

describe('getBrowserNotificationStatus', () => {
    it('reports browsers without the Notification API as unsupported', () => {
        expect(getBrowserNotificationStatus({ hasApi: false, secureContext: true, permission: '' })).toBe('unsupported')
    })

    it('reports pages that are not served securely as insecure', () => {
        expect(getBrowserNotificationStatus({ hasApi: true, secureContext: false, permission: 'default' })).toBe(
            'insecure'
        )
    })

    it('passes the permission through', () => {
        const status = (permission: string) =>
            getBrowserNotificationStatus({ hasApi: true, secureContext: true, permission })

        expect(status('granted')).toBe('granted')
        expect(status('denied')).toBe('denied')
        expect(status('default')).toBe('default')
        expect(status('whatever')).toBe('default')
    })
})

describe('resolveChannels', () => {
    const settings = (rule: Record<string, boolean>, notifyEnabled = true) =>
        resolveAlertSettings({ notifyEnabled, events: { printFinished: rule } })

    it('returns the channels that are switched on for the event', () => {
        expect(resolveChannels(settings({ toast: true, sound: true }), 'printFinished', 'default')).toEqual([
            'toast',
            'sound',
        ])
        expect(resolveChannels(settings({ toast: false, sound: true }), 'printFinished', 'default')).toEqual(['sound'])
    })

    it('returns nothing for a silent event', () => {
        expect(resolveChannels(settings({ toast: false }), 'printFinished', 'granted')).toEqual([])
    })

    it('returns nothing when the master switch is off', () => {
        const all = { toast: true, sound: true, browser: true }

        expect(resolveChannels(settings(all, false), 'printFinished', 'granted')).toEqual([])
    })

    it('uses the browser notification when permission is granted', () => {
        expect(resolveChannels(settings({ toast: false, browser: true }), 'printFinished', 'granted')).toEqual([
            'browser',
        ])
    })

    it.each(['default', 'denied', 'unsupported', 'insecure'] as const)(
        'falls back to a toast when browser notifications are %s',
        (status) => {
            expect(resolveChannels(settings({ toast: false, browser: true }), 'printFinished', status)).toEqual([
                'toast',
            ])
            expect(
                resolveChannels(settings({ toast: true, sound: true, browser: true }), 'printFinished', status)
            ).toEqual(['toast', 'sound'])
        }
    )
})

describe('getSoundPattern', () => {
    it.each(['info', 'success', 'warning', 'error'] as const)('has a short, quiet pattern for %s', (severity) => {
        const pattern = getSoundPattern(severity)

        expect(pattern.length).toBeGreaterThan(0)
        pattern.forEach((note) => {
            expect(note.frequency).toBeGreaterThan(100)
            expect(note.start + note.duration).toBeLessThanOrEqual(1.5)
        })
    })

    it('sounds different for a success and an error', () => {
        expect(getSoundPattern('success')).not.toEqual(getSoundPattern('error'))
    })
})

describe('escapeHtml', () => {
    it('escapes text that is shown in a toast', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)"> & \'more\'')).toBe(
            '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;more&#39;'
        )
    })
})

describe('printer event texts in en.json', () => {
    const locale = en as unknown as {
        App: { PrinterEvents: { Events: Record<string, Record<string, string>> } }
        Settings: { NotificationsTab: { Events: Record<string, Record<string, string>> } }
    }

    it.each(printerEventNames)('has a notification title and settings texts for %s', (name) => {
        expect(locale.App.PrinterEvents.Events[name]?.Title).toBeTruthy()
        expect(locale.Settings.NotificationsTab.Events[name]?.Title).toBeTruthy()
        expect(locale.Settings.NotificationsTab.Events[name]?.Description).toBeTruthy()
    })
})
