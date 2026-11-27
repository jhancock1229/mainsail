import type { ShellHomeState } from '@/plugins/shellStatus'

export type ShellPageId = 'home' | 'print' | 'tune' | 'fix' | 'machine' | 'settings'
export type InterfaceShell = 'new' | 'classic'
export type ShellLayout = 'wide' | 'compact'

export const DEFAULT_INTERFACE_SHELL: InterfaceShell = 'new'
export const SHELL_MIN_WIDTH = 960
export const MAX_FEATURE_CLICKS = 3

export interface ShellTabRequirement {
    moonrakerComponent?: string
    klipperObject?: string
    printerObject?: string
    registeredDirectory?: string
    farm?: boolean
}

export interface ShellSection extends ShellTabRequirement {
    id: string
    column?: string
    view?: 'camera' | 'console'
    anyOf?: ShellTabRequirement[]
}

export interface ShellTab extends ShellTabRequirement {
    id: string
    legacyPaths?: string[]
    sections?: ShellSection[]
}

export interface ShellSectionEntry {
    key: string
    tab: string | null
    id: string
    column: string
    view: 'camera' | 'console' | null
    split: boolean
}

export interface ShellPage {
    id: ShellPageId
    path: string
    tabs: ShellTab[]
}

export interface ShellLocation {
    page: ShellPageId
    tab: string | null
}

export interface ShellAvailability {
    moonrakerComponents: string[]
    klipperObjects: string[]
    registeredDirectories: string[]
    farm: boolean
    printerObjects?: string[]
    hidden?: string[]
}

export const settingsTabNames = [
    'general',
    'ui-settings',
    'dashboard',
    'webcams',
    'macros',
    'control',
    'console',
    'presets',
    'remote-printers',
    'g-code-viewer',
    'editor',
    'miscellaneous',
    'navigation',
    'heightmap',
    'notifications',
    'command-palette',
    'kiosk',
    'timelapse',
]

export const shellPages: ShellPage[] = [
    { id: 'home', path: '/', tabs: [] },
    {
        id: 'print',
        path: '/print',
        tabs: [
            { id: 'files', legacyPaths: ['/files'], registeredDirectory: 'gcodes' },
            { id: 'queue', moonrakerComponent: 'job_queue' },
            { id: 'preview', legacyPaths: ['/viewer'] },
        ],
    },
    {
        id: 'tune',
        path: '/tune',
        tabs: [
            { id: 'move', sections: [{ id: 'move' }, { id: 'goto' }, { id: 'first-layer' }] },
            {
                id: 'extruder',
                sections: [
                    { id: 'extruder' },
                    {
                        id: 'filament',
                        anyOf: [{ moonrakerComponent: 'spoolman' }, { printerObject: 'AFC' }, { printerObject: 'mmu' }],
                    },
                ],
            },
            {
                id: 'bed-level',
                legacyPaths: ['/heightmap'],
                sections: [{ id: 'mesh', klipperObject: 'bed_mesh' }, { id: 'level' }],
            },
            { id: 'heater-tuning', sections: [{ id: 'heaters' }, { id: 'pid' }] },
            { id: 'resonance', sections: [{ id: 'resonance' }, { id: 'resonance-help' }] },
            { id: 'limits', sections: [{ id: 'limits' }, { id: 'speed' }] },
            { id: 'macros' },
        ],
    },
    {
        id: 'fix',
        path: '/fix',
        tabs: [
            { id: 'status', sections: [{ id: 'status' }, { id: 'endstops' }] },
            { id: 'console', legacyPaths: ['/console'] },
            { id: 'logs' },
        ],
    },
    {
        id: 'machine',
        path: '/machine',
        tabs: [
            { id: 'config', legacyPaths: ['/config', '/settings/machine'] },
            { id: 'updates', moonrakerComponent: 'update_manager' },
            { id: 'system' },
            { id: 'outputs' },
            { id: 'history', legacyPaths: ['/history'], moonrakerComponent: 'history' },
            { id: 'timelapse', legacyPaths: ['/timelapse'], moonrakerComponent: 'timelapse' },
            { id: 'cameras', legacyPaths: ['/cam'] },
            { id: 'printers', legacyPaths: ['/allPrinters'], farm: true },
        ],
    },
    {
        id: 'settings',
        path: '/settings',
        tabs: settingsTabNames.map((id) => (id === 'timelapse' ? { id, moonrakerComponent: 'timelapse' } : { id })),
    },
]

