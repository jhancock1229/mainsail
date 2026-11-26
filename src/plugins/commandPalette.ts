import {
    mdiAlertOctagonOutline,
    mdiCloseOctagonOutline,
    mdiCodeTags,
    mdiFileOutline,
    mdiFire,
    mdiHome,
    mdiPause,
    mdiPlay,
    mdiRestart,
    mdiSnowflake,
    mdiSwapHorizontal,
} from '@mdi/js'
import type { GuiPresetsStatePreset } from '@/store/gui/presets/types'

export type PaletteGroup = 'actions' | 'navigation' | 'macros' | 'files' | 'settings'
export type PaletteSectionKey = 'pinned' | 'recent' | PaletteGroup | 'unavailable'

export const paletteGroups: PaletteGroup[] = ['actions', 'navigation', 'macros', 'files', 'settings']

export type PaletteRun =
    | { type: 'route'; to: string }
    | { type: 'link'; href: string; target?: string }
    | { type: 'gcode'; scripts: string[] }
    | { type: 'socket'; method: string; loading: string }
    | { type: 'print'; filename: string }
    | { type: 'settings'; tab: string }
    | { type: 'setting'; name: string; value: string }

export interface PaletteCommand {
    id: string
    group: PaletteGroup
    title: string
    subtitle: string
    icon: string
    keywords: string[]
    confirmText: string | null
    danger: boolean
    disabledReason: string | null
    run: PaletteRun
}

export interface PaletteNaviPoint {
    title: string
    icon: string
    to?: string
    href?: string
    target?: string
}

export interface PaletteContext {
    socketConnected: boolean
    klipperState: string
    printerState: string
    naviPoints: PaletteNaviPoint[]
    macros: { name: string; description: string | null }[]
    hiddenMacros: string[]
    files: { filename: string; modified?: number | Date | null }[]
    presets: GuiPresetsStatePreset[]
    cooldownGcode: string
    confirmOnCoolDown: boolean
    settingsTabs: { name: string; title: string; icon: string }[]
    interfaceShell?: 'new' | 'classic'
    t: (key: string, values?: Record<string, unknown>) => string
}

export interface PaletteSettings {
    enabled: boolean
    shortcut: string
    pinned: string[]
    recent: string[]
}

export const DEFAULT_PALETTE_SHORTCUT = 'mod+k'
export const MAX_RECENT_COMMANDS = 8

const DEFAULT_MACRO_DESCRIPTION = 'G-Code macro'

const presetScripts = (preset: GuiPresetsStatePreset): string[] => {
    const scripts: string[] = []

    for (const [name, attributes] of Object.entries(preset.values ?? {})) {
        if (!attributes.bool) continue

        const [printerObject, printerObjectName = printerObject] = name.split(' ')
        if (printerObject === 'temperature_fan') {
            scripts.push(`SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${printerObjectName} TARGET=${attributes.value}`)
            continue
        }

        scripts.push(`SET_HEATER_TEMPERATURE HEATER=${printerObjectName} TARGET=${attributes.value}`)
    }

    if (preset.gcode) scripts.push(preset.gcode)

    return scripts
}

const presetSummary = (preset: GuiPresetsStatePreset): string => {
    return Object.entries(preset.values ?? {})
        .filter(([, attributes]) => attributes.bool)
        .map(([name, attributes]) => `${name.split(' ').pop()} ${attributes.value} °C`)
        .join(' · ')
}

const timestamp = (value: number | Date | null | undefined): number => {
    if (value instanceof Date) return value.getTime()

    return value ?? 0
}

export interface PaletteFileTreeEntry {
    isDirectory: boolean
    filename: string
    modified?: number | Date | null
    childrens?: PaletteFileTreeEntry[]
}

