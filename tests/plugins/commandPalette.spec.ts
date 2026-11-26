import { describe, expect, it } from 'vitest'
import {
    addRecentCommand,
    buildPaletteCommands,
    collectGcodeFiles,
    DEFAULT_PALETTE_SHORTCUT,
    flattenPaletteSections,
    formatShortcut,
    fuzzyMatch,
    highlightSegments,
    isEditorSearchTarget,
    keepSelection,
    matchesShortcut,
    nextSelectableIndex,
    sanitizePaletteSettings,
    searchPaletteCommands,
    shortcutFromEvent,
    togglePinnedCommand,
    validateShortcut,
} from '@/plugins/commandPalette'
import type { PaletteCommand, PaletteContext, PaletteSection } from '@/plugins/commandPalette'

const t = (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key)

const createContext = (overrides: Partial<PaletteContext> = {}): PaletteContext => ({
    klipperState: 'ready',
    printerState: 'standby',
    naviPoints: [
        { title: 'Dashboard', icon: 'i-dashboard', to: '/' },
        { title: 'Console', icon: 'i-console', to: '/console' },
        { title: 'Wiki', icon: 'i-link', href: 'https://example.com', target: '_blank' },
    ],
    macros: [
        { name: 'LOAD_FILAMENT', description: 'Load the filament' },
        { name: 'UNLOAD_FILAMENT', description: 'G-Code macro' },
    ],
    hiddenMacros: [],
    files: [
        { filename: 'benchy.gcode', modified: 100 },
        { filename: 'functional/cable_clip.gcode', modified: 300 },
        { filename: 'demo.gcode', modified: 200 },
    ],
    presets: [
        {
            id: 'pla',
            name: 'PLA',
            gcode: 'M117 preheat',
            values: {
                extruder: { bool: true, type: 'heater', value: 210 },
                heater_bed: { bool: true, type: 'heater', value: 60 },
                'temperature_fan chamber': { bool: true, type: 'temperature_fan', value: 35 },
                'heater_generic unused': { bool: false, type: 'heater', value: 99 },
            },
        },
    ],
    cooldownGcode: 'TURN_OFF_HEATERS',
    confirmOnCoolDown: false,
    settingsTabs: [
        { name: 'general', title: 'General', icon: 'i-cog' },
        { name: 'webcams', title: 'Webcams', icon: 'i-webcam' },
    ],
    t,
    ...overrides,
})

const byId = (commands: PaletteCommand[], id: string): PaletteCommand => {
    const command = commands.find((entry) => entry.id === id)
    if (!command) throw new Error(`command ${id} not found in ${commands.map((entry) => entry.id).join(', ')}`)

    return command
}

const ids = (sections: PaletteSection[]) =>
    sections.map((section) => [section.key, section.results.map((result) => result.command.id)])