export const getShellPage = (id: ShellPageId): ShellPage => {
    return shellPages.find((page) => page.id === id) ?? shellPages[0]
}

export const isShellTabAvailable = (tab: ShellTabRequirement, available: ShellAvailability): boolean => {
    if (tab.moonrakerComponent && !available.moonrakerComponents.includes(tab.moonrakerComponent)) return false
    if (tab.klipperObject && !available.klipperObjects.includes(tab.klipperObject)) return false
    if (tab.printerObject && !(available.printerObjects ?? []).includes(tab.printerObject)) return false
    if (tab.registeredDirectory && !available.registeredDirectories.includes(tab.registeredDirectory)) return false
    if (tab.farm && !available.farm) return false

    return true
}

export const shellTabKey = (page: ShellPageId, tab: string): string => `${page}/${tab}`

export const isShellTabOffered = (page: ShellPageId, tab: ShellTab, available: ShellAvailability): boolean => {
    if ((available.hidden ?? []).includes(shellTabKey(page, tab.id))) return false

    return isShellTabAvailable(tab, available)
}

export const offeredShellTabs = (page: ShellPageId, available?: ShellAvailability): ShellTab[] => {
    const tabs = getShellPage(page).tabs

    return available === undefined ? tabs : tabs.filter((tab) => isShellTabOffered(page, tab, available))
}

export const shellPath = (page: ShellPageId, tab: string | null = null): string => {
    const base = getShellPage(page).path

    return tab === null || base === '/' ? base : `${base}/${tab}`
}