export const collectGcodeFiles = (
    directory: PaletteFileTreeEntry | null | undefined,
    extensions: string[],
    path = ''
): PaletteContext['files'] => {
    const files: PaletteContext['files'] = []

    ;(directory?.childrens ?? []).forEach((entry) => {
        if (entry.filename.startsWith('.')) return

        if (entry.isDirectory) {
            files.push(...collectGcodeFiles(entry, extensions, `${path}${entry.filename}/`))
            return
        }

        const extension = entry.filename.slice(entry.filename.lastIndexOf('.'))
        if (extensions.includes(extension)) files.push({ filename: path + entry.filename, modified: entry.modified })
    })

    return files
}

export const buildPaletteCommands = (context: PaletteContext): PaletteCommand[] => {
    const { t } = context
    const reason = (name: string): string => t(`CommandPalette.Reasons.${name}`)

    const online = context.socketConnected
    const connected = online && context.klipperState !== 'disconnected'
    const ready = online && context.klipperState === 'ready'
    const printing = ready && context.printerState === 'printing'
    const paused = ready && context.printerState === 'paused'
    const busy = printing || paused

    const notConnected = !online ? reason('NotConnected') : !connected ? reason('KlipperNotConnected') : null
    const notReady = notConnected ?? (!ready ? reason('KlipperNotReady') : null)
    const whileIdle = notReady ?? (busy ? reason('WhilePrinting') : null)

    const commands: PaletteCommand[] = []
    const usedIds = new Set<string>()
    const add = (
        command: Pick<PaletteCommand, 'id' | 'group' | 'title' | 'icon' | 'run'> & Partial<PaletteCommand>
    ): void => {
        let id = command.id
        for (let count = 2; usedIds.has(id); count++) id = `${command.id}~${count}`
        usedIds.add(id)

        commands.push({
            subtitle: '',
            keywords: [],
            confirmText: null,
            danger: false,
            disabledReason: null,
            ...command,
            id,
        })
    }

    add({
        id: 'action:home',
        group: 'actions',
        title: t('CommandPalette.Actions.Home'),
        icon: mdiHome,
        keywords: ['G28', 'homing'],
        disabledReason: whileIdle,
        run: { type: 'gcode', scripts: ['G28'] },
    })
    add({
        id: 'action:pause',
        group: 'actions',
        title: t('CommandPalette.Actions.Pause'),
        icon: mdiPause,
        disabledReason: notReady ?? (paused ? reason('AlreadyPaused') : !printing ? reason('NoPrintRunning') : null),
        run: { type: 'socket', method: 'printer.print.pause', loading: 'statusPrintPause' },
    })
    add({
        id: 'action:resume',
        group: 'actions',
        title: t('CommandPalette.Actions.Resume'),
        icon: mdiPlay,
        keywords: ['continue'],
        disabledReason: notReady ?? (!paused ? reason('NotPaused') : null),
        run: { type: 'socket', method: 'printer.print.resume', loading: 'statusPrintResume' },
    })
    add({
        id: 'action:cancel',
        group: 'actions',
        title: t('CommandPalette.Actions.Cancel'),
        icon: mdiCloseOctagonOutline,
        keywords: ['abort', 'stop'],
        confirmText: t('CommandPalette.Confirm.Cancel'),
        danger: true,
        disabledReason: notReady ?? (!busy ? reason('NoPrintRunning') : null),
        run: { type: 'socket', method: 'printer.print.cancel', loading: 'statusPrintCancel' },
    })
    add({
        id: 'action:cooldown',
        group: 'actions',
        title: t('CommandPalette.Actions.Cooldown'),
        icon: mdiSnowflake,
        keywords: ['heaters off', 'temperature'],
        confirmText: context.confirmOnCoolDown ? t('CommandPalette.Confirm.Cooldown') : null,
        disabledReason: whileIdle,
        run: { type: 'gcode', scripts: [context.cooldownGcode] },
    })
    add({
        id: 'action:firmwareRestart',
        group: 'actions',
        title: t('CommandPalette.Actions.FirmwareRestart'),
        icon: mdiRestart,
        keywords: ['FIRMWARE_RESTART', 'reboot', 'klipper'],
        confirmText: t('CommandPalette.Confirm.FirmwareRestart'),
        danger: true,
        disabledReason: notConnected,
        run: { type: 'socket', method: 'printer.firmware_restart', loading: 'firmwareRestart' },
    })
    add({
        id: 'action:emergencyStop',
        group: 'actions',
        title: t('CommandPalette.Actions.EmergencyStop'),
        icon: mdiAlertOctagonOutline,
        keywords: ['estop', 'e-stop', 'M112', 'kill', 'halt'],
        confirmText: t('CommandPalette.Confirm.EmergencyStop'),
        danger: true,
        disabledReason: notConnected ?? (context.klipperState === 'shutdown' ? reason('AlreadyShutdown') : null),
        run: { type: 'socket', method: 'printer.emergency_stop', loading: 'topbarEmergencyStop' },
    })

    if (context.interfaceShell !== undefined) {
        const next = context.interfaceShell === 'new' ? 'classic' : 'new'

        add({
            id: 'action:switchInterface',
            group: 'actions',
            title: t(
                next === 'classic' ? 'CommandPalette.Actions.SwitchToClassic' : 'CommandPalette.Actions.SwitchToNew'
            ),
            icon: mdiSwapHorizontal,
            keywords: ['interface', 'shell', 'layout', 'classic', 'new', 'stock'],
            run: { type: 'setting', name: 'uiSettings.interfaceShell', value: next },
        })
    }

    context.presets.forEach((preset) => {
        add({
            id: `preset:${preset.id ?? preset.name}`,
            group: 'actions',
            title: t('CommandPalette.Actions.Preheat', { name: preset.name }),
            subtitle: presetSummary(preset),
            icon: mdiFire,
            keywords: ['preset', 'temperature'],
            disabledReason: whileIdle,
            run: { type: 'gcode', scripts: presetScripts(preset) },
        })
    })

    const naviTarget = (point: PaletteNaviPoint): string | undefined => point.to ?? point.href
    const sharedTarget = (target: string): boolean =>
        context.naviPoints.filter((point) => naviTarget(point) === target).length > 1
    context.naviPoints.forEach((point) => {
        const target = naviTarget(point)
        if (!target) return

        add({
            id: sharedTarget(target) ? `nav:${target}|${point.title}` : `nav:${target}`,
            group: 'navigation',
            title: point.title,
            icon: point.icon,
            run: point.to
                ? { type: 'route', to: point.to }
                : { type: 'link', href: point.href ?? '', target: point.target },
        })
    })

    const hiddenMacros = context.hiddenMacros.map((name) => name.toLowerCase())
    context.macros.forEach((macro) => {
        if (hiddenMacros.includes(macro.name.toLowerCase())) return

        const description = macro.description ?? ''

        add({
            id: `macro:${macro.name}`,
            group: 'macros',
            title: macro.name,
            subtitle: description === DEFAULT_MACRO_DESCRIPTION ? '' : description,
            icon: mdiCodeTags,
            disabledReason: notReady,
            run: { type: 'gcode', scripts: [macro.name] },
        })
    })

    ;[...context.files]
        .sort((a, b) => timestamp(b.modified) - timestamp(a.modified))
        .forEach((file) => {
            const slash = file.filename.lastIndexOf('/')

            add({
                id: `file:${file.filename}`,
                group: 'files',
                title: file.filename.slice(slash + 1),
                subtitle: file.filename.slice(0, slash + 1),
                icon: mdiFileOutline,
                disabledReason: whileIdle,
                run: { type: 'print', filename: file.filename },
            })
        })

    context.settingsTabs.forEach((tab) => {
        add({
            id: `settings:${tab.name}`,
            group: 'settings',
            title: tab.title,
            icon: tab.icon,
            keywords: [tab.name.replace(/-/g, ' ')],
            run: { type: 'settings', tab: tab.name },
        })
    })

    return commands
}

