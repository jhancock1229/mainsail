import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import Vuex, { Store } from 'vuex'
import { actions } from '@/store/gui/actions'
import { mutations } from '@/store/gui/mutations'
import { getDefaultState } from '@/store/gui'
import { HomeArrangement, defaultHomeArrangement, resolveHomeLayouts } from '@/plugins/shellHomeLayout'
import { resolveNamedLayouts } from '@/plugins/dashboardNamedLayouts'
import type { GuiState, GuiStateLayoutoption } from '@/store/gui/types'

Vue.use(Vuex)

type GuiStore = Store<{ gui: GuiState }>

const panel = (name: string, visible = true): GuiStateLayoutoption => ({ name, visible })
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

let database: Record<string, unknown>
let emit: ReturnType<typeof vi.fn>

const read = (key: string): unknown => {
    return key
        .split('.')
        .reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], database)
}

const write = (key: string, value: unknown): void => {
    const parts = key.split('.')
    let target = database
    parts.slice(0, -1).forEach((part) => {
        target[part] ??= {}
        target = target[part] as Record<string, unknown>
    })
    if (value === undefined) delete target[parts[parts.length - 1]]
    else target[parts[parts.length - 1]] = clone(value)
}

const connect = (): void => {
    emit = vi.fn((method: string, params: { key: string; value?: unknown }) => {
        if (method === 'server.database.post_item') write(params.key, params.value)
        if (method === 'server.database.delete_item') write(params.key, undefined)
    })
    const emitAndWait = vi.fn(async (_method: string, params: { key: string }) => {
        const value = read(params.key)
        if (value === undefined) throw { code: 404, message: 'not found' }

        return { namespace: 'mainsail', key: params.key, value: clone(value) }
    })
    ;(Vue as unknown as { $socket: unknown }).$socket = { emit, emitAndWait }
}

const createStore = (prepare: (state: GuiState) => void = () => {}): GuiStore => {
    const state = getDefaultState()
    prepare(state)

    return new Vuex.Store({
        modules: { gui: { namespaced: true, state, actions, mutations } },
    }) as unknown as GuiStore
}

const writes = (): string[] =>
    emit.mock.calls.filter(([method]) => method !== 'server.database.get_item').map(([, params]) => params.key)

beforeEach(() => {
    database = {}
    connect()
})

describe('dashboard layouts with a second session', () => {
    const remoteDashboard = () => ({
        desktopLayout1: [panel('webcam')],
        desktopLayout2: [panel('miniconsole')],
        namedLayouts: {
            active: 'b',
            items: {
                default: { name: '', order: 0, snapshot: { panels: { desktopLayout1: [panel('macros')] } } },
                b: { name: 'B', order: 1 },
                c: { name: 'C', order: 2, snapshot: { panels: { desktopLayout1: [panel('temperature')] } } },
            },
        },
    })
    const staleStore = () =>
        createStore((state) => {
            state.dashboard.desktopLayout1 = [panel('macros')]
            state.dashboard.namedLayouts = {
                active: 'default',
                items: { default: { name: '', order: 0 }, b: { name: 'B', order: 1 }, c: { name: 'C', order: 2 } },
            }
        })

    it('switches from what the database holds, not from a stale copy', async () => {
        database.dashboard = remoteDashboard()
        const store = staleStore()

        await store.dispatch('gui/switchDashboardLayout', 'c')

        expect(read('dashboard.namedLayouts.active')).toBe('c')
        expect(read('dashboard.desktopLayout1')).toEqual([panel('temperature')])
        expect(read('dashboard.namedLayouts.items.b.snapshot.panels.desktopLayout1')).toEqual([panel('webcam')])
        expect(read('dashboard.namedLayouts.items.default.snapshot.panels.desktopLayout1')).toEqual([panel('macros')])
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('temperature')])
    })

    it('does nothing when the other session already switched to the wanted layout', async () => {
        database.dashboard = remoteDashboard()
        const store = staleStore()

        await store.dispatch('gui/switchDashboardLayout', 'b')

        expect(writes()).toEqual([])
        expect(resolveNamedLayouts(store.state.gui.dashboard.namedLayouts).activeId).toBe('b')
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('webcam')])
    })

    it('reloads instead of writing an edit into the layout the other session made active', async () => {
        database.dashboard = remoteDashboard()
        const store = staleStore()

        const applied = await store.dispatch('gui/editDashboardLayout', {
            action: 'saveSetting',
            payload: { name: 'dashboard.desktopLayout1', value: [panel('toolhead-control')] },
        })

        expect(applied).toBe(false)
        expect(writes()).toEqual([])
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('webcam')])
        expect(resolveNamedLayouts(store.state.gui.dashboard.namedLayouts).activeId).toBe('b')
    })

    it('applies an edit when the active layout is still the same', async () => {
        const store = createStore()
        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout2', value: [panel('webcam')] })

        const applied = await store.dispatch('gui/editDashboardLayout', {
            action: 'saveSetting',
            payload: { name: 'dashboard.desktopLayout1', value: [panel('toolhead-control')] },
        })

        expect(applied).toBe(true)
        expect(read('dashboard.desktopLayout1')).toEqual([panel('toolhead-control')])
        expect(store.state.gui.dashboard.desktopLayout2).toEqual([panel('webcam')])
    })

    it('applies two edits that are made at the same moment', async () => {
        const store = createStore()
        const edit = (name: string, value: GuiStateLayoutoption[]) =>
            store.dispatch('gui/editDashboardLayout', { action: 'saveSetting', payload: { name, value } })

        await Promise.all([
            edit('dashboard.desktopLayout1', [panel('miniconsole'), panel('webcam')]),
            edit('dashboard.desktopLayout2', [panel('temperature')]),
        ])

        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('miniconsole'), panel('webcam')])
        expect(store.state.gui.dashboard.desktopLayout2).toEqual([panel('temperature')])
        expect(read('dashboard.desktopLayout1')).toEqual([panel('miniconsole'), panel('webcam')])
    })

    it('keeps the defaults for keys the database does not have', async () => {
        database.dashboard = { desktopLayout1: [panel('webcam')] }
        const store = createStore()

        await store.dispatch('gui/editDashboardLayout', {
            action: 'saveSetting',
            payload: { name: 'dashboard.showLayoutBar', value: false },
        })

        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('webcam')])
        expect(store.state.gui.dashboard.stateLayouts.enabled).toBe(true)
        expect(store.state.gui.dashboard.mobileLayout).toEqual(getDefaultState().dashboard.mobileLayout)
    })

    it('still works without a connection to read from', async () => {
        ;(Vue as unknown as { $socket: unknown }).$socket = { emit }
        const store = staleStore()

        expect(
            await store.dispatch('gui/editDashboardLayout', {
                action: 'saveSetting',
                payload: { name: 'dashboard.desktopLayout1', value: [panel('toolhead-control')] },
            })
        ).toBe(true)
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('toolhead-control')])
    })
})