describe('buildPaletteCommands', () => {
    it('builds navigation commands from the sidebar entries', () => {
        const commands = buildPaletteCommands(createContext())

        expect(byId(commands, 'nav:/console')).toMatchObject({
            group: 'navigation',
            title: 'Console',
            icon: 'i-console',
            run: { type: 'route', to: '/console' },
            disabledReason: null,
            confirmText: null,
        })
        expect(byId(commands, 'nav:https://example.com').run).toEqual({
            type: 'link',
            href: 'https://example.com',
            target: '_blank',
        })
    })

    it('gives sidebar links with the same target their own ids', () => {
        const commands = buildPaletteCommands(
            createContext({
                naviPoints: [
                    { title: 'Console', icon: 'i-console', to: '/console' },
                    { title: 'Docs', icon: 'i-link', href: '#' },
                    { title: 'Shop', icon: 'i-link', href: '#' },
                    { title: 'Shop', icon: 'i-link', href: '#' },
                    { title: 'Wiki', icon: 'i-link', href: 'https://example.com' },
                ],
            })
        )
        const navigation = commands.filter((command) => command.group === 'navigation').map((command) => command.id)

        expect(new Set(navigation).size).toBe(5)
        // a link with a target of its own keeps the short id, also when other links change
        expect(navigation).toEqual([
            'nav:/console',
            'nav:#|Docs',
            'nav:#|Shop',
            'nav:#|Shop~2',
            'nav:https://example.com',
        ])
    })

    it('leaves out the macros the user hid in the macro settings, whatever their case', () => {
        const commands = buildPaletteCommands(createContext({ hiddenMacros: ['load_filament'] }))
        const macros = commands.filter((command) => command.group === 'macros').map((command) => command.id)

        expect(macros).toEqual(['macro:UNLOAD_FILAMENT'])
    })

    it('builds a command for every macro and hides the default description', () => {
        const commands = buildPaletteCommands(createContext())

        expect(byId(commands, 'macro:LOAD_FILAMENT')).toMatchObject({
            group: 'macros',
            title: 'LOAD_FILAMENT',
            subtitle: 'Load the filament',
            run: { type: 'gcode', scripts: ['LOAD_FILAMENT'] },
            confirmText: null,
        })
        expect(byId(commands, 'macro:UNLOAD_FILAMENT').subtitle).toBe('')
    })

    it('builds a print command for every gcode file, newest first', () => {
        const commands = buildPaletteCommands(createContext())
        const files = commands.filter((command) => command.group === 'files')

        expect(files.map((command) => command.id)).toEqual([
            'file:functional/cable_clip.gcode',
            'file:demo.gcode',
            'file:benchy.gcode',
        ])
        expect(files[0]).toMatchObject({
            title: 'cable_clip.gcode',
            subtitle: 'functional/',
            run: { type: 'print', filename: 'functional/cable_clip.gcode' },
        })
        // the start print dialog of Mainsail asks, with its spool and timelapse options
        expect(files[0].confirmText).toBeNull()
        expect(files[1].subtitle).toBe('')
    })

    it('builds a command for every tab of the settings dialog', () => {
        const commands = buildPaletteCommands(createContext())

        expect(byId(commands, 'settings:webcams')).toMatchObject({
            group: 'settings',
            title: 'Webcams',
            icon: 'i-webcam',
            run: { type: 'settings', tab: 'webcams' },
        })
    })

    it('finds a settings tab by its internal name too', () => {
        const commands = buildPaletteCommands(
            createContext({ settingsTabs: [{ name: 'remote-printers', title: 'Printers', icon: 'i-printer' }] })
        )
        const found = flattenPaletteSections(searchPaletteCommands(commands, 'remote', { pinned: [], recent: [] }))

        expect(found.map((result) => result.command.id)).toEqual(['settings:remote-printers'])
    })

    it('turns a preheat preset into the same gcode as the temperature panel', () => {
        const commands = buildPaletteCommands(createContext())
        const preset = byId(commands, 'preset:pla')

        expect(preset.group).toBe('actions')
        expect(preset.run).toEqual({
            type: 'gcode',
            scripts: [
                'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210',
                'SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60',
                'SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=chamber TARGET=35',
                'M117 preheat',
            ],
        })
        expect(preset.subtitle).toBe('extruder 210 °C · heater_bed 60 °C · chamber 35 °C')
    })

    it('uses the configured cooldown gcode', () => {
        const commands = buildPaletteCommands(createContext({ cooldownGcode: 'MY_COOLDOWN' }))

        expect(byId(commands, 'action:cooldown').run).toEqual({ type: 'gcode', scripts: ['MY_COOLDOWN'] })
    })

    it('asks for confirmation before the dangerous actions only', () => {
        const commands = buildPaletteCommands(createContext({ printerState: 'printing' }))
        const confirming = commands.filter((command) => command.confirmText !== null).map((command) => command.id)

        expect(confirming).toEqual(
            expect.arrayContaining(['action:emergencyStop', 'action:cancel', 'action:firmwareRestart'])
        )
        expect(confirming).not.toContain('file:demo.gcode')
        expect(confirming).not.toContain('action:cooldown')
        expect(confirming).not.toContain('action:home')
        expect(confirming).not.toContain('action:pause')
        expect(confirming).not.toContain('macro:LOAD_FILAMENT')
        expect(confirming).not.toContain('nav:/console')
    })

    it('marks the destructive actions as dangerous', () => {
        const commands = buildPaletteCommands(createContext())
        const dangerous = commands.filter((command) => command.danger).map((command) => command.id)

        expect(dangerous.sort()).toEqual(['action:cancel', 'action:emergencyStop', 'action:firmwareRestart'])
    })

    it('asks before the cooldown when the user enabled that confirmation', () => {
        const commands = buildPaletteCommands(createContext({ confirmOnCoolDown: true }))

        expect(byId(commands, 'action:cooldown').confirmText).toBe('CommandPalette.Confirm.Cooldown')
        expect(byId(commands, 'action:cooldown').danger).toBe(false)
    })

    it('sends the printer actions through the Moonraker API', () => {
        const commands = buildPaletteCommands(createContext())

        expect(byId(commands, 'action:home').run).toEqual({ type: 'gcode', scripts: ['G28'] })
        expect(byId(commands, 'action:pause').run).toMatchObject({ type: 'socket', method: 'printer.print.pause' })
        expect(byId(commands, 'action:resume').run).toMatchObject({ type: 'socket', method: 'printer.print.resume' })
        expect(byId(commands, 'action:cancel').run).toMatchObject({ type: 'socket', method: 'printer.print.cancel' })
        expect(byId(commands, 'action:emergencyStop').run).toMatchObject({
            type: 'socket',
            method: 'printer.emergency_stop',
        })
        expect(byId(commands, 'action:firmwareRestart').run).toMatchObject({
            type: 'socket',
            method: 'printer.firmware_restart',
        })
    })

    describe('validity in the current printer state', () => {
        const reasons = (context: Partial<PaletteContext>) => {
            const commands = buildPaletteCommands(createContext(context))

            return (id: string) => byId(commands, id).disabledReason
        }

        it('allows the idle actions while the printer is idle', () => {
            const reason = reasons({ printerState: 'standby' })

            expect(reason('action:home')).toBeNull()
            expect(reason('action:cooldown')).toBeNull()
            expect(reason('preset:pla')).toBeNull()
            expect(reason('file:demo.gcode')).toBeNull()
            expect(reason('macro:LOAD_FILAMENT')).toBeNull()
            expect(reason('action:emergencyStop')).toBeNull()
            expect(reason('action:firmwareRestart')).toBeNull()
            expect(reason('action:pause')).toBe('CommandPalette.Reasons.NoPrintRunning')
            expect(reason('action:resume')).toBe('CommandPalette.Reasons.NotPaused')
            expect(reason('action:cancel')).toBe('CommandPalette.Reasons.NoPrintRunning')
        })

        it('allows pause and cancel while printing, and blocks what would disturb the print', () => {
            const reason = reasons({ printerState: 'printing' })

            expect(reason('action:pause')).toBeNull()
            expect(reason('action:cancel')).toBeNull()
            expect(reason('action:resume')).toBe('CommandPalette.Reasons.NotPaused')
            expect(reason('action:home')).toBe('CommandPalette.Reasons.WhilePrinting')
            expect(reason('file:demo.gcode')).toBe('CommandPalette.Reasons.WhilePrinting')
            // like the preset menu of the temperature panel, which is disabled while printing or paused
            expect(reason('action:cooldown')).toBe('CommandPalette.Reasons.WhilePrinting')
            expect(reason('preset:pla')).toBe('CommandPalette.Reasons.WhilePrinting')
            expect(reason('macro:LOAD_FILAMENT')).toBeNull()
            expect(reason('action:emergencyStop')).toBeNull()
        })

        it('allows resume and cancel while paused', () => {
            const reason = reasons({ printerState: 'paused' })

            expect(reason('action:resume')).toBeNull()
            expect(reason('action:cancel')).toBeNull()
            expect(reason('action:pause')).toBe('CommandPalette.Reasons.AlreadyPaused')
            expect(reason('action:home')).toBe('CommandPalette.Reasons.WhilePrinting')
            expect(reason('preset:pla')).toBe('CommandPalette.Reasons.WhilePrinting')
        })

        it('blocks everything that needs Klipper while it is shut down, except the firmware restart', () => {
            const reason = reasons({ klipperState: 'shutdown', printerState: 'printing' })

            expect(reason('action:firmwareRestart')).toBeNull()
            expect(reason('action:emergencyStop')).toBe('CommandPalette.Reasons.AlreadyShutdown')
            // print_stats can be stale while Klipper is not ready
            expect(reason('action:pause')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('action:cancel')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('action:home')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('macro:LOAD_FILAMENT')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('file:demo.gcode')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('preset:pla')).toBe('CommandPalette.Reasons.KlipperNotReady')
            expect(reason('nav:/console')).toBeNull()
            expect(reason('settings:general')).toBeNull()
        })

        it('allows an emergency stop while Klipper starts or reports an error', () => {
            expect(reasons({ klipperState: 'startup' })('action:emergencyStop')).toBeNull()
            expect(reasons({ klipperState: 'error' })('action:emergencyStop')).toBeNull()
            expect(reasons({ klipperState: 'error' })('action:firmwareRestart')).toBeNull()
        })

        it('blocks all printer commands while Klipper is disconnected', () => {
            const reason = reasons({ klipperState: 'disconnected' })

            expect(reason('action:emergencyStop')).toBe('CommandPalette.Reasons.KlipperNotConnected')
            expect(reason('action:firmwareRestart')).toBe('CommandPalette.Reasons.KlipperNotConnected')
            expect(reason('macro:LOAD_FILAMENT')).toBe('CommandPalette.Reasons.KlipperNotConnected')
            expect(reason('nav:/')).toBeNull()
        })
    })
})