export interface FuzzyMatch {
    score: number
    positions: number[]
}

const SCORE_EXACT = 1000
const SCORE_PREFIX = 900
const SCORE_WORD_START = 800
const SCORE_INSIDE = 700
const SCORE_INITIALS = 400
const SCORE_CONSECUTIVE = 30
const SCORE_BOUNDARY = 40
const SCORE_GAP = 4
const SCORE_SCATTERED = 60
const SCORE_INITIALS_MAX = 650
const LENGTH_PENALTY = 0.5
const LENGTH_PENALTY_MAX = 40
const GROUP_KEYWORDS: Record<PaletteGroup, string[]> = {
    actions: ['action', 'printer'],
    navigation: ['go to', 'goto', 'open', 'page'],
    macros: ['macro'],
    files: ['print', 'start', 'file', 'gcode'],
    settings: ['settings', 'preferences', 'options'],
}
const MIN_GROUP_KEYWORD_LENGTH = 4
const SCORE_GROUP_KEYWORD = 300
const SECONDARY_WEIGHT = 0.6
const MIN_SECONDARY_SCORE = SCORE_INSIDE - LENGTH_PENALTY_MAX
const BOOST_PINNED = 80
const BOOST_RECENT = 60

const isBoundary = (text: string, index: number): boolean => {
    if (index === 0) return true

    const previous = text[index - 1]
    const current = text[index]
    if (/[\s_\-./:]/.test(previous)) return true

    return previous === previous.toLowerCase() && current !== current.toLowerCase() && /[a-z]/i.test(previous)
}