describe('Home layouts with a second session', () => {
    const custom: HomeArrangement = [
        { mode: 'split', blocks: ['ready'] },
        { mode: 'tabs', blocks: ['start', 'macros'] },
        { mode: 'split', blocks: ['camera', 'heat'] },
    ]
    const remotePrinting: HomeArrangement = [
        { mode: 'split', blocks: ['job'] },
        { mode: 'split', blocks: ['camera'] },
        { mode: 'split', blocks: ['heat', 'events'] },
    ]
    const twoLayouts = (active: string, layoutOfA: unknown = undefined) => ({
        active,
        showMenu: true,
        items: { a: { name: 'A', order: 0, layout: layoutOfA }, b: { name: 'B', order: 1 } },
    })

    it('reloads instead of saving an arrangement when the other session switched the layout', async () => {
        database.shellHome = twoLayouts('b')
        const store = createStore((state) => (state.shellHome = twoLayouts('a')))

        const result = await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: custom })

        expect(result).toBe('stale')
        expect(writes()).toEqual([])
        expect(resolveHomeLayouts(store.state.gui.shellHome).activeId).toBe('b')
    })

    it('keeps what the other session changed in the same layout', async () => {
        database.shellHome = twoLayouts('a', { states: { printing: remotePrinting } })
        const store = createStore((state) => (state.shellHome = twoLayouts('a')))

        const result = await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: custom })

        expect(result).toBe('saved')
        expect(read('shellHome.items.a.layout.states.idle')).toEqual(custom)
        expect(read('shellHome.items.a.layout.states.printing')).toEqual(remotePrinting)
    })

    it('reports an arrangement that cannot be saved', async () => {
        const store = createStore()

        expect(
            await store.dispatch('gui/saveHomeArrangement', {
                state: 'printing',
                columns: defaultHomeArrangement('idle'),
            })
        ).toBe('invalid')
    })

    it('switches and deletes from the list the database holds', async () => {
        database.shellHome = {
            active: 'a',
            items: { a: { name: 'A', order: 0 }, b: { name: 'B', order: 1 }, c: { name: 'C', order: 2 } },
        }
        const store = createStore((state) => (state.shellHome = twoLayouts('a')))

        await store.dispatch('gui/switchHomeLayout', 'c')
        expect(read('shellHome.active')).toBe('c')

        await store.dispatch('gui/deleteHomeLayout', 'c')
        expect(read('shellHome.items.c')).toBeUndefined()
        expect(resolveHomeLayouts(store.state.gui.shellHome).layouts.map((entry) => entry.id)).toEqual(['a', 'b'])
    })
})
