import type { GuiStateLayoutoption } from '@/store/gui/types'
import { allDashboardPanels } from '@/store/variables'
import { sanitizeLayoutName } from './layoutNames'

export { MAX_LAYOUT_NAME_LENGTH, sanitizeLayoutName, uniqueLayoutName } from './layoutNames'

export type DashboardViewport = 'mobile' | 'tablet' | 'desktop' | 'widescreen'
export type PanelDensity = 'compact' | 'normal' | 'expanded'
export type CustomLayoutState = 'printing' | 'error'

export const dashboardViewports: DashboardViewport[] = ['mobile', 'tablet', 'desktop', 'widescreen']
export const customLayoutStates: CustomLayoutState[] = ['printing', 'error']

export const COLUMN_WIDTH_UNITS = 24
export const MIN_COLUMN_WIDTH_UNITS = 4
export const MAX_NAMED_LAYOUTS = 24
export const DEFAULT_LAYOUT_ID = 'default'
export const LAYOUT_EXPORT_FORMAT = 'mainsail-dashboard-layout'
export const LAYOUT_EXPORT_VERSION = 1

const MAX_IMPORT_LENGTH = 200000
const MAX_PANELS_PER_COLUMN = 64
const MAX_PANEL_NAME_LENGTH = 80

export const columnLimits: Record<DashboardViewport, { min: number; max: number; default: number }> = {
    mobile: { min: 1, max: 1, default: 1 },
    tablet: { min: 1, max: 2, default: 2 },
    desktop: { min: 1, max: 3, default: 2 },
    widescreen: { min: 1, max: 4, default: 3 },
}

const stockColumnWidths: Record<string, number[]> = {
    'desktop:2': [10, 14],
    'widescreen:2': [10, 14],
    'widescreen:3': [6, 10, 8],
}

const expandablePanels = ['miniconsole', 'temperature', 'print-hero']

export interface DashboardColumns {
    count: number
    widths: number[]
}

export type DashboardColumnPanels = Record<string, GuiStateLayoutoption[]>

export interface DashboardLayoutSnapshot {
    panels: DashboardColumnPanels
    stateLayouts: Record<CustomLayoutState, DashboardColumnPanels>
    columns: Record<DashboardViewport, DashboardColumns>
    density: Record<string, PanelDensity>
}

export interface NamedLayoutEntry {
    id: string
    name: string
    order: number
}

export interface NamedLayouts {
    activeId: string
    layouts: NamedLayoutEntry[]
}

export type LayoutImportError =
    | 'not-json'
    | 'too-large'
    | 'not-a-layout'
    | 'unsupported-version'
    | 'invalid-name'
    | 'invalid-structure'
    | 'unknown-panel'
    | 'duplicate-panel'
    | 'invalid-columns'
    | 'invalid-density'

export type LayoutImportResult =
    | { ok: true; name: string; snapshot: DashboardLayoutSnapshot }
    | { ok: false; error: LayoutImportError; detail: string }

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

export const isDashboardViewport = (viewport: string): viewport is DashboardViewport => {
    return (dashboardViewports as string[]).includes(viewport)
}

export const getColumnKey = (viewport: DashboardViewport, column: number): string => {
    return columnLimits[viewport].max === 1 ? `${viewport}Layout` : `${viewport}Layout${column}`
}

// column argument of gui/getPanels: a viewport with a single possible column has no column number
export const getColumnNumber = (viewport: DashboardViewport, index: number): number => {
    return columnLimits[viewport].max === 1 ? 0 : index + 1
}

export const getAllColumnKeys = (viewport: string): string[] => {
    if (!isDashboardViewport(viewport)) return []

    return Array.from({ length: columnLimits[viewport].max }, (_, index) => getColumnKey(viewport, index + 1))
}

export const getDefaultColumnWidths = (viewport: DashboardViewport, count: number): number[] => {
    const stock = stockColumnWidths[`${viewport}:${count}`]
    if (stock) return [...stock]

    const base = Math.floor(COLUMN_WIDTH_UNITS / count)
    const widths = Array.from({ length: count }, () => base)
    widths[count - 1] += COLUMN_WIDTH_UNITS - base * count

    return widths
}

const isValidWidths = (widths: unknown, count: number): widths is number[] => {
    if (!Array.isArray(widths) || widths.length !== count) return false
    if (!widths.every((width) => Number.isInteger(width) && width >= MIN_COLUMN_WIDTH_UNITS)) return false

    return sum(widths) === COLUMN_WIDTH_UNITS
}

const isValidCount = (viewport: DashboardViewport, count: unknown): count is number => {
    const limits = columnLimits[viewport]

    return Number.isInteger(count) && (count as number) >= limits.min && (count as number) <= limits.max
}

