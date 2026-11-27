import { sha256 } from 'js-sha256'
import type { DashboardLayoutState } from '@/plugins/dashboardLayoutState'
import { shellPages } from '@/plugins/shellNavigation'

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

export const CONFIG_ROOT = 'config'
export const MACRO_DEPTH_LIMIT = 6

type RequestParams = Record<string, unknown>
type RequestClassifier = (params: RequestParams) => KioskAction[]

const inConfigRoot = (value: unknown): boolean => {
    return typeof value === 'string' && (value === CONFIG_ROOT || value.startsWith(`${CONFIG_ROOT}/`))
}

const withConfigEdit = (actions: KioskAction[], ...paths: unknown[]): KioskAction[] => {
    return paths.some(inConfigRoot) ? [...actions, 'configEdit'] : actions
}

const always =
    (...actions: KioskAction[]): RequestClassifier =>
    () =>
        actions

export const guardedRequests: Record<string, RequestClassifier> = {
    'printer.print.cancel': always('cancelPrint'),
    'printer.firmware_restart': always('restart'),
    'printer.restart': always('restart'),
    'server.restart': always('restart'),
    'machine.reboot': always('restart'),
    'machine.shutdown': always('restart'),
    'machine.services.restart': always('restart'),
    'machine.services.stop': always('restart'),
    'machine.services.start': always('restart'),
    'machine.update.full': always('restart'),
    'machine.update.system': always('restart'),
    'machine.update.client': always('restart'),
    'machine.update.recover': always('restart'),
    'machine.device_power.off': always('restart'),
    'machine.device_power.post_device': (params) => (params.action === 'on' ? [] : ['restart']),
    'server.files.delete_file': (params) => withConfigEdit(['deleteFile'], params.path),
    'server.files.delete_directory': (params) => withConfigEdit(['deleteFile'], params.path),
    'server.files.move': (params) => withConfigEdit(['deleteFile'], params.source, params.dest),
    'server.files.copy': (params) => withConfigEdit([], params.dest),
    'server.files.post_directory': (params) => withConfigEdit([], params.path),
    'server.files.zip': (params) => withConfigEdit([], params.dest),
    'server.files.upload': (params) => withConfigEdit([], params.root),
}

export const guardedRequestPrefixes: Record<string, RequestClassifier> = {
    'machine.update.': always('restart'),
}

const READS = 'only reads data'
const PRINT_FLOW = 'starts, pauses or queues prints, which an operator is there to do'
const PREFERENCES = 'stores interface preferences; the settings page itself follows the settings rule'

export const unguardedRequests: Record<string, string> = {
    'printer.emergency_stop': 'the emergency stop is never restricted',
    'printer.gcode.script': 'classified line by line, see classifyGcode',
    'printer.info': READS,
    'printer.objects.list': READS,
    'printer.objects.query': READS,
    'printer.objects.subscribe': READS,
    'printer.query_endstops.status': READS,
    'printer.print.start': PRINT_FLOW,
    'printer.print.pause': PRINT_FLOW,
    'printer.print.resume': PRINT_FLOW,
    'server.job_queue.status': READS,
    'server.job_queue.post_job': PRINT_FLOW,
    'server.job_queue.delete_job': PRINT_FLOW,
    'server.job_queue.pause': PRINT_FLOW,
    'server.job_queue.start': PRINT_FLOW,
    'machine.device_power.devices': READS,
    'machine.device_power.on': 'switching a device on does not interrupt anything',
    'machine.peripherals.canbus': READS,
    'machine.peripherals.serial': READS,
    'machine.peripherals.usb': READS,
    'machine.peripherals.video': READS,
    'machine.proc_stats': READS,
    'machine.system_info': READS,
    'machine.update.status': READS,
    'machine.update.refresh': READS,
    'machine.timelapse.get_settings': READS,
    'machine.timelapse.lastframeinfo': READS,
    'machine.timelapse.post_settings': PREFERENCES,
    'machine.timelapse.render': 'renders a timelapse from frames that stay in place',
    'machine.timelapse.saveframes': 'copies the frames into an archive',
    'server.announcements.list': READS,
    'server.announcements.dismiss': 'dismisses a notice',
    'server.config': READS,
    'server.connection.identify': READS,
    'server.info': READS,
    'server.gcode_store': READS,
    'server.temperature_store': READS,
    'server.sensors.list': READS,
    'server.database.list': READS,
    'server.database.get_item': READS,
    'server.database.item': PREFERENCES,
    'server.database.post_item': PREFERENCES,
    'server.database.delete_item': PREFERENCES,
    'server.files.list': READS,
    'server.files.get_directory': READS,
    'server.files.metadata': READS,
    'server.files.metascan': READS,
    'server.history.list': READS,
    'server.history.totals': READS,
    'server.history.job': 'removes entries of the print history, not files; only offered on the history page',
    'server.history.delete_job': 'removes entries of the print history, not files; only offered on the history page',
    'server.history.reset_totals': 'only offered by the reset on the settings page',
    'server.logs.rollover': 'starts new log files, the old ones are kept',
    'server.spoolman.get_spool_id': READS,
    'server.spoolman.post_spool_id': 'chooses the loaded spool',
    'server.spoolman.proxy': 'talks to Spoolman, which has its own data',
    'server.webcams.list': READS,
    'server.webcams.post_item': PREFERENCES,
    'server.webcams.delete_item': PREFERENCES,
}

