export type ShellPageId = 'home' | 'print' | 'tune' | 'fix' | 'machine' | 'settings'
export type InterfaceShell = 'new' | 'classic'

export const DEFAULT_INTERFACE_SHELL: InterfaceShell = 'new'
export const SHELL_MIN_WIDTH = 960
export const MAX_FEATURE_CLICKS = 3

export interface ShellTabRequirement {
    moonrakerComponent?: string
    klipperObject?: string
    registeredDirectory?: string
    farm?: boolean
}

export interface ShellTab extends ShellTabRequirement {
    id: string
    legacyPaths?: string[]
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
            { id: 'move' },
            { id: 'extruder' },
            { id: 'bed-level', legacyPaths: ['/heightmap'] },
            { id: 'heater-tuning' },
            { id: 'resonance' },
            { id: 'limits' },
            { id: 'macros' },
        ],
    },
    {
        id: 'fix',
        path: '/fix',
        tabs: [{ id: 'status' }, { id: 'console', legacyPaths: ['/console'] }, { id: 'logs' }],
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
    if (tab.registeredDirectory && !available.registeredDirectories.includes(tab.registeredDirectory)) return false
    if (tab.farm && !available.farm) return false

    return true
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
    const offered = (page: ShellPage): ShellTab[] => {
        return available === undefined ? page.tabs : page.tabs.filter((tab) => isShellTabAvailable(tab, available))
    }
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

export const isClassicForced = (viewportWidth: number): boolean => viewportWidth < SHELL_MIN_WIDTH

export const resolveInterfaceShell = (setting: unknown, viewportWidth: number): InterfaceShell => {
    if (isClassicForced(viewportWidth)) return 'classic'

    return setting === 'classic' ? 'classic' : DEFAULT_INTERFACE_SHELL
}

export type ShellFeaturePlace = ShellPageId | 'rail'

export interface ShellFeature {
    id: string
    place: ShellFeaturePlace
    tab?: string
    steps?: number
}

const onPage = (place: ShellPageId, tab: string, ids: string[]): ShellFeature[] => {
    return ids.map((id) => ({ id, place, tab }))
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
    { id: 'topbar:settings', place: 'settings', steps: 0 },
    { id: 'topbar:upload-and-print', place: 'home' },

    { id: 'route:dashboard', place: 'home', steps: 0 },
    { id: 'panel:status', place: 'home' },
    { id: 'panel:print-hero', place: 'home' },
    { id: 'panel:webcam', place: 'home' },
    { id: 'panel:miniconsole', place: 'home', steps: 2 },
    { id: 'panel:spoolman', place: 'home' },
    { id: 'home:start-print', place: 'home', steps: 2 },
    { id: 'home:pause-resume-cancel', place: 'home' },
    { id: 'home:preheat-presets', place: 'home' },
    { id: 'home:home-all', place: 'home' },
    { id: 'home:spool-tracker', place: 'home' },
    { id: 'home:reprint', place: 'home' },
    { id: 'home:exclude-object', place: 'home', steps: 2 },
    { id: 'home:pause-at-layer', place: 'home', steps: 2 },
    { id: 'home:speed-and-flow', place: 'home', steps: 2 },
    { id: 'home:print-timeline', place: 'home' },
    { id: 'home:error-explainer', place: 'home' },

    ...onPage('print', 'files', ['route:gcodefiles', 'print:upload', 'print:start-file', 'print:add-to-queue']),
    ...onPage('print', 'queue', ['print:job-queue']),
    ...onPage('print', 'preview', ['route:gcodeviewer']),

    ...onPage('tune', 'move', [
        'panel:toolhead-control',
        'tune:jog',
        'tune:home-axes',
        'tune:go-to-position',
        'tune:motors-off',
        'tune:z-offset',
        'tune:save-z-offset',
    ]),
    ...onPage('tune', 'extruder', [
        'panel:extruder-control',
        'panel:afc',
        'panel:mmu',
        'tune:extrude-retract',
        'tune:pressure-advance',
        'tune:extrusion-factor',
        'tune:firmware-retraction',
    ]),
    ...onPage('tune', 'bed-level', ['route:heightmap', 'tune:bed-mesh', 'tune:bed-leveling-tools']),
    ...onPage('tune', 'heater-tuning', ['panel:temperature', 'tune:set-temperatures', 'tune:pid-calibrate']),
    ...onPage('tune', 'resonance', ['tune:input-shaper']),
    ...onPage('tune', 'limits', ['panel:machine-settings', 'tune:speed-factor', 'tune:motion-limits']),
    ...onPage('tune', 'macros', ['panel:macros', 'panel:macrogroup']),

    ...onPage('fix', 'status', ['panel:klippy-state', 'panel:min-settings', 'machine:endstops', 'fix:restart']),
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

export const findShellFeature = (id: string): ShellFeature | undefined => {
    return shellFeatures.find((feature) => feature.id === id)
}

export const featurePath = (feature: ShellFeature): string | null => {
    if (feature.place === 'rail') return null

    return shellPath(feature.place, feature.tab ?? null)
}