const range = (start: number, length: number): number[] => Array.from({ length }, (_, index) => start + index)

const lengthPenalty = (text: string): number => Math.min(LENGTH_PENALTY_MAX, text.length * LENGTH_PENALTY)

const nextInitial = (char: string, text: string, lower: string, from: number): number => {
    if (lower[from] === char) return from

    let fallback = -1
    for (let index = from + 1; index < lower.length; index++) {
        if (lower[index] !== char) continue
        if (isBoundary(text, index)) return index
        if (fallback === -1) fallback = index
    }

    return fallback
}

const matchInitials = (query: string, text: string, lower: string, start: number): FuzzyMatch | null => {
    const positions: number[] = []
    let score = SCORE_INITIALS

    for (const char of query) {
        const previous = positions[positions.length - 1]
        const index = nextInitial(char, text, lower, previous === undefined ? start : previous + 1)
        if (index === -1) return null

        if (previous !== undefined && index === previous + 1) score += SCORE_CONSECUTIVE
        else if (isBoundary(text, index)) score += SCORE_BOUNDARY
        else score -= SCORE_SCATTERED
        if (previous !== undefined) score -= (index - previous - 1) * SCORE_GAP

        positions.push(index)
    }

    if (score < SCORE_INITIALS) return null

    return { score: Math.min(SCORE_INITIALS_MAX, score), positions }
}

export const fuzzyMatch = (query: string, text: string): FuzzyMatch | null => {
    const needle = query.trim().toLowerCase()
    const lower = text.toLowerCase()
    if (!needle || !lower) return null

    const penalty = lengthPenalty(text)
    if (lower === needle) return { score: SCORE_EXACT, positions: range(0, needle.length) }
    if (lower.startsWith(needle)) return { score: SCORE_PREFIX - penalty, positions: range(0, needle.length) }

    let inside = -1
    for (let index = lower.indexOf(needle); index !== -1; index = lower.indexOf(needle, index + 1)) {
        if (isBoundary(text, index)) {
            return { score: SCORE_WORD_START - penalty, positions: range(index, needle.length) }
        }
        if (inside === -1) inside = index
    }
    if (inside !== -1) return { score: SCORE_INSIDE - penalty, positions: range(inside, needle.length) }

    let best: FuzzyMatch | null = null
    for (let start = 0; start < lower.length; start++) {
        if (lower[start] !== needle[0] || !isBoundary(text, start)) continue

        const match = matchInitials(needle, text, lower, start)
        if (match && (best === null || match.score > best.score)) best = match
    }

    return best ? { score: best.score - penalty, positions: best.positions } : null
}

