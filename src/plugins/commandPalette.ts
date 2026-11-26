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
} from '@mdi/js'
import type { GuiPresetsStatePreset } from '@/store/gui/presets/types'

// Pure logic of the command palette: which commands exist in the current printer state, how they are searched
// and ranked, and how the keyboard shortcut is recorded and matched. No store, no DOM, so it can be unit tested.

export type PaletteGroup = 'actions' | 'navigation' | 'macros' | 'files' | 'settings'
export type PaletteSectionKey = 'pinned' | 'recent' | PaletteGroup | 'unavailable'

// order of the groups while browsing without a search term
export const paletteGroups: PaletteGroup[] = ['actions', 'navigation', 'macros', 'files', 'settings']

export type PaletteRun =
    | { type: 'route'; to: string }
    | { type: 'link'; href: string; target?: string }
    | { type: 'gcode'; scripts: string[] }
    | { type: 'socket'; method: string; loading: string }
    | { type: 'print'; filename: string }
    | { type: 'settings'; tab: string }

export interface PaletteCommand {
    id: string
    group: PaletteGroup
    title: string
    subtitle: string
    icon: string
    keywords: string[]
    // a text makes the palette ask for confirmation before running the command
    confirmText: string | null
    // a reason makes the command unavailable in the current printer state
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
    // 'disconnected' while Klipper is not connected to Moonraker
    klipperState: string
    printerState: string
    naviPoints: PaletteNaviPoint[]
    macros: { name: string; description: string | null }[]
    // filename is the path below the gcodes root
    files: { filename: string; modified?: number | Date | null }[]
    presets: GuiPresetsStatePreset[]
    cooldownGcode: string
    settingsTabs: { name: string; title: string; icon: string }[]
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

// ---------------------------------------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------------------------------------

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

// all printable files below a directory of the file tree, with their path relative to it
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

        const extension = entry.filename.slice(entry.filename.lastIndexOf('.')).toLowerCase()
        if (extensions.includes(extension)) files.push({ filename: path + entry.filename, modified: entry.modified })
    })

    return files
}

export const buildPaletteCommands = (context: PaletteContext): PaletteCommand[] => {
    const { t } = context
    const reason = (name: string): string => t(`CommandPalette.Reasons.${name}`)

    const connected = context.klipperState !== 'disconnected'
    const ready = context.klipperState === 'ready'
    // print_stats can be stale while Klipper is not ready, so the print state only counts while it is
    const printing = ready && context.printerState === 'printing'
    const paused = ready && context.printerState === 'paused'
    const busy = printing || paused

    const notReady = !connected ? reason('KlipperNotConnected') : !ready ? reason('KlipperNotReady') : null
    const whileIdle = notReady ?? (busy ? reason('WhilePrinting') : null)

    const commands: PaletteCommand[] = []
    const add = (
        command: Pick<PaletteCommand, 'id' | 'group' | 'title' | 'icon' | 'run'> & Partial<PaletteCommand>
    ): void => {
        commands.push({ subtitle: '', keywords: [], confirmText: null, disabledReason: null, ...command })
    }

    // printer actions
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
        disabledReason: notReady ?? (!busy ? reason('NoPrintRunning') : null),
        run: { type: 'socket', method: 'printer.print.cancel', loading: 'statusPrintCancel' },
    })
    add({
        id: 'action:cooldown',
        group: 'actions',
        title: t('CommandPalette.Actions.Cooldown'),
        icon: mdiSnowflake,
        keywords: ['heaters off', 'temperature', 'preset'],
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
        disabledReason: !connected ? reason('KlipperNotConnected') : null,
        run: { type: 'socket', method: 'printer.firmware_restart', loading: 'firmwareRestart' },
    })
    add({
        id: 'action:emergencyStop',
        group: 'actions',
        title: t('CommandPalette.Actions.EmergencyStop'),
        icon: mdiAlertOctagonOutline,
        keywords: ['estop', 'e-stop', 'M112', 'kill', 'halt'],
        confirmText: t('CommandPalette.Confirm.EmergencyStop'),
        disabledReason: !connected
            ? reason('KlipperNotConnected')
            : context.klipperState === 'shutdown'
              ? reason('AlreadyShutdown')
              : null,
        run: { type: 'socket', method: 'printer.emergency_stop', loading: 'topbarEmergencyStop' },
    })

    // last, so many presets cannot push the other actions out of the shortened list
    context.presets.forEach((preset) => {
        add({
            id: `preset:${preset.id ?? preset.name}`,
            group: 'actions',
            title: t('CommandPalette.Actions.Preheat', { name: preset.name }),
            subtitle: presetSummary(preset),
            icon: mdiFire,
            keywords: ['preset', 'heat', 'temperature'],
            disabledReason: whileIdle,
            run: { type: 'gcode', scripts: presetScripts(preset) },
        })
    })

    // pages of the sidebar
    context.naviPoints.forEach((point) => {
        const target = point.to ?? point.href
        if (!target) return

        add({
            id: `nav:${target}`,
            group: 'navigation',
            title: point.title,
            icon: point.icon,
            keywords: ['go to', 'open', 'page'],
            run: point.to
                ? { type: 'route', to: point.to }
                : { type: 'link', href: point.href ?? '', target: point.target },
        })
    })

    context.macros.forEach((macro) => {
        const description = macro.description ?? ''

        add({
            id: `macro:${macro.name}`,
            group: 'macros',
            title: macro.name,
            subtitle: description === DEFAULT_MACRO_DESCRIPTION ? '' : description,
            icon: mdiCodeTags,
            keywords: ['macro', 'run'],
            disabledReason: notReady,
            run: { type: 'gcode', scripts: [macro.name] },
        })
    })

    // gcode files, newest first
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
                keywords: ['print', 'start', 'file'],
                confirmText: t('CommandPalette.Confirm.Print', { filename: file.filename }),
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
            // the internal name can differ from the title (e.g. "command-palette" for "Commands")
            keywords: ['settings', 'preferences', 'options', tab.name.replace(/-/g, ' ')],
            run: { type: 'settings', tab: tab.name },
        })
    })

    return commands
}