const gcodeActions: Record<string, KioskAction> = {
    CANCEL_PRINT: 'cancelPrint',
    FIRMWARE_RESTART: 'restart',
    RESTART: 'restart',
    SAVE_CONFIG: 'configEdit',
}

const remoteMethodActions: Record<string, KioskAction> = {
    shutdown_machine: 'restart',
    reboot_machine: 'restart',
}

export interface KioskMacros {
    bodies: Record<string, string>
    renamed: Record<string, string>
}

const MACRO_PREFIX = 'gcode_macro '
const DELAYED_PREFIX = 'delayed_gcode '
const DELAYED_KEY = 'UPDATE_DELAYED_GCODE '

export const buildKioskMacros = (config: unknown): KioskMacros => {
    const macros: KioskMacros = { bodies: {}, renamed: {} }
    if (!isObject(config)) return macros

    Object.entries(config).forEach(([section, values]) => {
        if (!isObject(values) || typeof values.gcode !== 'string') return

        const lower = section.toLowerCase()
        if (lower.startsWith(MACRO_PREFIX)) {
            const name = section.slice(MACRO_PREFIX.length).trim().toUpperCase()
            macros.bodies[name] = values.gcode
            if (typeof values.rename_existing === 'string') {
                macros.renamed[values.rename_existing.trim().toUpperCase()] = name
            }
        }
        if (lower.startsWith(DELAYED_PREFIX)) {
            macros.bodies[DELAYED_KEY + section.slice(DELAYED_PREFIX.length).trim().toUpperCase()] = values.gcode
        }
    })

    return macros
}

const emptyMacros: KioskMacros = { bodies: {}, renamed: {} }

const commandLine = (line: string): string => {
    return line
        .replace(/\{%.*?%\}/g, ' ')
        .replace(/^\s*N\d+\s+/i, '')
        .replace(/\*\d+\s*$/, '')
        .trim()
}

const delayedKey = (line: string): string | null => {
    const id = /\bID\s*=\s*([\w-]+)/i.exec(line)

    return id ? DELAYED_KEY + id[1].toUpperCase() : null
}