export const highlightSegments = (title: string, positions: number[]): { text: string; match: boolean }[] => {
    const matched = new Set(positions)
    const segments: { text: string; match: boolean }[] = []

    Array.from({ length: title.length }, (_, index) => index).forEach((index) => {
        const match = matched.has(index)
        const last = segments[segments.length - 1]
        if (last && last.match === match) last.text += title[index]
        else segments.push({ text: title[index], match })
    })

    return segments
}

export interface PaletteResult {
    command: PaletteCommand
    positions: number[]
    pinned: boolean
    score: number
}

export interface PaletteSection {
    key: PaletteSectionKey
    results: PaletteResult[]
    total: number
}

export interface PaletteSearchOptions {
    pinned: string[]
    recent: string[]
    browseLimit?: number
    searchLimit?: number
}

const DEFAULT_BROWSE_LIMIT = 7
const DEFAULT_SEARCH_LIMIT = 12

const section = (key: PaletteSectionKey, results: PaletteResult[], limit = results.length): PaletteSection => ({
    key,
    results: results.slice(0, limit),
    total: results.length,
})

const browsePaletteCommands = (commands: PaletteCommand[], options: PaletteSearchOptions): PaletteSection[] => {
    const limit = options.browseLimit ?? DEFAULT_BROWSE_LIMIT
    const byId = new Map(commands.map((command) => [command.id, command]))
    const shown = new Set<string>()
    const pick = (list: string[], pinned: boolean, keepDisabled: boolean): PaletteResult[] => {
        const results: PaletteResult[] = []
        list.forEach((id) => {
            const command = byId.get(id)
            if (!command || shown.has(id)) return
            if (!keepDisabled && command.disabledReason !== null) return

            shown.add(id)
            results.push({ command, positions: [], pinned, score: 0 })
        })

        return results
    }

    const sections = [
        section('pinned', pick(options.pinned, true, true)),
        section('recent', pick(options.recent, false, false)),
    ]
    paletteGroups.forEach((group) => {
        const ids = commands.filter((command) => command.group === group).map((command) => command.id)
        sections.push(section(group, pick(ids, false, false), limit))
    })

    return sections.filter((entry) => entry.results.length > 0)
}

const stripGroupPhrase = (query: string, group: PaletteGroup): string | null => {
    for (const keyword of GROUP_KEYWORDS[group]) {
        if (!keyword.includes(' ')) continue
        if (query === keyword) return ''
        if (query.startsWith(`${keyword} `)) return query.slice(keyword.length + 1)
    }

    return null
}

const scoreCommand = (command: PaletteCommand, terms: string[]): { score: number; positions: number[] } | null => {
    let score = 0
    const positions = new Set<number>()

    for (const term of terms) {
        const title = fuzzyMatch(term, command.title)
        const secondary = [command.subtitle, ...command.keywords]
            .map((text) => fuzzyMatch(term, text)?.score ?? 0)
            .filter((value) => value >= MIN_SECONDARY_SCORE)
            .reduce((best, value) => Math.max(best, value * SECONDARY_WEIGHT), 0)
        const group =
            term.length >= MIN_GROUP_KEYWORD_LENGTH &&
            GROUP_KEYWORDS[command.group].some((keyword) => keyword.startsWith(term))
        if (title === null && secondary === 0 && !group) return null

        if (title !== null && title.score >= secondary) {
            title.positions.forEach((position) => positions.add(position))
            score += title.score
            continue
        }

        score += secondary || SCORE_GROUP_KEYWORD
    }

    return { score: score / terms.length, positions: [...positions].sort((a, b) => a - b) }
}