export const resolveColumns = (viewport: DashboardViewport, stored: unknown): DashboardColumns => {
    const limits = columnLimits[viewport]
    const record = isRecord(stored) ? stored : {}
    const storedCount = typeof record.count === 'number' && Number.isFinite(record.count) ? record.count : null
    const count =
        storedCount === null ? limits.default : Math.min(limits.max, Math.max(limits.min, Math.floor(storedCount)))
    const widths = isValidWidths(record.widths, count) ? [...record.widths] : getDefaultColumnWidths(viewport, count)

    return { count, widths }
}

export const getActiveColumnKeys = (viewport: string, storedColumns: unknown): string[] => {
    if (!isDashboardViewport(viewport)) return []

    const stored = isRecord(storedColumns) ? storedColumns[viewport] : undefined

    return getAllColumnKeys(viewport).slice(0, resolveColumns(viewport, stored).count)
}

export const columnWidthPercent = (units: number): number => (units / COLUMN_WIDTH_UNITS) * 100

export const moveColumnDivider = (widths: number[], index: number, delta: number): number[] => {
    if (index < 0 || index >= widths.length - 1) return [...widths]

    const pair = widths[index] + widths[index + 1]
    const left = Math.min(pair - MIN_COLUMN_WIDTH_UNITS, Math.max(MIN_COLUMN_WIDTH_UNITS, widths[index] + delta))
    const result = [...widths]
    result[index] = left
    result[index + 1] = pair - left

    return result
}

export const redistributeColumns = (columns: GuiStateLayoutoption[][], count: number): GuiStateLayoutoption[][] => {
    const kept = Array.from({ length: count }, (_, index) => [...(columns[index] ?? [])])
    kept[count - 1].push(...columns.slice(count).flat())

    return kept
}

export const getPanelDensityOptions = (name: string): PanelDensity[] => {
    return expandablePanels.includes(name) ? ['compact', 'normal', 'expanded'] : ['compact', 'normal']
}

export const resolvePanelDensity = (name: string, stored: unknown): PanelDensity => {
    const value = isRecord(stored) ? stored[name] : undefined

    return getPanelDensityOptions(name).find((option) => option === value) ?? 'normal'
}

export const nextPanelDensity = (name: string, current: PanelDensity): PanelDensity => {
    const order: PanelDensity[] = ['normal', 'expanded', 'compact']
    const options = order.filter((option) => getPanelDensityOptions(name).includes(option))

    return options[(options.indexOf(current) + 1) % options.length]
}

const sanitizePanels = (list: unknown[], seen: Set<string>): GuiStateLayoutoption[] => {
    const panels: GuiStateLayoutoption[] = []

    list.slice(0, MAX_PANELS_PER_COLUMN).forEach((entry) => {
        if (!isRecord(entry) || typeof entry.name !== 'string') return
        if (entry.name === '' || entry.name.length > MAX_PANEL_NAME_LENGTH || seen.has(entry.name)) return

        seen.add(entry.name)
        panels.push({ name: entry.name, visible: entry.visible !== false })
    })

    return panels
}

const clonePanels = (panels: DashboardColumnPanels, keys: string[]): DashboardColumnPanels => {
    const result: DashboardColumnPanels = {}
    keys.forEach((key) => {
        if (Array.isArray(panels[key])) result[key] = panels[key].map((panel) => ({ ...panel }))
    })

    return result
}

const normalizeIdlePanels = (raw: unknown, fallback: DashboardLayoutSnapshot | null): DashboardColumnPanels => {
    const source = isRecord(raw) ? raw : {}
    const result: DashboardColumnPanels = {}

    dashboardViewports.forEach((viewport) => {
        const keys = getAllColumnKeys(viewport)
        const present = keys.filter((key) => source[key] !== undefined)
        const usable = present.length > 0 && present.every((key) => Array.isArray(source[key]))

        if (!usable) {
            keys.forEach((key) => (result[key] = []))
            Object.assign(result, clonePanels(fallback?.panels ?? {}, keys))
            return
        }

        const seen = new Set<string>()
        keys.forEach((key) => (result[key] = sanitizePanels((source[key] as unknown[] | undefined) ?? [], seen)))
    })

    return result
}

const normalizeStatePanels = (raw: unknown): DashboardColumnPanels => {
    const source = isRecord(raw) ? raw : {}
    const result: DashboardColumnPanels = {}

    dashboardViewports.forEach((viewport) => {
        const seen = new Set<string>()
        getAllColumnKeys(viewport).forEach((key) => {
            const list = source[key]
            if (Array.isArray(list)) result[key] = sanitizePanels(list, seen)
        })
    })

    return result
}