export const classifyGcode = (
    script: string,
    macros: KioskMacros = emptyMacros,
    depth: number = 0,
    path: string[] = []
): KioskAction[] => {
    const found = new Set<KioskAction>()

    script.split('\n').forEach((raw) => {
        const remote = /action_call_remote_method\(\s*["'](\w+)["']/.exec(raw)
        if (remote && remote[1] in remoteMethodActions) found.add(remoteMethodActions[remote[1]])

        const line = commandLine(raw)
        const command = line.split(/[\s;]/)[0].toUpperCase()
        if (command === '') return

        const original = macros.renamed[command] ?? command
        if (original in gcodeActions) found.add(gcodeActions[original])
        if (command in gcodeActions) found.add(gcodeActions[command])

        const key = command === DELAYED_KEY.trim() ? delayedKey(line) : command
        if (key === null || !(key in macros.bodies) || path.includes(key) || depth >= MACRO_DEPTH_LIMIT) return

        classifyGcode(macros.bodies[key], macros, depth + 1, [...path, key]).forEach((action) => found.add(action))
    })

    return kioskActions.filter((action) => found.has(action))
}

export const classifyRequest = (method: string, params: unknown, macros: KioskMacros = emptyMacros): KioskAction[] => {
    const fields = isObject(params) ? params : {}
    if (method === 'printer.gcode.script') {
        return typeof fields.script === 'string' ? classifyGcode(fields.script, macros) : []
    }
    if (method in guardedRequests) return guardedRequests[method](fields)
    if (method in unguardedRequests) return []

    const prefix = Object.keys(guardedRequestPrefixes).find((entry) => method.startsWith(entry))

    return prefix === undefined ? [] : guardedRequestPrefixes[prefix](fields)
}

export const isRequestKnown = (method: string): boolean => {
    return (
        method in guardedRequests ||
        method in unguardedRequests ||
        Object.keys(guardedRequestPrefixes).some((entry) => method.startsWith(entry))
    )
}

const FILES_PATH = '/server/files/'
const DIRECTORY_PATH = '/server/files/directory'
const httpWrites = ['POST', 'DELETE', 'PUT', 'PATCH']

export const httpRequestMethod = (verb: string, path: string): string | null => {
    const upper = verb.toUpperCase()
    if (!httpWrites.includes(upper)) return null

    const clean = path.split(/[?#]/)[0].replace(/\/+$/, '')
    if (upper === 'DELETE' && clean === DIRECTORY_PATH) return 'server.files.delete_directory'
    if (upper === 'DELETE' && clean.startsWith(FILES_PATH)) return 'server.files.delete_file'
    if (upper === 'POST' && clean === DIRECTORY_PATH) return 'server.files.post_directory'

    return clean.replace(/^\/+/, '').replace(/\//g, '.')
}

export const classifyHttpRequest = (
    verb: string,
    path: string,
    fields: Record<string, unknown>,
    macros: KioskMacros = emptyMacros
): KioskAction[] => {
    const method = httpRequestMethod(verb, path)
    if (method === null) return []

    const clean = path.split(/[?#]/)[0]
    const params =
        method === 'server.files.delete_file' && clean !== DIRECTORY_PATH
            ? { ...fields, path: decodeURIComponent(clean.slice(FILES_PATH.length)) }
            : fields

    return classifyRequest(method, params, macros)
}

export const combinedActionRule = (
    actions: KioskAction[],
    settings: KioskSettings,
    granted: KioskAction[] = []
): { rule: KioskActionRule; action: KioskAction | null } => {
    const rules = actions.map((action) => ({ action, rule: effectiveActionRule(action, settings) }))
    const blocked = rules.find((entry) => entry.rule === 'block')
    if (blocked) return blocked

    const needsPin = rules.find((entry) => entry.rule === 'pin' && !granted.includes(entry.action))

    return needsPin ?? { rule: 'allow', action: null }
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

const pageHasTabs = (page: string): boolean => {
    return (shellPages.find((entry) => entry.id === page)?.tabs.length ?? 0) > 0
}

export const shellLocationRule = (
    location: { page: string; tab: string | null },
    settings: KioskSettings
): KioskActionRule => {
    if (location.page === SHELL_HOME_PAGE) return 'allow'
    if (location.page === SHELL_SETTINGS_PAGE) return effectiveActionRule('settings', settings)
    if (settings.hiddenShell.includes(location.page)) return 'block'
    if (location.tab === null) return pageHasTabs(location.page) ? 'block' : 'allow'

    const tab = `${location.page}/${location.tab}`
    if (settings.hiddenShell.includes(tab)) return 'block'
    if (tab === SHELL_CONFIG_TAB) return effectiveActionRule('configEdit', settings)

    return 'allow'
}

export const shellLockKey = (location: { page: string; tab: string | null }): string => {
    return location.page === SHELL_SETTINGS_PAGE ? location.page : `${location.page}/${location.tab}`
}

export const exposedShellPages = (
    locations: { page: string; tab: string | null }[],
    settings: KioskSettings
): string[] => {
    return locations.filter((location) => shellLocationRule(location, settings) !== 'block').map((entry) => entry.page)
}

export const hiddenShellTabs = (settings: KioskSettings): string[] => {
    const hidden = settings.hiddenShell.filter((entry) => entry.includes('/'))
    if (effectiveActionRule('configEdit', settings) === 'block') hidden.push(SHELL_CONFIG_TAB)

    return hidden
}

export const canRecoverOnSmallScreen = (settings: KioskSettings): boolean => settings.smallScreens !== 'apply'

export const onDemandPanels = ['webcam', 'temperature', 'miniconsole', 'print-hero']

export const onDemandPanelRenders = (
    name: string,
    state: { klipperReady: boolean; klipperConnected: boolean; heroVisible: boolean }
): boolean => {
    if (name === 'temperature') return state.klipperReady
    if (name === 'miniconsole') return state.klipperConnected
    if (name === 'print-hero') return state.heroVisible

    return true
}

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