// ---------------------------------------------------------------------------------------------------------
// search and ranking
// ---------------------------------------------------------------------------------------------------------

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
// titles count fully, keywords and subtitles count less and only when they contain the search term as it is
const SECONDARY_WEIGHT = 0.6
const MIN_SECONDARY_SCORE = SCORE_INSIDE - LENGTH_PENALTY_MAX
// small enough to only reorder matches of the same kind (see the SCORE_ steps above)
const BOOST_PINNED = 80
const BOOST_RECENT = 60

const isBoundary = (text: string, index: number): boolean => {
    if (index === 0) return true

    const previous = text[index - 1]
    const current = text[index]
    if (/[\s_\-./:]/.test(previous)) return true

    // camelCase
    return previous === previous.toLowerCase() && current !== current.toLowerCase() && /[a-z]/i.test(previous)
}

const range = (start: number, length: number): number[] => Array.from({ length }, (_, index) => start + index)

const lengthPenalty = (text: string): number => Math.min(LENGTH_PENALTY_MAX, text.length * LENGTH_PENALTY)

// position of the next query character: directly after the previous one, else at the next start of a word, else
// anywhere behind it
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

// Matches the characters in order, starting at the beginning of a word (e.g. "lf" -> "LOAD_FILAMENT"). Every
// character should continue the previous one or start a word; a character in the middle of a word costs score.
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
    // matched characters of the title
    positions: number[]
    pinned: boolean
    score: number
}

export interface PaletteSection {
    key: PaletteSectionKey
    results: PaletteResult[]
    // number of commands before the list was shortened
    total: number
}

export interface PaletteSearchOptions {
    pinned: string[]
    recent: string[]
    // commands shown per group while browsing without a search term
    browseLimit?: number
    // commands shown per group for a search term
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

    // a pinned command keeps its place while it is unavailable
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

const scoreCommand = (command: PaletteCommand, terms: string[]): { score: number; positions: number[] } | null => {
    let score = 0
    const positions = new Set<number>()

    for (const term of terms) {
        const title = fuzzyMatch(term, command.title)
        const secondary = [command.subtitle, ...command.keywords]
            .map((text) => fuzzyMatch(term, text)?.score ?? 0)
            .filter((value) => value >= MIN_SECONDARY_SCORE)
            .reduce((best, value) => Math.max(best, value * SECONDARY_WEIGHT), 0)
        if (title === null && secondary === 0) return null

        if (title !== null && title.score >= secondary) {
            title.positions.forEach((position) => positions.add(position))
            score += title.score
            continue
        }

        score += secondary
    }

    return { score: score / terms.length, positions: [...positions].sort((a, b) => a - b) }
}

export const searchPaletteCommands = (
    commands: PaletteCommand[],
    query: string,
    options: PaletteSearchOptions
): PaletteSection[] => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return browsePaletteCommands(commands, options)