describe('collectGcodeFiles', () => {
    const file = (filename: string, modified = 1) => ({ isDirectory: false, filename, modified })
    const dir = (filename: string, childrens: unknown[]) => ({ isDirectory: true, filename, childrens })

    it('lists the printable files of all folders with their path', () => {
        const root = dir('gcodes', [
            file('demo.gcode', 5),
            file('notes.txt'),
            dir('functional', [file('clip.GCODE', 7), dir('deep', [file('part.g')])]),
        ])

        expect(collectGcodeFiles(root as never, ['.gcode', '.g'])).toEqual([
            { filename: 'demo.gcode', modified: 5 },
            { filename: 'functional/clip.GCODE', modified: 7 },
            { filename: 'functional/deep/part.g', modified: 1 },
        ])
    })

    it('skips hidden files and folders', () => {
        const root = dir('gcodes', [file('.hidden.gcode'), dir('.thumbs', [file('thumb.gcode')])])

        expect(collectGcodeFiles(root as never, ['.gcode'])).toEqual([])
    })

    it('returns nothing while the gcodes folder is not loaded', () => {
        expect(collectGcodeFiles(null, ['.gcode'])).toEqual([])
        expect(collectGcodeFiles(undefined, ['.gcode'])).toEqual([])
    })
})

describe('fuzzyMatch', () => {
    it('returns null when the characters do not appear in order', () => {
        expect(fuzzyMatch('xyz', 'Console')).toBeNull()
        expect(fuzzyMatch('elosnoc', 'Console')).toBeNull()
    })

    it('ignores case and returns the matched positions', () => {
        expect(fuzzyMatch('CON', 'Console')?.positions).toEqual([0, 1, 2])
        expect(fuzzyMatch('sole', 'Console')?.positions).toEqual([3, 4, 5, 6])
    })

    it('matches initials across word boundaries', () => {
        expect(fuzzyMatch('lf', 'LOAD_FILAMENT')?.positions).toEqual([0, 5])
        expect(fuzzyMatch('gcv', 'G-Code Viewer')?.positions).toEqual([0, 2, 7])
    })

    it('does not match scattered letters in the middle of words', () => {
        expect(fuzzyMatch('oe', 'Console')).toBeNull()
        expect(fuzzyMatch('pre', 'PARK_TOOLHEAD')).toBeNull()
        expect(fuzzyMatch('pre', 'PURGE_LINE')).toBeNull()
    })

    it('tolerates one skipped letter in an abbreviation', () => {
        expect(fuzzyMatch('prk', 'PARK_TOOLHEAD')?.positions).toEqual([0, 2, 3])
    })

    it('ranks exact over prefix over word start over inner matches over initials', () => {
        const score = (query: string, text: string) => fuzzyMatch(query, text)?.score ?? -1

        expect(score('home', 'Home')).toBeGreaterThan(score('home', 'Home all axes'))
        expect(score('pre', 'Preheat PLA')).toBeGreaterThan(score('pre', 'Cancel print'))
        expect(score('print', 'Cancel print')).toBeGreaterThan(score('rint', 'Cancel print'))
        expect(score('fil', 'LOAD_FILAMENT')).toBeGreaterThan(score('lf', 'LOAD_FILAMENT'))
    })

    it('prefers the shorter text for the same kind of match', () => {
        const score = (text: string) => fuzzyMatch('pa', text)?.score ?? -1

        expect(score('PAUSE')).toBeGreaterThan(score('PARK_TOOLHEAD_FRONT'))
    })
})