const normalizeDensity = (raw: unknown): Record<string, PanelDensity> => {
    const result: Record<string, PanelDensity> = {}
    if (!isRecord(raw)) return result

    Object.keys(raw).forEach((name) => {
        const density = resolvePanelDensity(name, raw)
        if (density !== 'normal') result[name] = density
    })

    return result
}

export const normalizeSnapshot = (raw: unknown, fallback: DashboardLayoutSnapshot | null): DashboardLayoutSnapshot => {
    const usable = isRecord(raw)
    const source = usable ? raw : {}
    const fallbackSource: Partial<DashboardLayoutSnapshot> = usable ? {} : (fallback ?? {})
    const stateLayouts = isRecord(source.stateLayouts) ? source.stateLayouts : (fallbackSource.stateLayouts ?? {})
    const storedColumns = isRecord(source.columns) ? source.columns : (fallbackSource.columns ?? {})

    return {
        panels: normalizeIdlePanels(source.panels, fallback),
        stateLayouts: {
            printing: normalizeStatePanels((stateLayouts as Record<string, unknown>).printing),
            error: normalizeStatePanels((stateLayouts as Record<string, unknown>).error),
        },
        columns: {
            mobile: resolveColumns('mobile', (storedColumns as Record<string, unknown>).mobile),
            tablet: resolveColumns('tablet', (storedColumns as Record<string, unknown>).tablet),
            desktop: resolveColumns('desktop', (storedColumns as Record<string, unknown>).desktop),
            widescreen: resolveColumns('widescreen', (storedColumns as Record<string, unknown>).widescreen),
        },
        density: normalizeDensity(usable ? source.density : fallbackSource.density),
    }
}

export const captureSnapshot = (
    dashboard: unknown,
    fallback: DashboardLayoutSnapshot | null
): DashboardLayoutSnapshot => {
    const source = isRecord(dashboard) ? dashboard : {}

    return normalizeSnapshot(
        {
            panels: source,
            stateLayouts: isRecord(source.stateLayouts) ? source.stateLayouts : {},
            columns: isRecord(source.columns) ? source.columns : {},
            density: isRecord(source.panelDensity) ? source.panelDensity : {},
        },
        fallback
    )
}