export const searchPaletteCommands = (
    commands: PaletteCommand[],
    query: string,
    options: PaletteSearchOptions
): PaletteSection[] => {
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ')
    const terms = normalized.split(' ').filter(Boolean)
    if (!terms.length) return browsePaletteCommands(commands, options)

    const match = (command: PaletteCommand): { score: number; positions: number[] } | null => {
        const rest = stripGroupPhrase(normalized, command.group)
        if (rest === '') return { score: SCORE_GROUP_KEYWORD, positions: [] }

        return (rest !== null ? scoreCommand(command, rest.split(' ')) : null) ?? scoreCommand(command, terms)
    }

    const limit = options.searchLimit ?? DEFAULT_SEARCH_LIMIT
    const results: PaletteResult[] = []
    commands.forEach((command) => {
        const matched = match(command)
        if (matched === null) return

        const pinned = options.pinned.includes(command.id)
        const recentIndex = options.recent.indexOf(command.id)
        const recentBoost = recentIndex === -1 ? 0 : BOOST_RECENT * (1 - recentIndex / (options.recent.length + 1))

        results.push({
            command,
            positions: matched.positions,
            pinned,
            score: matched.score + (pinned ? BOOST_PINNED : 0) + recentBoost,
        })
    })
    results.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))

    const available = results.filter((result) => result.command.disabledReason === null)
    const unavailable = results.filter((result) => result.command.disabledReason !== null)

    const groups = [...new Set(available.map((result) => result.command.group))]
    const sections = groups.map((group) =>
        section(
            group,
            available.filter((result) => result.command.group === group),
            limit
        )
    )
    if (unavailable.length) sections.push(section('unavailable', unavailable, limit))

    return sections
}

export const flattenPaletteSections = (sections: PaletteSection[]): PaletteResult[] => {
    return sections.flatMap((entry) => entry.results)
}

export const nextSelectableIndex = (
    results: { command: { disabledReason: string | null } }[],
    current: number,
    delta: 1 | -1
): number => {
    const count = results.length
    for (let step = 1; step <= count; step++) {
        const start = current < 0 && delta === -1 ? 0 : current
        const index = (((start + step * delta) % count) + count) % count
        if (results[index].command.disabledReason === null) return index
    }

    return -1
}

export const keepSelection = (
    results: { command: { id: string; disabledReason: string | null } }[],
    selectedId: string | null
): string | null => {
    const selected = results.find((result) => result.command.id === selectedId)

    return selected && selected.command.disabledReason === null ? selected.command.id : null
}

export const addRecentCommand = (recent: string[], id: string, max = MAX_RECENT_COMMANDS): string[] => {
    return [id, ...recent.filter((entry) => entry !== id)].slice(0, max)
}

export const togglePinnedCommand = (pinned: string[], id: string): string[] => {
    return pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id]
}

export interface ShortcutEvent {
    key: string
    code?: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    shiftKey: boolean
}

export type ShortcutError = 'NeedsModifier' | 'Unsupported' | 'Reserved'

const MODIFIER_KEYS = ['control', 'shift', 'alt', 'meta', 'altgraph', 'capslock', 'os', 'dead', 'unidentified']
const UNSUPPORTED_KEYS = [
    'escape',
    'enter',
    'tab',
    'backspace',
    'delete',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
    'home',
    'end',
    'pageup',
    'pagedown',
]
// browser shortcuts cannot be intercepted reliably
const RESERVED_SHORTCUTS = [
    'mod+a',
    'mod+c',
    'mod+f',
    'mod+l',
    'mod+n',
    'mod+q',
    'mod+r',
    'mod+s',
    'mod+t',
    'mod+v',
    'mod+w',
    'mod+x',
    'mod+z',
    'mod+shift+n',
    'mod+shift+s',
    'mod+shift+t',
    'mod+shift+w',
    'mod+shift+z',
    'f5',
    'f11',
    'f12',
]
const MODIFIER_ORDER = ['mod', 'ctrl', 'meta', 'alt', 'shift']
const MAC_KEY_SYMBOLS: Record<string, string> = { mod: '⌘', ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧' }
const KEY_NAMES: Record<string, string> = {
    mod: 'Ctrl',
    ctrl: 'Ctrl',
    meta: 'Meta',
    alt: 'Alt',
    shift: 'Shift',
    space: 'Space',
}
const CODE_KEYS: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
}

const keyFromCode = (code: string): string | null => {
    if (/^(Key[A-Z]|Digit\d)$/.test(code)) return code.slice(-1).toLowerCase()

    return CODE_KEYS[code] ?? null
}