const normalizePath = (path: string): string => {
    const clean = path.split(/[?#]/)[0].replace(/\/+$/, '')

    return clean === '' ? '/' : clean
}

export const resolveShellLocation = (path: string, available?: ShellAvailability): ShellLocation => {
    const clean = normalizePath(path)
    const offered = (page: ShellPage): ShellTab[] => offeredShellTabs(page.id, available)
    const open = (page: ShellPage, wanted: string): ShellLocation => {
        const tabs = offered(page)
        const tab = tabs.find((entry) => entry.id === wanted) ?? tabs[0]

        return { page: page.id, tab: tab?.id ?? null }
    }

    for (const page of shellPages) {
        const legacy = page.tabs.find((tab) => tab.legacyPaths?.includes(clean))
        if (legacy) return open(page, legacy.id)
    }

    const [, first = '', second = ''] = clean.split('/')
    const page = shellPages.find((entry) => entry.path === `/${first}` && entry.id !== 'home')
    if (!page) return { page: 'home', tab: null }

    return open(page, second)
}

export const classicPathFor = (path: string): string | null => {
    const clean = normalizePath(path)
    const [, first = ''] = clean.split('/')
    const page = shellPages.find((entry) => entry.path === `/${first}` && entry.id !== 'home')
    if (!page) return null

    const { tab } = resolveShellLocation(clean)
    const legacy = page.tabs.find((entry) => entry.id === tab)?.legacyPaths?.[0]

    return legacy ?? '/'
}

export const resolveInterfaceShell = (setting: unknown): InterfaceShell => {
    return setting === 'classic' ? 'classic' : DEFAULT_INTERFACE_SHELL
}

export const resolveShellLayout = (input: { width: number; touchMode: boolean }): ShellLayout => {
    return input.touchMode || input.width < SHELL_MIN_WIDTH ? 'compact' : 'wide'
}

const viewSections: ShellSection[] = [
    { id: 'camera', column: 'view', view: 'camera' },
    { id: 'console', column: 'view', view: 'console' },
]
const printSections: ShellSection[] = [{ id: 'job' }, ...viewSections, { id: 'heat' }]

export const homeSections: Record<ShellHomeState, ShellSection[]> = {
    idle: [{ id: 'start' }, { id: 'ready' }, { id: 'camera' }],
    printing: printSections,
    paused: printSections,
    finished: printSections,
    error: [{ id: 'problem' }, ...[...viewSections].reverse(), { id: 'heat' }],
}

export const settingsSections: ShellSection[] = [{ id: 'sections' }, { id: 'content' }]

const isSectionAvailable = (section: ShellSection, available?: ShellAvailability): boolean => {
    if (available === undefined) return true
    if (!isShellTabAvailable(section, available)) return false

    return section.anyOf === undefined || section.anyOf.some((entry) => isShellTabAvailable(entry, available))
}

const sectionEntry = (tab: string | null, section: ShellSection, split: boolean): ShellSectionEntry => ({
    key: `${tab ?? ''}:${section.id}`,
    tab,
    id: section.id,
    column: section.column ?? section.id,
    view: section.view ?? null,
    split,
})

export const shellSectionEntries = (
    page: ShellPageId,
    input: { available?: ShellAvailability; homeState?: ShellHomeState; tab?: string | null } = {}
): ShellSectionEntry[] => {
    if (page === 'home') {
        return homeSections[input.homeState ?? 'idle'].map((section) => sectionEntry(null, section, true))
    }
    if (page === 'settings') {
        return settingsSections.map((section) => sectionEntry(input.tab ?? null, section, true))
    }

    return offeredShellTabs(page, input.available).flatMap((tab) => {
        if (tab.sections === undefined) return [sectionEntry(tab.id, { id: tab.id }, false)]

        return tab.sections
            .filter((section) => isSectionAvailable(section, input.available))
            .map((section) => sectionEntry(tab.id, section, true))
    })
}

export const allShellSectionIds = (page: ShellPageId, tab?: string): string[] => {
    if (page === 'home')
        return [...new Set(Object.values(homeSections).flatMap((list) => list.map((entry) => entry.id)))]
    if (page === 'settings') return settingsSections.map((section) => section.id)

    const found = getShellPage(page).tabs.find((entry) => entry.id === tab)

    return found?.sections?.map((section) => section.id) ?? (found ? [found.id] : [])
}

export const adjacentSection = (
    entries: ShellSectionEntry[],
    currentKey: string | null,
    direction: 'next' | 'previous'
): ShellSectionEntry | null => {
    const index = entries.findIndex((entry) => entry.key === currentKey)
    if (index === -1) return null

    return entries[index + (direction === 'next' ? 1 : -1)] ?? null
}

export type ShellFeaturePlace = ShellPageId | 'rail'

export interface ShellFeature {
    id: string
    place: ShellFeaturePlace
    tab?: string
    section?: string
    steps?: number
    compactSteps?: number
}

const onPage = (place: ShellPageId, tab: string, ids: string[], section?: string): ShellFeature[] => {
    return ids.map((id) => (section === undefined ? { id, place, tab } : { id, place, tab, section }))
}

export const shellFeatures: ShellFeature[] = [
    { id: 'topbar:emergency-stop', place: 'rail' },
    { id: 'topbar:command-palette', place: 'rail' },
    { id: 'topbar:mode-toggle', place: 'rail' },
    { id: 'topbar:notifications', place: 'rail' },
    { id: 'topbar:power-and-services', place: 'rail', steps: 2 },
    { id: 'topbar:printer-selector', place: 'rail', steps: 2 },
    { id: 'topbar:save-config', place: 'rail' },
    { id: 'sidebar:about', place: 'rail' },
    { id: 'kiosk:leave-touch-mode', place: 'rail' },
    { id: 'topbar:settings', place: 'settings', steps: 0 },
    { id: 'topbar:upload-and-print', place: 'home' },

    { id: 'route:dashboard', place: 'home', steps: 0 },
    { id: 'panel:status', place: 'home' },
    { id: 'panel:print-hero', place: 'home' },
    { id: 'panel:webcam', place: 'home', section: 'camera' },
    { id: 'panel:miniconsole', place: 'home', section: 'console', steps: 2, compactSteps: 1 },
    { id: 'panel:spoolman', place: 'home', section: 'camera' },
    { id: 'home:start-print', place: 'home', steps: 2 },
    { id: 'home:pause-resume-cancel', place: 'home' },
    { id: 'home:preheat-presets', place: 'home', section: 'ready' },
    { id: 'home:home-all', place: 'home', section: 'ready' },
    { id: 'home:spool-tracker', place: 'home', section: 'camera' },
    { id: 'home:reprint', place: 'home', section: 'camera' },
    { id: 'home:exclude-object', place: 'home', steps: 2 },
    { id: 'home:pause-at-layer', place: 'home', steps: 2 },
    { id: 'home:speed-and-flow', place: 'home', steps: 2 },
    { id: 'home:print-timeline', place: 'home' },
    { id: 'home:error-explainer', place: 'home' },

    ...onPage('print', 'files', ['route:gcodefiles', 'print:upload', 'print:start-file', 'print:add-to-queue']),
    ...onPage('print', 'queue', ['print:job-queue']),
    ...onPage('print', 'preview', ['route:gcodeviewer']),

    ...onPage('tune', 'move', ['panel:toolhead-control', 'tune:jog', 'tune:home-axes']),
    ...onPage('tune', 'move', ['tune:go-to-position', 'tune:motors-off'], 'goto'),
    ...onPage('tune', 'move', ['tune:z-offset', 'tune:save-z-offset'], 'first-layer'),
    ...onPage('tune', 'extruder', [
        'panel:extruder-control',
        'tune:extrude-retract',
        'tune:pressure-advance',
        'tune:extrusion-factor',
        'tune:firmware-retraction',
    ]),
    ...onPage('tune', 'extruder', ['panel:afc', 'panel:mmu'], 'filament'),
    ...onPage('tune', 'bed-level', ['route:heightmap', 'tune:bed-mesh'], 'mesh'),
    ...onPage('tune', 'bed-level', ['tune:bed-leveling-tools'], 'level'),
    ...onPage('tune', 'heater-tuning', ['panel:temperature', 'tune:set-temperatures']),
    ...onPage('tune', 'heater-tuning', ['tune:pid-calibrate'], 'pid'),
    ...onPage('tune', 'resonance', ['tune:input-shaper']),
    ...onPage('tune', 'limits', ['panel:machine-settings', 'tune:motion-limits']),
    ...onPage('tune', 'limits', ['tune:speed-factor'], 'speed'),
    ...onPage('tune', 'macros', ['panel:macros', 'panel:macrogroup']),

    ...onPage('fix', 'status', ['panel:klippy-state', 'panel:min-settings', 'fix:restart']),
    ...onPage('fix', 'status', ['machine:endstops'], 'endstops'),
    ...onPage('fix', 'console', ['route:console']),
    ...onPage('fix', 'logs', ['machine:logfiles']),

    ...onPage('machine', 'config', ['route:machine', 'machine:config-files']),
    ...onPage('machine', 'updates', ['machine:update-manager']),
    ...onPage('machine', 'system', ['machine:system-loads']),
    ...onPage('machine', 'outputs', ['panel:miscellaneous', 'panel:led-effects']),
    ...onPage('machine', 'history', ['route:history']),
    ...onPage('machine', 'timelapse', ['route:timelapse']),
    ...onPage('machine', 'cameras', ['route:webcam']),
    ...onPage('machine', 'printers', ['route:farm']),

    ...settingsTabNames.map((name): ShellFeature => ({ id: `settings:${name}`, place: 'settings', tab: name })),
    { id: 'settings:interface-shell', place: 'settings', tab: 'ui-settings' },
]

export const featureClicks = (feature: ShellFeature): number => {
    const steps = feature.steps ?? 1
    if (feature.place === 'rail') return steps

    return 1 + (feature.tab === undefined ? 0 : 1) + steps
}

const firstHomeSections = Object.values(homeSections).map((sections) => sections[0].id)

export const compactFeatureClicks = (feature: ShellFeature): number => {
    const steps = feature.compactSteps ?? feature.steps ?? 1
    if (feature.place === 'rail') return steps
    if (feature.place !== 'home') return 1 + (feature.tab === undefined ? 0 : 1) + steps

    const opensWithHome = feature.section === undefined || firstHomeSections.includes(feature.section)

    return 1 + (opensWithHome ? 0 : 1) + steps
}

export const findShellFeature = (id: string): ShellFeature | undefined => {
    return shellFeatures.find((feature) => feature.id === id)
}

export const featurePath = (feature: ShellFeature): string | null => {
    if (feature.place === 'rail') return null

    return shellPath(feature.place, feature.tab ?? null)
}