describe('highlightSegments', () => {
    it('splits a title into matched and unmatched parts', () => {
        expect(highlightSegments('Console', [0, 1, 2])).toEqual([
            { text: 'Con', match: true },
            { text: 'sole', match: false },
        ])
        expect(highlightSegments('LOAD_FILAMENT', [0, 5])).toEqual([
            { text: 'L', match: true },
            { text: 'OAD_', match: false },
            { text: 'F', match: true },
            { text: 'ILAMENT', match: false },
        ])
    })

    it('returns the whole title when nothing matched', () => {
        expect(highlightSegments('Console', [])).toEqual([{ text: 'Console', match: false }])
    })
})

describe('searchPaletteCommands', () => {
    const commands = buildPaletteCommands(createContext())

    it('shows pinned commands first, then recently used ones, then the groups', () => {
        const sections = searchPaletteCommands(commands, '', {
            pinned: ['macro:LOAD_FILAMENT', 'nav:/console'],
            recent: ['settings:webcams', 'action:home'],
        })

        expect(sections.map((section) => section.key)).toEqual([
            'pinned',
            'recent',
            'actions',
            'navigation',
            'macros',
            'files',
            'settings',
        ])
        expect(sections[0].results.map((result) => result.command.id)).toEqual(['macro:LOAD_FILAMENT', 'nav:/console'])
        expect(sections[1].results.map((result) => result.command.id)).toEqual(['settings:webcams', 'action:home'])
    })

    it('lists every command only once', () => {
        const sections = searchPaletteCommands(commands, '', {
            pinned: ['macro:LOAD_FILAMENT'],
            recent: ['macro:LOAD_FILAMENT', 'action:home'],
        })
        const all = flattenPaletteSections(sections).map((result) => result.command.id)

        expect(new Set(all).size).toBe(all.length)
        expect(ids(sections)[1]).toEqual(['recent', ['action:home']])
    })

    it('hides commands that are invalid in the current state while browsing', () => {
        const all = flattenPaletteSections(
            searchPaletteCommands(commands, '', { pinned: [], recent: ['action:pause'] })
        )

        expect(all.map((result) => result.command.id)).not.toContain('action:pause')
        expect(all.every((result) => result.command.disabledReason === null)).toBe(true)
    })

    it('keeps a pinned command visible while it is invalid', () => {
        const sections = searchPaletteCommands(commands, '', { pinned: ['action:pause'], recent: [] })

        expect(sections[0].key).toBe('pinned')
        expect(sections[0].results[0].command.disabledReason).toBe('CommandPalette.Reasons.NoPrintRunning')
    })

    it('ignores pinned and recent commands that no longer exist', () => {
        const sections = searchPaletteCommands(commands, '', { pinned: ['macro:GONE'], recent: ['file:gone.gcode'] })

        expect(sections.map((section) => section.key)).toEqual(['actions', 'navigation', 'macros', 'files', 'settings'])
    })

    it('limits the number of browsed commands per group', () => {
        const many = buildPaletteCommands(
            createContext({
                macros: Array.from({ length: 30 }, (_, index) => ({ name: `MACRO_${index}`, description: null })),
            })
        )
        const sections = searchPaletteCommands(many, '', { pinned: [], recent: [], browseLimit: 4 })
        const macros = sections.find((section) => section.key === 'macros')

        expect(macros?.results).toHaveLength(4)
        expect(macros?.total).toBe(30)
    })

    it('finds commands by title and marks the matched characters', () => {
        const sections = searchPaletteCommands(commands, 'load', { pinned: [], recent: [] })
        const first = sections[0].results[0]

        expect(first.command.id).toBe('macro:LOAD_FILAMENT')
        expect(first.positions).toEqual([0, 1, 2, 3])
    })

    it('puts the group with the best match first', () => {
        const sections = searchPaletteCommands(commands, 'console', { pinned: [], recent: [] })

        expect(sections[0].key).toBe('navigation')
        expect(sections[0].results[0].command.id).toBe('nav:/console')
    })

    it('finds commands by keyword, subtitle and several words', () => {
        const find = (query: string) =>
            flattenPaletteSections(searchPaletteCommands(commands, query, { pinned: [], recent: [] })).map(
                (result) => result.command.id
            )

        expect(find('functional')).toContain('file:functional/cable_clip.gcode')
        expect(find('print benchy')[0]).toBe('file:benchy.gcode')
        expect(find('settings webcams')[0]).toBe('settings:webcams')
        expect(find('estop')[0]).toBe('action:emergencyStop')
        expect(find('zzzz')).toEqual([])
    })

    it('matches keywords and descriptions only by whole parts of words, not by scattered letters', () => {
        const described = buildPaletteCommands(
            createContext({ macros: [{ name: 'TEST_DELAY', description: 'Helper macro to find the park delay' }] })
        )
        const find = (query: string) =>
            flattenPaletteSections(searchPaletteCommands(described, query, { pinned: [], recent: [] })).map(
                (result) => result.command.id
            )

        expect(find('park')).toContain('macro:TEST_DELAY')
        expect(find('fpd')).not.toContain('macro:TEST_DELAY')
    })

    it('lists a whole group for its name, but not for a short part of it', () => {
        const find = (query: string) =>
            flattenPaletteSections(searchPaletteCommands(commands, query, { pinned: [], recent: [] })).map(
                (result) => result.command.id
            )

        expect(find('settings')).toEqual(expect.arrayContaining(['settings:general', 'settings:webcams']))
        expect(find('pref')).toContain('settings:general')
        expect(find('pre')).not.toContain('settings:general')
        expect(find('file')).toContain('file:benchy.gcode')
        expect(find('fil')).not.toContain('file:benchy.gcode')
        expect(find('macro')).toContain('macro:LOAD_FILAMENT')
    })

    it('understands a group name of two words in front of the search term', () => {
        const find = (query: string) =>
            flattenPaletteSections(searchPaletteCommands(commands, query, { pinned: [], recent: [] })).map(
                (result) => result.command.id
            )

        expect(find('go to console')).toEqual(['nav:/console'])
        expect(find('go to')).toEqual(['nav:/console', 'nav:/', 'nav:https://example.com'])
        expect(find('Go To  con')).toEqual(['nav:/console'])
    })

    it('ranks a match of the title above the commands that only match by their group', () => {
        const withMacro = buildPaletteCommands(createContext({ macros: [{ name: 'START_PRINT', description: null }] }))
        const all = flattenPaletteSections(searchPaletteCommands(withMacro, 'print', { pinned: [], recent: [] }))

        expect(all[0].command.id).toBe('macro:START_PRINT')
        expect(all.map((result) => result.command.id)).toContain('file:benchy.gcode')
    })

    it('shows invalid commands with their reason when they are searched for, after the valid ones', () => {
        const all = flattenPaletteSections(searchPaletteCommands(commands, 'p', { pinned: [], recent: [] }))
        const firstDisabled = all.findIndex((result) => result.command.disabledReason !== null)
        const pause = all.find((result) => result.command.id === 'action:pause')

        expect(pause?.command.disabledReason).toBe('CommandPalette.Reasons.NoPrintRunning')
        expect(all.slice(firstDisabled).every((result) => result.command.disabledReason !== null)).toBe(true)
    })

    it('collects the invalid matches in their own section at the end', () => {
        const sections = searchPaletteCommands(commands, 'pause', { pinned: [], recent: [] })

        expect(ids(sections)).toEqual([['unavailable', ['action:pause']]])
    })

    it('prefers recently used and pinned commands among equally good matches', () => {
        const equal = buildPaletteCommands(
            createContext({
                macros: [
                    { name: 'PARK_A', description: null },
                    { name: 'PARK_B', description: null },
                    { name: 'PARK_C', description: null },
                ],
            })
        )
        const order = (options: { pinned: string[]; recent: string[] }) =>
            flattenPaletteSections(searchPaletteCommands(equal, 'park', options)).map((result) => result.command.id)

        expect(order({ pinned: [], recent: [] })[0]).toBe('macro:PARK_A')
        expect(order({ pinned: [], recent: ['macro:PARK_C'] })[0]).toBe('macro:PARK_C')
        expect(order({ pinned: ['macro:PARK_B'], recent: ['macro:PARK_C'] })[0]).toBe('macro:PARK_B')
    })

    it('does not let a recently used weak match beat a clearly better match', () => {
        const all = flattenPaletteSections(
            searchPaletteCommands(commands, 'con', { pinned: [], recent: ['action:cooldown'] })
        )

        expect(all[0].command.id).toBe('nav:/console')
    })

    it('flags pinned results', () => {
        const all = flattenPaletteSections(
            searchPaletteCommands(commands, 'filament', { pinned: ['macro:LOAD_FILAMENT'], recent: [] })
        )

        expect(all.find((result) => result.command.id === 'macro:LOAD_FILAMENT')?.pinned).toBe(true)
        expect(all.find((result) => result.command.id === 'macro:UNLOAD_FILAMENT')?.pinned).toBe(false)
    })
})

