import { sha256 } from 'js-sha256'
import type { DashboardLayoutState } from '@/plugins/dashboardLayoutState'

export type KioskDeviceMode = 'on' | 'off' | null
export type KioskSmallScreens = 'suggest' | 'apply' | 'off'
export type KioskAction = 'cancelPrint' | 'restart' | 'deleteFile' | 'configEdit' | 'settings'
export type KioskActionRule = 'allow' | 'pin' | 'block'

export interface KioskPinRecord {
    salt: string
    hash: string
    iterations: number
}

export interface KioskSettings {
    smallScreens: KioskSmallScreens
    bottomBar: string[]
    hiddenPages: string[]
    hiddenPanels: string[]
    hiddenShell: string[]
    actions: Record<KioskAction, KioskActionRule>
    pin: KioskPinRecord | null
}

export const kioskActions: KioskAction[] = ['cancelPrint', 'restart', 'deleteFile', 'configEdit', 'settings']
export const kioskActionRules: KioskActionRule[] = ['allow', 'pin', 'block']
export const kioskSmallScreenOptions: KioskSmallScreens[] = ['suggest', 'apply', 'off']

export const KIOSK_HOME_PAGE = 'dashboard'
export const KIOSK_STATUS_PANEL = 'status'
export const KIOSK_CONFIG_PAGE = 'machine'
export const BOTTOM_BAR_MAX = 4
export const SMALL_SCREEN_MAX_SHORT_SIDE = 600
export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 8
export const PIN_ITERATIONS = 2000
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCKOUT_MS = 30_000
export const SWIPE_MIN_DISTANCE = 60
export const SWIPE_MAX_SLOPE = 0.5
export const SWIPE_IGNORED_TARGETS =
    '.v-slider, input, textarea, canvas, video, .v-data-table, .v-tabs, .cm-editor, .v-window .v-window'

export const getDefaultKioskSettings = (): KioskSettings => ({
    smallScreens: 'suggest',
    bottomBar: ['dashboard', 'gcodefiles', 'console', 'webcam'],
    hiddenPages: [],
    hiddenPanels: [],
    hiddenShell: [],
    actions: {
        cancelPrint: 'allow',
        restart: 'allow',
        deleteFile: 'allow',
        configEdit: 'allow',
        settings: 'allow',
    },
    pin: null,
})

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const stringList = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : fallback

const resolvePinRecord = (value: unknown): KioskPinRecord | null => {
    if (!isObject(value)) return null

    const { salt, hash, iterations } = value
    if (typeof salt !== 'string' || salt === '') return null
    if (typeof hash !== 'string' || hash === '') return null
    if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 1) return null

    return { salt, hash, iterations }
}

export const resolveKioskSettings = (raw: unknown): KioskSettings => {
    const defaults = getDefaultKioskSettings()
    if (!isObject(raw)) return defaults

    const rawActions = isObject(raw.actions) ? raw.actions : {}
    const actions = { ...defaults.actions }
    kioskActions.forEach((action) => {
        const rule = rawActions[action] as KioskActionRule
        if (kioskActionRules.includes(rule)) actions[action] = rule
    })

    return {
        smallScreens: kioskSmallScreenOptions.includes(raw.smallScreens as KioskSmallScreens)
            ? (raw.smallScreens as KioskSmallScreens)
            : defaults.smallScreens,
        bottomBar: stringList(raw.bottomBar, defaults.bottomBar),
        hiddenPages: stringList(raw.hiddenPages, defaults.hiddenPages),
        hiddenPanels: stringList(raw.hiddenPanels, defaults.hiddenPanels),
        hiddenShell: stringList(raw.hiddenShell, defaults.hiddenShell),
        actions,
        pin: resolvePinRecord(raw.pin),
    }
}

