import { sanitizeLayoutName } from './layoutNames'

export type HomeLayoutState = 'idle' | 'printing' | 'finished' | 'error'
export type HomeBlockId =
    'start' | 'ready' | 'last' | 'job' | 'problem' | 'camera' | 'console' | 'heat' | 'spool' | 'events' | 'macros'
export type HomeColumnMode = 'tabs' | 'split'
export type WhileActionId = 'nudge' | 'speed' | 'filament' | 'queue' | 'temperatures' | 'macros' | 'limits' | 'console'

export interface HomeBlock {
    id: HomeBlockId
    states: HomeLayoutState[]
    requiredIn: HomeLayoutState[]
    height: number
    grows: boolean
    ownHeading: boolean
    scrolls: boolean
}

export interface HomeColumn {
    mode: HomeColumnMode
    blocks: HomeBlockId[]
}

export type HomeArrangement = HomeColumn[]

export interface HomeLayout {
    states: Record<HomeLayoutState, HomeArrangement>
    actions: WhileActionId[]
}

export interface HomeLayoutEntry {
    id: string
    name: string
    order: number
    layout: HomeLayout
}

export interface HomeLayouts {
    activeId: string
    layouts: HomeLayoutEntry[]
}

export type HomeColumnProblem =
    'empty' | 'unknown-block' | 'not-in-state' | 'too-many' | 'too-tall' | 'required-in-tabs' | 'scrolls-with-others'
export type HomeArrangementProblem = HomeColumnProblem | 'column-count' | 'duplicate-block' | 'required-missing'

export type HomeImportError =
    | 'not-json'
    | 'too-large'
    | 'not-a-layout'
    | 'unsupported-version'
    | 'invalid-name'
    | 'invalid-structure'
    | 'invalid-arrangement'
    | 'invalid-actions'

export type HomeImportResult =
    { ok: true; name: string; layout: HomeLayout } | { ok: false; error: HomeImportError; detail: string }

export const HOME_COLUMNS = 3
export const HOME_REFERENCE_WINDOW = { width: 1280, height: 720 }
export const HOME_TAB_BAR_HEIGHT = 58
export const HOME_SPLIT_GAP = 33
export const MAX_BLOCKS_PER_COLUMN = 5
export const WHILE_ACTION_COUNT = 4
export const MAX_HOME_LAYOUTS = 24
export const DEFAULT_HOME_LAYOUT_ID = 'default'
export const HOME_EXPORT_FORMAT = 'mainsail-home-layout'
export const HOME_EXPORT_VERSION = 1

const MAX_IMPORT_LENGTH = 100000
const COLUMN_HEIGHT_WITH_ACTION_ROW = 511
const COLUMN_HEIGHT = 600

export const homeLayoutStates: HomeLayoutState[] = ['idle', 'printing', 'finished', 'error']
export const homeColumnModes: HomeColumnMode[] = ['tabs', 'split']

const everyState = homeLayoutStates
const afterStart: HomeLayoutState[] = ['printing', 'finished', 'error']

export const homeBlocks: HomeBlock[] = [
    {
        id: 'start',
        states: ['idle', 'finished'],
        requiredIn: [],
        height: 260,
        grows: true,
        ownHeading: true,
        scrolls: false,
    },
    {
        id: 'ready',
        states: ['idle', 'finished'],
        requiredIn: [],
        height: 440,
        grows: false,
        ownHeading: true,
        scrolls: false,
    },
    { id: 'last', states: ['idle'], requiredIn: [], height: 156, grows: false, ownHeading: true, scrolls: false },
    {
        id: 'job',
        states: ['printing', 'finished'],
        requiredIn: ['printing', 'finished'],
        height: 495,
        grows: true,
        ownHeading: true,
        scrolls: false,
    },
    {
        id: 'problem',
        states: ['error'],
        requiredIn: ['error'],
        height: 300,
        grows: true,
        ownHeading: true,
        scrolls: true,
    },
    { id: 'camera', states: everyState, requiredIn: [], height: 174, grows: true, ownHeading: false, scrolls: false },
    { id: 'console', states: everyState, requiredIn: [], height: 214, grows: true, ownHeading: false, scrolls: false },
    { id: 'heat', states: everyState, requiredIn: [], height: 156, grows: false, ownHeading: true, scrolls: false },
    { id: 'spool', states: everyState, requiredIn: [], height: 172, grows: false, ownHeading: true, scrolls: false },
    { id: 'events', states: afterStart, requiredIn: [], height: 96, grows: true, ownHeading: true, scrolls: false },
    { id: 'macros', states: everyState, requiredIn: [], height: 190, grows: true, ownHeading: true, scrolls: false },
]

export const whileActions: WhileActionId[] = [
    'nudge',
    'speed',
    'filament',
    'queue',
    'temperatures',
    'macros',
    'limits',
    'console',
]