describe('nextSelectableIndex', () => {
    const results = (disabled: boolean[]) =>
        disabled.map((isDisabled) => ({ command: { disabledReason: isDisabled ? 'reason' : null } }))

    it('moves down and up and wraps around', () => {
        const list = results([false, false, false])

        expect(nextSelectableIndex(list, 0, 1)).toBe(1)
        expect(nextSelectableIndex(list, 2, 1)).toBe(0)
        expect(nextSelectableIndex(list, 0, -1)).toBe(2)
    })

    it('skips disabled commands', () => {
        const list = results([false, true, true, false])

        expect(nextSelectableIndex(list, 0, 1)).toBe(3)
        expect(nextSelectableIndex(list, 3, -1)).toBe(0)
    })

    it('selects the first enabled command from the start', () => {
        expect(nextSelectableIndex(results([true, false]), -1, 1)).toBe(1)
    })

    it('returns -1 when nothing can be selected', () => {
        expect(nextSelectableIndex(results([true, true]), -1, 1)).toBe(-1)
        expect(nextSelectableIndex([], -1, 1)).toBe(-1)
    })
})

describe('keepSelection', () => {
    const results = (entries: [string, boolean][]) =>
        entries.map(([id, disabled]) => ({ command: { id, disabledReason: disabled ? 'reason' : null } }))

    it('keeps the selected command when the list is reordered', () => {
        const list = results([
            ['action:home', false],
            ['action:pause', false],
        ])

        expect(keepSelection(list, 'action:pause')).toBe('action:pause')
    })

    it('selects nothing when the selected command disappears or becomes unavailable', () => {
        // e.g. the print ends while "Pause print" is selected: Enter must not run its neighbour
        expect(keepSelection(results([['action:home', false]]), 'action:pause')).toBeNull()
        expect(
            keepSelection(
                results([
                    ['action:home', false],
                    ['action:pause', true],
                ]),
                'action:pause'
            )
        ).toBeNull()
    })

    it('selects nothing when nothing was selected', () => {
        expect(keepSelection(results([['action:home', false]]), null)).toBeNull()
    })
})