const isValidLayoutId = (id: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(id)

export const resolveNamedLayouts = (stored: unknown): NamedLayouts => {
    const source = isRecord(stored) ? stored : {}
    const items = isRecord(source.items) ? source.items : {}

    const layouts: NamedLayoutEntry[] = Object.keys(items)
        .filter((id) => isValidLayoutId(id) && isRecord(items[id]))
        .map((id) => {
            const item = items[id] as Record<string, unknown>

            return {
                id,
                name: sanitizeLayoutName(item.name),
                order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : 0,
            }
        })
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .slice(0, MAX_NAMED_LAYOUTS)

    if (layouts.length === 0) layouts.push({ id: DEFAULT_LAYOUT_ID, name: '', order: 0 })

    const activeId = layouts.find((layout) => layout.id === source.active)?.id ?? layouts[0].id

    return { activeId, layouts }
}

export const getStoredSnapshot = (
    stored: unknown,
    id: string,
    fallback: DashboardLayoutSnapshot
): DashboardLayoutSnapshot => {
    const items = isRecord(stored) && isRecord(stored.items) ? stored.items : {}
    const item = items[id]

    return normalizeSnapshot(isRecord(item) ? item.snapshot : undefined, fallback)
}

export const serializeLayoutExport = (name: string, snapshot: DashboardLayoutSnapshot): string => {
    return JSON.stringify(
        {
            format: LAYOUT_EXPORT_FORMAT,
            version: LAYOUT_EXPORT_VERSION,
            name,
            layout: snapshot,
        },
        null,
        2
    )
}

export const layoutExportFilename = (name: string): string => {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return `mainsail-layout-${slug || 'dashboard'}.json`
}

class ImportFailure extends Error {
    constructor(
        readonly code: LayoutImportError,
        readonly detail: string = ''
    ) {
        super(code)
    }
}

const expectKeys = (
    value: unknown,
    path: string,
    required: string[],
    optional: string[] = []
): Record<string, unknown> => {
    if (!isRecord(value)) throw new ImportFailure('invalid-structure', path)

    const prefix = path === '' ? '' : `${path}.`
    const missing = required.find((key) => !(key in value))
    if (missing !== undefined) throw new ImportFailure('invalid-structure', prefix + missing)

    const unknown = Object.keys(value).find((key) => !required.includes(key) && !optional.includes(key))
    if (unknown !== undefined) throw new ImportFailure('invalid-structure', prefix + unknown)

    return value
}

const isKnownPanelName = (name: string): boolean => {
    return allDashboardPanels.includes(name) || /^macrogroup_[A-Za-z0-9_-]{1,64}$/.test(name)
}

const validateImportColumns = (raw: unknown): void => {
    const columns = expectKeys(raw, 'layout.columns', [], dashboardViewports)

    Object.keys(columns).forEach((viewport) => {
        const path = `layout.columns.${viewport}`
        const entry = columns[viewport]
        if (!isRecord(entry)) throw new ImportFailure('invalid-columns', path)

        const keys = Object.keys(entry).sort().join(',')
        if (keys !== 'count,widths') throw new ImportFailure('invalid-columns', path)
        if (!isValidCount(viewport as DashboardViewport, entry.count)) throw new ImportFailure('invalid-columns', path)
        if (!isValidWidths(entry.widths, entry.count)) throw new ImportFailure('invalid-columns', path)
    })
}

const validateImportPanels = (raw: unknown, path: string, columns: Record<string, unknown>): void => {
    const allKeys = dashboardViewports.flatMap((viewport) => getAllColumnKeys(viewport))
    const panels = expectKeys(raw, path, [], allKeys)

    dashboardViewports.forEach((viewport) => {
        const seen = new Set<string>()
        const activeKeys = getActiveColumnKeys(viewport, columns)

        getAllColumnKeys(viewport).forEach((key) => {
            const list = panels[key]
            if (list === undefined) return
            if (!Array.isArray(list) || list.length > MAX_PANELS_PER_COLUMN) {
                throw new ImportFailure('invalid-structure', `${path}.${key}`)
            }
            if (list.length > 0 && !activeKeys.includes(key))
                throw new ImportFailure('invalid-columns', `${path}.${key}`)

            list.forEach((entry, index) => {
                const entryPath = `${path}.${key}[${index}]`
                const panel = expectKeys(entry, entryPath, ['name', 'visible'])
                if (typeof panel.name !== 'string' || typeof panel.visible !== 'boolean') {
                    throw new ImportFailure('invalid-structure', entryPath)
                }
                if (!isKnownPanelName(panel.name)) throw new ImportFailure('unknown-panel', panel.name)
                if (seen.has(panel.name)) throw new ImportFailure('duplicate-panel', panel.name)

                seen.add(panel.name)
            })
        })
    })
}

const validateImportDensity = (raw: unknown): void => {
    if (!isRecord(raw)) throw new ImportFailure('invalid-structure', 'layout.density')

    Object.keys(raw).forEach((name) => {
        if (!isKnownPanelName(name)) throw new ImportFailure('unknown-panel', name)
        if (!(['compact', 'normal', 'expanded'] as unknown[]).includes(raw[name])) {
            throw new ImportFailure('invalid-density', name)
        }
    })
}

export const parseLayoutImport = (text: string, fallback: DashboardLayoutSnapshot): LayoutImportResult => {
    if (text.length > MAX_IMPORT_LENGTH) return { ok: false, error: 'too-large', detail: '' }

    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return { ok: false, error: 'not-json', detail: '' }
    }

    if (!isRecord(data) || data.format !== LAYOUT_EXPORT_FORMAT) return { ok: false, error: 'not-a-layout', detail: '' }
    if (data.version !== LAYOUT_EXPORT_VERSION) {
        return { ok: false, error: 'unsupported-version', detail: String(data.version) }
    }

    try {
        expectKeys(data, '', ['format', 'version', 'name', 'layout'])

        const name = sanitizeLayoutName(data.name)
        if (name === '') throw new ImportFailure('invalid-name')

        const layout = expectKeys(data.layout, 'layout', ['panels', 'stateLayouts', 'columns', 'density'])
        validateImportColumns(layout.columns)

        const columns = layout.columns as Record<string, unknown>
        validateImportPanels(layout.panels, 'layout.panels', columns)

        const stateLayouts = expectKeys(layout.stateLayouts, 'layout.stateLayouts', [], customLayoutStates)
        Object.keys(stateLayouts).forEach((layoutState) => {
            validateImportPanels(stateLayouts[layoutState], `layout.stateLayouts.${layoutState}`, columns)
        })
        validateImportDensity(layout.density)

        return { ok: true, name, snapshot: normalizeSnapshot(layout, fallback) }
    } catch (error) {
        if (error instanceof ImportFailure) return { ok: false, error: error.code, detail: error.detail }

        throw error
    }
}

const densityHeightFactors: Record<PanelDensity, number> = { compact: 0.7, normal: 1, expanded: 1.6 }

export const applyDensityToHeight = (height: number, density: PanelDensity): number => {
    return Math.round(height * densityHeightFactors[density])
}