export const shortcutFromEvent = (event: ShortcutEvent, isMac: boolean): string | null => {
    let key = (event.key ?? '').toLowerCase()

    // with Alt, event.key is the altered character (Option+P is "π" on macOS) or "Dead"
    const code = event.code ?? ''
    const letterOrDigit = /^(Key[A-Z]|Digit\d)$/.test(code)
    if (event.altKey && letterOrDigit && !/^[a-z0-9]$/.test(key)) key = code.slice(-1).toLowerCase()
    else if (!/^[!-~]$/.test(key)) key = keyFromCode(code) ?? key
    if (MODIFIER_KEYS.includes(key)) return null
    if (key === ' ') key = 'space'
    if (key === '+') key = 'plus'
    if (!key) return null

    const parts: string[] = []
    if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod')
    if (isMac && event.ctrlKey) parts.push('ctrl')
    if (!isMac && event.metaKey) parts.push('meta')
    if (event.altKey) parts.push('alt')
    if (event.shiftKey) parts.push('shift')

    return [...parts, key].join('+')
}

export const normalizeShortcut = (shortcut: string, isMac: boolean): string => {
    const parts = shortcut.split('+')
    const foreign = isMac ? 'meta' : 'ctrl'
    const modifiers = parts.slice(0, -1).map((modifier) => (modifier === foreign ? 'mod' : modifier))

    return [...MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier)), parts[parts.length - 1]].join('+')
}

export const matchesShortcut = (event: ShortcutEvent, shortcut: string, isMac: boolean): boolean => {
    return shortcutFromEvent(event, isMac) === normalizeShortcut(shortcut, isMac)
}

export const validateShortcut = (shortcut: string): ShortcutError | null => {
    const parts = shortcut.split('+')
    const key = parts[parts.length - 1]
    const modifiers = parts.slice(0, -1)

    if (UNSUPPORTED_KEYS.includes(key)) return 'Unsupported'
    if (modifiers.some((modifier) => !MODIFIER_ORDER.includes(modifier))) return 'Unsupported'

    const isFunctionKey = /^f\d{1,2}$/.test(key)
    const hasModifier = modifiers.some((modifier) => modifier !== 'shift')
    if (!key || (!hasModifier && !isFunctionKey)) return 'NeedsModifier'

    const variants = [shortcut, normalizeShortcut(shortcut, true), normalizeShortcut(shortcut, false)]
    if (variants.some((variant) => RESERVED_SHORTCUTS.includes(variant))) return 'Reserved'

    return null
}

export const formatShortcut = (shortcut: string, isMac: boolean, translate: (key: string) => string): string[] => {
    return normalizeShortcut(shortcut, isMac)
        .split('+')
        .map((part) => {
            if (isMac && part in MAC_KEY_SYMBOLS) return MAC_KEY_SYMBOLS[part]
            if (part in KEY_NAMES) return translate(`CommandPalette.Keys.${KEY_NAMES[part]}`)
            if (part === 'plus') return '+'

            return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
        })
}

export const isEditorSearchTarget = (target: unknown): boolean => {
    const element = target as { closest?: (selector: string) => unknown } | null
    if (typeof element?.closest !== 'function') return false

    return element.closest('.cm-panels') !== null
}

export const getDefaultPaletteSettings = (): PaletteSettings => ({
    enabled: true,
    shortcut: DEFAULT_PALETTE_SHORTCUT,
    pinned: [],
    recent: [],
})

const stringList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []

    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry !== ''))]
}

export const sanitizePaletteSettings = (raw: unknown): PaletteSettings => {
    const defaults = getDefaultPaletteSettings()
    if (typeof raw !== 'object' || raw === null) return defaults

    const stored = raw as Record<string, unknown>
    const shortcut = typeof stored.shortcut === 'string' && validateShortcut(stored.shortcut) === null

    return {
        enabled: typeof stored.enabled === 'boolean' ? stored.enabled : defaults.enabled,
        shortcut: shortcut ? (stored.shortcut as string) : defaults.shortcut,
        pinned: stringList(stored.pinned),
        recent: stringList(stored.recent),
    }
}