export const parseKioskUrlParam = (search: string): 'on' | 'off' | null => {
    const params = new URLSearchParams(search)
    if (!params.has('kiosk')) return null

    const value = (params.get('kiosk') ?? '').toLowerCase()
    if (['', '1', 'on', 'true'].includes(value)) return 'on'
    if (['0', 'off', 'false'].includes(value)) return 'off'

    return null
}

export const parseDeviceMode = (stored: string | null | undefined): KioskDeviceMode => {
    return stored === 'on' || stored === 'off' ? stored : null
}

export const isSmallTouchScreen = (screen: { width: number; height: number; touch: boolean }): boolean => {
    return screen.touch && Math.min(screen.width, screen.height) <= SMALL_SCREEN_MAX_SHORT_SIDE
}

export const resolveKioskMode = (input: {
    deviceMode: KioskDeviceMode
    smallScreens: KioskSmallScreens
    smallTouchScreen: boolean
}): { active: boolean; suggest: boolean } => {
    if (input.deviceMode !== null) return { active: input.deviceMode === 'on', suggest: false }
    if (!input.smallTouchScreen) return { active: false, suggest: false }

    return { active: input.smallScreens === 'apply', suggest: input.smallScreens === 'suggest' }
}

export const isValidPinFormat = (pin: string): boolean => {
    return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin)
}

const hashPin = (pin: string, salt: string, iterations: number): string => {
    let hash = sha256(`${salt}:${pin}`)
    for (let round = 1; round < iterations; round++) hash = sha256(`${salt}:${hash}`)

    return hash
}

export const createPinRecord = (pin: string, salt: string, iterations: number = PIN_ITERATIONS): KioskPinRecord => {
    return { salt, hash: hashPin(pin, salt, iterations), iterations }
}

export const hasPin = (record: KioskPinRecord | null): record is KioskPinRecord => record !== null

export const verifyPin = (pin: string, record: KioskPinRecord | null): boolean => {
    if (!hasPin(record)) return true
    if (!isValidPinFormat(pin)) return false

    return hashPin(pin, record.salt, record.iterations) === record.hash
}

export const pinLockoutRemaining = (failedAttempts: number, lastFailureAt: number, now: number): number => {
    if (failedAttempts < PIN_MAX_ATTEMPTS) return 0

    return Math.max(0, lastFailureAt + PIN_LOCKOUT_MS - now)
}

export const effectiveActionRule = (action: KioskAction, settings: KioskSettings): KioskActionRule => {
    const rule = settings.actions[action]
    if (rule === 'block') return 'block'
    if (!hasPin(settings.pin)) return 'allow'
    if (action === 'settings') return 'pin'

    return rule
}

const requestActions: Record<string, KioskAction> = {
    'printer.print.cancel': 'cancelPrint',
    'printer.firmware_restart': 'restart',
    'printer.restart': 'restart',
    'machine.reboot': 'restart',
    'machine.shutdown': 'restart',
    'machine.services.restart': 'restart',
    'machine.services.stop': 'restart',
    'machine.device_power.off': 'restart',
    'server.files.delete_file': 'deleteFile',
    'server.files.delete_directory': 'deleteFile',
}

const gcodeActions: Record<string, KioskAction> = {
    CANCEL_PRINT: 'cancelPrint',
    FIRMWARE_RESTART: 'restart',
    RESTART: 'restart',
    SAVE_CONFIG: 'configEdit',
}

export const classifyRequest = (method: string, params: unknown): KioskAction | null => {
    if (method in requestActions) return requestActions[method]
    if (method !== 'printer.gcode.script' || !isObject(params) || typeof params.script !== 'string') return null

    for (const line of params.script.split('\n')) {
        const command = line.trim().split(/[\s;]/)[0].toUpperCase()
        if (command in gcodeActions) return gcodeActions[command]
    }

    return null
}

const isPageExposed = (page: string, hiddenPages: string[]): boolean => {
    return page === KIOSK_HOME_PAGE || !hiddenPages.includes(page)
}