export const defaultWhileActions: WhileActionId[] = ['nudge', 'speed', 'filament', 'queue']

export const whileActionTargets: Record<WhileActionId, { page: string; tab: string } | null> = {
    nudge: { page: 'tune', tab: 'move' },
    speed: null,
    filament: { page: 'tune', tab: 'extruder' },
    queue: { page: 'print', tab: 'files' },
    temperatures: { page: 'tune', tab: 'heater-tuning' },
    macros: { page: 'tune', tab: 'macros' },
    limits: { page: 'tune', tab: 'limits' },
    console: { page: 'fix', tab: 'console' },
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isHomeBlockId = (value: unknown): value is HomeBlockId => homeBlocks.some((block) => block.id === value)

export const isHomeLayoutState = (value: unknown): value is HomeLayoutState => {
    return (homeLayoutStates as unknown[]).includes(value)
}

export const getHomeBlock = (id: HomeBlockId): HomeBlock => {
    return homeBlocks.find((block) => block.id === id) ?? homeBlocks[0]
}

export const homeLayoutStateFor = (shellHomeState: string): HomeLayoutState => {
    if (shellHomeState === 'paused') return 'printing'

    return isHomeLayoutState(shellHomeState) ? shellHomeState : 'idle'
}

export const blocksForState = (state: HomeLayoutState): HomeBlock[] => {
    return homeBlocks.filter((block) => block.states.includes(state))
}

export const requiredBlocks = (state: HomeLayoutState): HomeBlockId[] => {
    return homeBlocks.filter((block) => block.requiredIn.includes(state)).map((block) => block.id)
}

export const columnBudget = (state: HomeLayoutState): number => {
    return state === 'printing' ? COLUMN_HEIGHT_WITH_ACTION_ROW : COLUMN_HEIGHT
}

export const columnHeight = (column: HomeColumn): number => {
    const heights = column.blocks.map((id) => getHomeBlock(id).height)
    if (heights.length === 0) return 0
    if (heights.length === 1) return heights[0]
    if (column.mode === 'tabs') return HOME_TAB_BAR_HEIGHT + Math.max(...heights)

    return heights.reduce((sum, height) => sum + height, 0) + HOME_SPLIT_GAP * (heights.length - 1)
}

export const checkColumn = (state: HomeLayoutState, column: HomeColumn): HomeColumnProblem | null => {
    if (column.blocks.length === 0) return 'empty'
    if (column.blocks.length > MAX_BLOCKS_PER_COLUMN) return 'too-many'
    if (!column.blocks.every(isHomeBlockId)) return 'unknown-block'

    const blocks = column.blocks.map(getHomeBlock)
    if (!blocks.every((block) => block.states.includes(state))) return 'not-in-state'
    if (blocks.length > 1 && blocks.some((block) => block.scrolls)) return 'scrolls-with-others'
    if (blocks.length > 1 && column.mode === 'tabs' && blocks.some((block) => block.requiredIn.includes(state))) {
        return 'required-in-tabs'
    }
    if (columnHeight(column) > columnBudget(state)) return 'too-tall'

    return null
}

export const checkArrangement = (state: HomeLayoutState, columns: HomeArrangement): HomeArrangementProblem | null => {
    if (columns.length !== HOME_COLUMNS) return 'column-count'

    for (const column of columns) {
        const problem = checkColumn(state, column)
        if (problem !== null) return problem
    }

    const used = columns.flatMap((column) => column.blocks)
    if (new Set(used).size !== used.length) return 'duplicate-block'
    if (!requiredBlocks(state).every((id) => used.includes(id))) return 'required-missing'

    return null
}

const column = (mode: HomeColumnMode, ...blocks: HomeBlockId[]): HomeColumn => ({ mode, blocks })

export const defaultHomeArrangement = (state: HomeLayoutState): HomeArrangement => {
    if (state === 'idle')
        return [column('split', 'start'), column('split', 'ready'), column('split', 'camera', 'spool', 'last')]
    if (state === 'error') {
        return [column('split', 'problem'), column('tabs', 'console', 'camera'), column('split', 'heat', 'events')]
    }

    return [column('split', 'job'), column('tabs', 'camera', 'console'), column('split', 'heat', 'spool', 'events')]
}

export const defaultHomeLayout = (): HomeLayout => ({
    states: {
        idle: defaultHomeArrangement('idle'),
        printing: defaultHomeArrangement('printing'),
        finished: defaultHomeArrangement('finished'),
        error: defaultHomeArrangement('error'),
    },
    actions: [...defaultWhileActions],
})

const sameColumn = (a: HomeColumn, b: HomeColumn): boolean => {
    const modeMatters = a.blocks.length > 1

    return a.blocks.join() === b.blocks.join() && (!modeMatters || a.mode === b.mode)
}

export const sameArrangement = (a: HomeArrangement, b: HomeArrangement): boolean => {
    return a.length === b.length && a.every((entry, index) => sameColumn(entry, b[index]))
}

export const isDefaultArrangement = (state: HomeLayoutState, columns: HomeArrangement): boolean => {
    return sameArrangement(columns, defaultHomeArrangement(state))
}

export const isDefaultWhileActions = (actions: WhileActionId[]): boolean => {
    return actions.join() === defaultWhileActions.join()
}

const fitColumn = (state: HomeLayoutState, entry: HomeColumn): HomeColumn => {
    if (entry.mode === 'split' && checkColumn(state, entry) === 'too-tall') return { ...entry, mode: 'tabs' }

    return entry
}

const readColumn = (raw: unknown): HomeColumn => {
    const record = isRecord(raw) ? raw : {}
    const blocks = Array.isArray(record.blocks) ? record.blocks.filter(isHomeBlockId) : []

    return { mode: record.mode === 'tabs' ? 'tabs' : 'split', blocks: [...new Set(blocks)] }
}

export const normalizeArrangement = (state: HomeLayoutState, raw: unknown): HomeArrangement => {
    if (!Array.isArray(raw)) return defaultHomeArrangement(state)

    const columns = raw.map((entry) => fitColumn(state, readColumn(entry)))

    return checkArrangement(state, columns) === null ? columns : defaultHomeArrangement(state)
}

export const normalizeWhileActions = (raw: unknown): WhileActionId[] => {
    if (!Array.isArray(raw) || raw.length !== WHILE_ACTION_COUNT) return [...defaultWhileActions]

    const actions = raw.filter((entry): entry is WhileActionId => (whileActions as unknown[]).includes(entry))
    if (actions.length !== WHILE_ACTION_COUNT || new Set(actions).size !== WHILE_ACTION_COUNT) {
        return [...defaultWhileActions]
    }

    return actions
}

export const normalizeHomeLayout = (raw: unknown): HomeLayout => {
    const record = isRecord(raw) ? raw : {}
    const states = isRecord(record.states) ? record.states : {}

    return {
        states: {
            idle: normalizeArrangement('idle', states.idle),
            printing: normalizeArrangement('printing', states.printing),
            finished: normalizeArrangement('finished', states.finished),
            error: normalizeArrangement('error', states.error),
        },
        actions: normalizeWhileActions(record.actions),
    }
}

export const unusedBlocks = (state: HomeLayoutState, columns: HomeArrangement): HomeBlockId[] => {
    const used = columns.flatMap((entry) => entry.blocks)

    return blocksForState(state)
        .map((block) => block.id)
        .filter((id) => !used.includes(id))
}

const replaceColumn = (columns: HomeArrangement, index: number, entry: HomeColumn): HomeArrangement => {
    return columns.map((current, position) => (position === index ? entry : current))
}

const accept = (state: HomeLayoutState, columns: HomeArrangement): HomeArrangement | null => {
    return checkArrangement(state, columns) === null ? columns : null
}

export const addBlock = (
    state: HomeLayoutState,
    columns: HomeArrangement,
    index: number,
    id: HomeBlockId
): HomeArrangement | null => {
    const current = columns[index]
    if (current === undefined) return null

    const blocks = [...current.blocks, id]
    const mode: HomeColumnMode = current.blocks.length < 2 ? 'split' : current.mode
    const added = replaceColumn(columns, index, { mode, blocks })

    return accept(state, added) ?? accept(state, replaceColumn(columns, index, { mode: 'tabs', blocks }))
}

export const removeBlock = (
    state: HomeLayoutState,
    columns: HomeArrangement,
    index: number,
    id: HomeBlockId
): HomeArrangement | null => {
    const current = columns[index]
    if (current === undefined) return null

    return accept(
        state,
        replaceColumn(columns, index, { ...current, blocks: current.blocks.filter((block) => block !== id) })
    )
}

export const replaceBlock = (
    state: HomeLayoutState,
    columns: HomeArrangement,
    index: number,
    from: HomeBlockId,
    to: HomeBlockId
): HomeArrangement | null => {
    const current = columns[index]
    if (current === undefined) return null

    const blocks = current.blocks.map((block) => (block === from ? to : block))
    const replaced = replaceColumn(columns, index, { ...current, blocks })

    return accept(state, replaced) ?? accept(state, replaceColumn(columns, index, { mode: 'tabs', blocks }))
}

export const reorderBlocks = (
    state: HomeLayoutState,
    columns: HomeArrangement,
    index: number,
    blocks: HomeBlockId[]
): HomeArrangement | null => {
    const current = columns[index]
    if (current === undefined) return null
    if ([...blocks].sort().join() !== [...current.blocks].sort().join()) return null

    return accept(state, replaceColumn(columns, index, { ...current, blocks }))
}

export const setColumnMode = (
    state: HomeLayoutState,
    columns: HomeArrangement,
    index: number,
    mode: HomeColumnMode
): HomeArrangement | null => {
    const current = columns[index]
    if (current === undefined) return null

    return accept(state, replaceColumn(columns, index, { ...current, mode }))
}

const subsets = <T>(items: T[], min: number, max: number): T[][] => {
    const result: T[][] = []
    const walk = (start: number, picked: T[]): void => {
        if (picked.length >= min) result.push(picked)
        if (picked.length === max) return
        for (let index = start; index < items.length; index++) walk(index + 1, [...picked, items[index]])
    }
    walk(0, [])

    return result
}

export const listColumnChoices = (state: HomeLayoutState, mode: HomeColumnMode): HomeBlockId[][] => {
    const ids = blocksForState(state).map((block) => block.id)

    return subsets(ids, 2, MAX_BLOCKS_PER_COLUMN).filter((blocks) => checkColumn(state, { mode, blocks }) === null)
}

const isValidLayoutId = (id: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(id)

export const resolveHomeLayouts = (stored: unknown): HomeLayouts => {
    const source = isRecord(stored) ? stored : {}
    const items = isRecord(source.items) ? source.items : {}

    const layouts: HomeLayoutEntry[] = Object.keys(items)
        .filter((id) => isValidLayoutId(id) && isRecord(items[id]))
        .map((id) => {
            const item = items[id] as Record<string, unknown>

            return {
                id,
                name: sanitizeLayoutName(item.name),
                order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : 0,
                layout: normalizeHomeLayout(item.layout),
            }
        })
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .slice(0, MAX_HOME_LAYOUTS)

    if (layouts.length === 0) {
        layouts.push({ id: DEFAULT_HOME_LAYOUT_ID, name: '', order: 0, layout: defaultHomeLayout() })
    }

    const activeId = layouts.find((layout) => layout.id === source.active)?.id ?? layouts[0].id

    return { activeId, layouts }
}

export const serializeHomeLayout = (name: string, layout: HomeLayout): string => {
    return JSON.stringify({ format: HOME_EXPORT_FORMAT, version: HOME_EXPORT_VERSION, name, layout }, null, 2)
}

export const homeLayoutFilename = (name: string): string => {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return `mainsail-home-${slug || 'layout'}.json`
}

const hasExactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => {
    return isRecord(value) && Object.keys(value).sort().join() === [...keys].sort().join()
}

const fail = (error: HomeImportError, detail = ''): HomeImportResult => ({ ok: false, error, detail })

const readStrictArrangement = (state: HomeLayoutState, raw: unknown): HomeArrangement | string => {
    if (!Array.isArray(raw)) return 'column-count'

    const columns: HomeArrangement = []
    for (const entry of raw) {
        if (!hasExactKeys(entry, ['mode', 'blocks'])) return 'unknown-block'
        if (!(homeColumnModes as unknown[]).includes(entry.mode) || !Array.isArray(entry.blocks)) return 'unknown-block'
        if (!entry.blocks.every(isHomeBlockId)) return 'unknown-block'

        columns.push({ mode: entry.mode as HomeColumnMode, blocks: [...entry.blocks] })
    }

    return checkArrangement(state, columns) ?? columns
}

export const parseHomeLayoutImport = (text: string): HomeImportResult => {
    if (text.length > MAX_IMPORT_LENGTH) return fail('too-large')

    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return fail('not-json')
    }

    if (!isRecord(data) || data.format !== HOME_EXPORT_FORMAT) return fail('not-a-layout')
    if (data.version !== HOME_EXPORT_VERSION) return fail('unsupported-version', String(data.version))
    if (!hasExactKeys(data, ['format', 'version', 'name', 'layout'])) return fail('invalid-structure', 'file')

    const name = sanitizeLayoutName(data.name)
    if (name === '') return fail('invalid-name')

    const layout = data.layout
    if (!hasExactKeys(layout, ['states', 'actions'])) return fail('invalid-structure', 'layout')
    if (!hasExactKeys(layout.states, homeLayoutStates)) return fail('invalid-structure', 'layout.states')

    const states = {} as Record<HomeLayoutState, HomeArrangement>
    for (const state of homeLayoutStates) {
        const columns = readStrictArrangement(state, layout.states[state])
        if (typeof columns === 'string') return fail('invalid-arrangement', `${state}: ${columns}`)

        states[state] = columns
    }

    const actions = normalizeWhileActions(layout.actions)
    if (!Array.isArray(layout.actions) || actions.join() !== layout.actions.join()) return fail('invalid-actions')

    return { ok: true, name, layout: { states, actions } }
}