describe('recent and pinned commands', () => {
    it('puts the latest command first and keeps the list short and unique', () => {
        expect(addRecentCommand(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c'])
        expect(addRecentCommand(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    })

    it('pins and unpins a command', () => {
        expect(togglePinnedCommand(['a'], 'b')).toEqual(['a', 'b'])
        expect(togglePinnedCommand(['a', 'b'], 'a')).toEqual(['b'])
    })
})

describe('shortcuts', () => {
    const event = (
        key: string,
        modifiers: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {},
        code = ''
    ) => ({
        key,
        code,
        ctrlKey: modifiers.ctrl ?? false,
        metaKey: modifiers.meta ?? false,
        altKey: modifiers.alt ?? false,
        shiftKey: modifiers.shift ?? false,
    })

    it('opens with Ctrl+K on Windows and Linux and with Cmd+K on macOS by default', () => {
        expect(DEFAULT_PALETTE_SHORTCUT).toBe('mod+k')
        expect(matchesShortcut(event('k', { ctrl: true }), 'mod+k', false)).toBe(true)
        expect(matchesShortcut(event('k', { meta: true }), 'mod+k', true)).toBe(true)
        expect(matchesShortcut(event('K', { meta: true }), 'mod+k', true)).toBe(true)
    })

    it('leaves Ctrl+K to the text editing of macOS', () => {
        expect(matchesShortcut(event('k', { ctrl: true }), 'mod+k', true)).toBe(false)
    })

    it('does not match without the modifier or with extra modifiers', () => {
        expect(matchesShortcut(event('k'), 'mod+k', false)).toBe(false)
        expect(matchesShortcut(event('k', { ctrl: true, shift: true }), 'mod+k', false)).toBe(false)
        expect(matchesShortcut(event('k', { ctrl: true, alt: true }), 'mod+k', false)).toBe(false)
        expect(matchesShortcut(event('j', { ctrl: true }), 'mod+k', false)).toBe(false)
    })

    it('records a pressed combination', () => {
        expect(shortcutFromEvent(event('P', { ctrl: true, shift: true }), false)).toBe('mod+shift+p')
        expect(shortcutFromEvent(event('p', { meta: true, alt: true }), true)).toBe('mod+alt+p')
        expect(shortcutFromEvent(event('/', { ctrl: true }), false)).toBe('mod+/')
        expect(shortcutFromEvent(event('F2'), false)).toBe('f2')
        expect(shortcutFromEvent(event(' ', { ctrl: true }), false)).toBe('mod+space')
    })

    it('uses the physical key when a modifier changes the typed character', () => {
        expect(shortcutFromEvent(event('π', { alt: true }, 'KeyP'), true)).toBe('alt+p')
        expect(matchesShortcut(event('π', { alt: true }, 'KeyP'), 'alt+p', true)).toBe(true)
    })

    it('records Option combinations that start a dead key on macOS', () => {
        expect(shortcutFromEvent(event('Dead', { alt: true }, 'KeyE'), true)).toBe('alt+e')
        expect(shortcutFromEvent(event('Dead', { alt: true }, 'KeyN'), true)).toBe('alt+n')
        expect(shortcutFromEvent(event('Dead', { alt: true }, 'Backquote'), true)).toBe('alt+`')
        // a dead key on a physical key that is not known cannot be used
        expect(shortcutFromEvent(event('Dead', { alt: true }, 'IntlBackslash'), true)).toBeNull()
        expect(shortcutFromEvent(event('+', { ctrl: true }), false)).toBe('mod+plus')
    })

    it('can be triggered on every platform, whatever platform it was recorded on', () => {
        // recorded on macOS with the Control key, which is the main modifier elsewhere
        expect(matchesShortcut(event('j', { ctrl: true }), 'ctrl+j', true)).toBe(true)
        expect(matchesShortcut(event('j', { ctrl: true }), 'ctrl+j', false)).toBe(true)
        expect(matchesShortcut(event('j', { meta: true }), 'ctrl+j', true)).toBe(false)
        // recorded on Windows with the Windows key, which is Cmd on macOS
        expect(matchesShortcut(event('j', { meta: true }), 'meta+j', false)).toBe(true)
        expect(matchesShortcut(event('j', { meta: true }), 'meta+j', true)).toBe(true)
        // both modifiers of one platform fall together on the other
        expect(matchesShortcut(event('j', { ctrl: true }), 'mod+ctrl+j', false)).toBe(true)
        expect(matchesShortcut(event('j', { ctrl: true, meta: true }), 'mod+ctrl+j', true)).toBe(true)
        expect(matchesShortcut(event('j', { meta: true }), 'mod+meta+j', true)).toBe(true)
    })

    it('rejects a combination that is reserved on another platform', () => {
        // Ctrl+S is free on macOS, but it is the save shortcut of the editor everywhere else
        expect(validateShortcut('ctrl+s')).toBe('Reserved')
        expect(validateShortcut('meta+w')).toBe('Reserved')
        expect(validateShortcut('ctrl+j')).toBeNull()
    })

    it('ignores presses of a modifier key alone', () => {
        expect(shortcutFromEvent(event('Control', { ctrl: true }), false)).toBeNull()
        expect(shortcutFromEvent(event('Shift', { shift: true }), false)).toBeNull()
        expect(shortcutFromEvent(event('Meta', { meta: true }), true)).toBeNull()
    })

    it('accepts combinations with a modifier and function keys', () => {
        expect(validateShortcut('mod+k')).toBeNull()
        expect(validateShortcut('mod+shift+p')).toBeNull()
        expect(validateShortcut('alt+p')).toBeNull()
        expect(validateShortcut('f2')).toBeNull()
    })

    it('rejects keys that would be typed, navigation keys and reserved combinations', () => {
        expect(validateShortcut('k')).toBe('NeedsModifier')
        expect(validateShortcut('shift+k')).toBe('NeedsModifier')
        expect(validateShortcut('mod+enter')).toBe('Unsupported')
        expect(validateShortcut('alt+arrowdown')).toBe('Unsupported')
        expect(validateShortcut('mod+s')).toBe('Reserved')
        expect(validateShortcut('mod+f')).toBe('Reserved')
        expect(validateShortcut('mod+w')).toBe('Reserved')
        expect(validateShortcut('')).toBe('NeedsModifier')
    })

    it('formats a shortcut for the platform with translated key names', () => {
        const label = (key: string) => key.replace('CommandPalette.Keys.', 'key ')

        expect(formatShortcut('mod+k', false, label)).toEqual(['key Ctrl', 'K'])
        expect(formatShortcut('mod+k', true, label)).toEqual(['⌘', 'K'])
        expect(formatShortcut('mod+alt+shift+p', true, label)).toEqual(['⌘', '⌥', '⇧', 'P'])
        expect(formatShortcut('mod+alt+shift+p', false, label)).toEqual(['key Ctrl', 'key Alt', 'key Shift', 'P'])
        expect(formatShortcut('f2', false, label)).toEqual(['F2'])
        expect(formatShortcut('mod+space', true, label)).toEqual(['⌘', 'key Space'])
        expect(formatShortcut('meta+j', false, label)).toEqual(['key Meta', 'J'])
    })

    it('shows the keys to press on this platform for a shortcut recorded on another one', () => {
        const label = (key: string) => key.replace('CommandPalette.Keys.', '')

        expect(formatShortcut('ctrl+j', true, label)).toEqual(['⌃', 'J'])
        expect(formatShortcut('ctrl+j', false, label)).toEqual(['Ctrl', 'J'])
        expect(formatShortcut('meta+j', true, label)).toEqual(['⌘', 'J'])
        expect(formatShortcut('mod+ctrl+j', false, label)).toEqual(['Ctrl', 'J'])
    })
})

describe('isEditorSearchTarget', () => {
    const element = (matching: string[]) => ({
        closest: (selector: string) => (selector.split(',').some((part) => matching.includes(part.trim())) ? {} : null),
    })

    it('is true inside the search panel of the code editor', () => {
        expect(isEditorSearchTarget(element(['.cm-panels']))).toBe(true)
    })

    it('is false for everything else', () => {
        expect(isEditorSearchTarget(element(['.cm-content']))).toBe(false)
        expect(isEditorSearchTarget(element([]))).toBe(false)
        expect(isEditorSearchTarget(null)).toBe(false)
        expect(isEditorSearchTarget({})).toBe(false)
    })
})

describe('sanitizePaletteSettings', () => {
    const defaults = { enabled: true, shortcut: 'mod+k', pinned: [], recent: [] }

    it('returns the defaults for settings saved before the palette existed', () => {
        expect(sanitizePaletteSettings(undefined)).toEqual(defaults)
        expect(sanitizePaletteSettings(null)).toEqual(defaults)
        expect(sanitizePaletteSettings({})).toEqual(defaults)
    })

    it('keeps valid settings', () => {
        const settings = { enabled: false, shortcut: 'mod+shift+p', pinned: ['action:home'], recent: ['nav:/'] }

        expect(sanitizePaletteSettings(settings)).toEqual(settings)
    })

    it('replaces broken values with the defaults', () => {
        expect(
            sanitizePaletteSettings({ enabled: 'no', shortcut: 'k', pinned: 'action:home', recent: [1, 'nav:/', null] })
        ).toEqual({ ...defaults, recent: ['nav:/'] })
        expect(sanitizePaletteSettings({ shortcut: 42, pinned: ['a', 'a', 'b'] })).toEqual({
            ...defaults,
            pinned: ['a', 'b'],
        })
        expect(sanitizePaletteSettings('broken')).toEqual(defaults)
    })
})