export const resolveBottomBar = (chosen: string[], availablePages: string[], hiddenPages: string[]): string[] => {
    const pages = chosen.filter(
        (page, index) =>
            chosen.indexOf(page) === index && availablePages.includes(page) && isPageExposed(page, hiddenPages)
    )
    if (!pages.includes(KIOSK_HOME_PAGE)) pages.unshift(KIOSK_HOME_PAGE)

    return pages.slice(0, BOTTOM_BAR_MAX)
}

export const resolveMorePages = (bottomBar: string[], availablePages: string[], hiddenPages: string[]): string[] => {
    return availablePages.filter((page) => !bottomBar.includes(page) && isPageExposed(page, hiddenPages))
}

export const routeRule = (routeName: string | null | undefined, settings: KioskSettings): KioskActionRule => {
    if (!routeName) return 'allow'
    if (!isPageExposed(routeName, settings.hiddenPages)) return 'block'
    if (routeName === KIOSK_CONFIG_PAGE) return effectiveActionRule('configEdit', settings)

    return 'allow'
}

const SHELL_HOME_PAGE = 'home'
const SHELL_SETTINGS_PAGE = 'settings'
const SHELL_CONFIG_TAB = 'machine/config'

export const shellLocationRule = (
    location: { page: string; tab: string | null },
    settings: KioskSettings
): KioskActionRule => {
    if (location.page === SHELL_HOME_PAGE) return 'allow'
    if (location.page === SHELL_SETTINGS_PAGE) return effectiveActionRule('settings', settings)
    if (settings.hiddenShell.includes(location.page)) return 'block'

    const tab = `${location.page}/${location.tab}`
    if (settings.hiddenShell.includes(tab)) return 'block'
    if (tab === SHELL_CONFIG_TAB) return effectiveActionRule('configEdit', settings)

    return 'allow'
}

export const shellLockKey = (location: { page: string; tab: string | null }): string => {
    return location.page === SHELL_SETTINGS_PAGE ? location.page : `${location.page}/${location.tab}`
}

export const exposedShellPages = (pages: string[], settings: KioskSettings): string[] => {
    return pages.filter((page) => shellLocationRule({ page, tab: null }, settings) !== 'block')
}

export const hiddenShellTabs = (settings: KioskSettings): string[] => {
    const hidden = settings.hiddenShell.filter((entry) => entry.includes('/'))
    if (effectiveActionRule('configEdit', settings) === 'block') hidden.push(SHELL_CONFIG_TAB)

    return hidden
}

export const canRecoverOnSmallScreen = (settings: KioskSettings): boolean => settings.smallScreens !== 'apply'

export const kioskPanelSequence = (columns: string[][], hiddenPanels: string[]): string[] => {
    const rows = Math.max(0, ...columns.map((column) => column.length))
    const readingOrder = Array.from({ length: rows }, (_, row) => columns.map((column) => column[row])).flat()
    const panels = readingOrder.filter(
        (name) => name !== undefined && name !== KIOSK_STATUS_PANEL && !hiddenPanels.includes(name)
    )

    return [KIOSK_STATUS_PANEL, ...panels]
}

const statePanels: Record<DashboardLayoutState, string | null> = {
    idle: null,
    printing: 'print-hero',
    error: KIOSK_STATUS_PANEL,
}

export const resolveOpenPanel = (
    chosen: string | null,
    sequence: string[],
    layoutState: DashboardLayoutState
): string => {
    if (chosen !== null && sequence.includes(chosen)) return chosen

    const preferred = statePanels[layoutState]

    return preferred !== null && sequence.includes(preferred) ? preferred : sequence[0]
}

export const swipeDirection = (movement: { dx: number; dy: number }): 'next' | 'previous' | null => {
    const distance = Math.abs(movement.dx)
    if (distance < SWIPE_MIN_DISTANCE) return null
    if (Math.abs(movement.dy) > distance * SWIPE_MAX_SLOPE) return null

    return movement.dx < 0 ? 'next' : 'previous'
}