    const limit = options.searchLimit ?? DEFAULT_SEARCH_LIMIT
    const results: PaletteResult[] = []
    commands.forEach((command) => {
        const match = scoreCommand(command, terms)
        if (match === null) return

        const pinned = options.pinned.includes(command.id)
        const recentIndex = options.recent.indexOf(command.id)
        const recentBoost = recentIndex === -1 ? 0 : BOOST_RECENT * (1 - recentIndex / (options.recent.length + 1))

        results.push({
            command,
            positions: match.positions,
            pinned,
            score: match.score + (pinned ? BOOST_PINNED : 0) + recentBoost,
        })
    })
    results.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))

    const available = results.filter((result) => result.command.disabledReason === null)
    const unavailable = results.filter((result) => result.command.disabledReason !== null)

    // results are sorted, so the first one of a group is its best match
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

// index of the next command that can be run, -1 when there is none
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

// ---------------------------------------------------------------------------------------------------------
// recent and pinned commands
// ---------------------------------------------------------------------------------------------------------

export const addRecentCommand = (recent: string[], id: string, max = MAX_RECENT_COMMANDS): string[] => {
    return [id, ...recent.filter((entry) => entry !== id)].slice(0, max)
}

export const togglePinnedCommand = (pinned: string[], id: string): string[] => {
    return pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id]
}

// ---------------------------------------------------------------------------------------------------------
// keyboard shortcut
// ---------------------------------------------------------------------------------------------------------

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
// taken by the browser (cannot be intercepted reliably) or by Mainsail itself (editor save and search, copy and paste)
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
const KEY_LABELS: Record<string, [string, string]> = {
    // [macOS, other platforms]
    mod: ['⌘', 'Ctrl'],
    ctrl: ['⌃', 'Ctrl'],
    meta: ['⌘', 'Meta'],
    alt: ['⌥', 'Alt'],
    shift: ['⇧', 'Shift'],
    space: ['Space', 'Space'],
}

// "mod" is the main modifier of the platform: Cmd on macOS, Ctrl everywhere else
export const shortcutFromEvent = (event: ShortcutEvent, isMac: boolean): string | null => {
    let key = (event.key ?? '').toLowerCase()
    if (MODIFIER_KEYS.includes(key)) return null

    // Alt (and Shift on some layouts) changes the typed character, the physical key is what the user pressed
    const code = event.code ?? ''
    if (!/^[a-z0-9]$/.test(key) && /^(Key[A-Z]|Digit\d)$/.test(code)) key = code.slice(-1).toLowerCase()
    if (key === ' ') key = 'space'
    if (!key) return null

    const parts: string[] = []
    if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod')
    if (isMac && event.ctrlKey) parts.push('ctrl')
    if (!isMac && event.metaKey) parts.push('meta')
    if (event.altKey) parts.push('alt')
    if (event.shiftKey) parts.push('shift')

    return [...parts, key].join('+')
}

export const matchesShortcut = (event: ShortcutEvent, shortcut: string, isMac: boolean): boolean => {
    return shortcutFromEvent(event, isMac) === shortcut
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
    if (RESERVED_SHORTCUTS.includes(shortcut)) return 'Reserved'

    return null
}

export const formatShortcut = (shortcut: string, isMac: boolean): string[] => {
    return shortcut.split('+').map((part) => {
        const label = KEY_LABELS[part]
        if (label) return label[isMac ? 0 : 1]

        return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
    })
}

// the search and replace fields of the code editor (CodeMirror panels) keep their own keyboard handling
export const isEditorSearchTarget = (target: unknown): boolean => {
    const element = target as { closest?: (selector: string) => unknown } | null
    if (typeof element?.closest !== 'function') return false

    return element.closest('.cm-panels') !== null
}

// ---------------------------------------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------------------------------------

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

// settings loaded from the database can lack keys (saved by an older version) or hold broken values
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
