import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import Vuex, { Store } from 'vuex'
import { actions } from '@/store/gui/actions'
import { mutations } from '@/store/gui/mutations'
import { getters } from '@/store/gui/getters'
import { getDefaultState } from '@/store/gui'
import { resolveNamedLayouts } from '@/plugins/dashboardNamedLayouts'
import type { GuiState, GuiStateLayoutoption } from '@/store/gui/types'

Vue.use(Vuex)

type AnyFn = (...args: unknown[]) => unknown

const panel = (name: string, visible = true): GuiStateLayoutoption => ({ name, visible })

let emit: ReturnType<typeof vi.fn>

const createStore = (prepare: (state: GuiState) => void = () => {}) => {
    const state = getDefaultState()
    prepare(state)

    return new Vuex.Store({
        modules: { gui: { namespaced: true, state, actions, mutations } },
    }) as unknown as Store<{ gui: GuiState }>
}

const stored = (path: string): unknown => {
    const db: Record<string, unknown> = {}
    emit.mock.calls.forEach(([method, params]) => {
        const keys = String(params.key).split('.')
        let target = db
        keys.slice(0, -1).forEach((key) => {
            target[key] ??= {}
            target = target[key] as Record<string, unknown>
        })
        if (method === 'server.database.post_item') target[keys[keys.length - 1]] = params.value
        if (method === 'server.database.delete_item') delete target[keys[keys.length - 1]]
    })

    return path
        .split('.')
        .reduce<unknown>(
            (value, key) => (value as Record<string, unknown> | undefined)?.[key],
            JSON.parse(JSON.stringify(db))
        )
}

const layoutNames = (store: Store<{ gui: GuiState }>) =>
    resolveNamedLayouts(store.state.gui.dashboard.namedLayouts).layouts.map((layout) => layout.name)
const activeId = (store: Store<{ gui: GuiState }>) =>
    resolveNamedLayouts(store.state.gui.dashboard.namedLayouts).activeId

beforeEach(() => {
    emit = vi.fn()
    ;(Vue as unknown as { $socket: unknown }).$socket = { emit }
})

describe('named dashboard layouts', () => {
    it('starts with the stored arrangement as the only layout, without writing anything', () => {
        const store = createStore((state) => (state.dashboard.desktopLayout1 = [panel('macros')]))

        expect(resolveNamedLayouts(store.state.gui.dashboard.namedLayouts)).toEqual({
            activeId: 'default',
            layouts: [{ id: 'default', name: '', order: 0 }],
        })
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
        expect(emit).not.toHaveBeenCalled()
    })

    it('saves the current arrangement as a new layout and makes it active', async () => {
        const store = createStore((state) => (state.dashboard.desktopLayout1 = [panel('macros')]))
        const id = await store.dispatch('gui/createDashboardLayout', { name: ' Calibration ' })

        expect(layoutNames(store)).toEqual(['', 'Calibration'])
        expect(activeId(store)).toBe(id)
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
    })

    it('keeps the arrangement of each layout when switching back and forth', async () => {
        const store = createStore((state) => (state.dashboard.desktopLayout1 = [panel('macros')]))
        const id = await store.dispatch('gui/createDashboardLayout', { name: 'Calibration' })

        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout1', value: [panel('webcam')] })
        await store.dispatch('gui/saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout1',
            value: [panel('temperature')],
        })
        await store.dispatch('gui/setDashboardPanelDensity', { name: 'macros', density: 'compact' })
        await store.dispatch('gui/setDashboardColumnWidths', { viewport: 'desktop', widths: [8, 16] })

        await store.dispatch('gui/switchDashboardLayout', 'default')
        expect(activeId(store)).toBe('default')
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
        expect(store.state.gui.dashboard.stateLayouts.printing).toEqual({})
        expect(store.state.gui.dashboard.panelDensity).toEqual({})
        expect(store.state.gui.dashboard.columns?.desktop).toEqual({ count: 2, widths: [10, 14] })

        await store.dispatch('gui/switchDashboardLayout', id)
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('webcam')])
        expect(store.state.gui.dashboard.stateLayouts.printing).toEqual({ desktopLayout1: [panel('temperature')] })
        expect(store.state.gui.dashboard.panelDensity).toEqual({ macros: 'compact' })
        expect(store.state.gui.dashboard.columns?.desktop).toEqual({ count: 2, widths: [8, 16] })
    })

    it('writes the same data to the database as to the store', async () => {
        const store = createStore()
        const id = await store.dispatch('gui/createDashboardLayout', { name: 'Calibration' })
        await store.dispatch('gui/saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout1',
            value: [panel('temperature')],
        })
        await store.dispatch('gui/switchDashboardLayout', 'default')
        await store.dispatch('gui/renameDashboardLayout', { id, name: 'Farm glance' })

        const live = JSON.parse(JSON.stringify(store.state.gui.dashboard))

        expect(stored('dashboard.namedLayouts')).toEqual(live.namedLayouts)
        expect(stored('dashboard.stateLayouts.printing')).toEqual({})
        expect(stored('dashboard.desktopLayout1')).toEqual(live.desktopLayout1)
        expect(stored(`dashboard.namedLayouts.items.${id}.snapshot.stateLayouts.printing`)).toEqual({
            desktopLayout1: [panel('temperature')],
        })
    })

    it('ignores a switch to the active or to an unknown layout', async () => {
        const store = createStore()
        await store.dispatch('gui/switchDashboardLayout', 'default')
        await store.dispatch('gui/switchDashboardLayout', 'gone')

        expect(emit).not.toHaveBeenCalled()
    })

    it('falls back to the default arrangement when the stored layout is corrupt', async () => {
        const store = createStore((state) => {
            state.dashboard.desktopLayout1 = [panel('macros')]
            state.dashboard.namedLayouts = {
                active: 'a',
                items: {
                    a: { name: 'A', order: 0 },
                    b: { name: 'B', order: 1, snapshot: { panels: { desktopLayout1: 'broken' }, columns: 7 } },
                    c: { name: 'C', order: 2 },
                },
            }
        })
        const defaults = getDefaultState().dashboard

        await store.dispatch('gui/switchDashboardLayout', 'b')
        expect(store.state.gui.dashboard.desktopLayout1).toEqual(defaults.desktopLayout1)
        expect(store.state.gui.dashboard.desktopLayout2).toEqual(defaults.desktopLayout2)

        await store.dispatch('gui/switchDashboardLayout', 'c')
        expect(store.state.gui.dashboard.mobileLayout).toEqual(defaults.mobileLayout)

        await store.dispatch('gui/switchDashboardLayout', 'a')
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
    })

    it('numbers a name that is already used and refuses an empty one', async () => {
        const store = createStore()
        await store.dispatch('gui/createDashboardLayout', { name: 'Calibration' })
        await store.dispatch('gui/createDashboardLayout', { name: 'calibration' })
        const id = await store.dispatch('gui/createDashboardLayout', { name: '   ' })

        expect(id).toBeNull()
        expect(layoutNames(store)).toEqual(['', 'Calibration', 'calibration 2'])
    })

    it('duplicates a layout that is not active from its stored arrangement, without switching', async () => {
        const store = createStore((state) => (state.dashboard.desktopLayout1 = [panel('macros')]))
        const second = await store.dispatch('gui/createDashboardLayout', { name: 'Second' })
        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout1', value: [panel('webcam')] })

        const copy = await store.dispatch('gui/createDashboardLayout', {
            name: 'Copy',
            sourceId: 'default',
            activate: false,
        })
        expect(activeId(store)).toBe(second)

        await store.dispatch('gui/switchDashboardLayout', copy)
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
    })

    it('renames a layout, also the first one that was never stored', async () => {
        const store = createStore()
        await store.dispatch('gui/renameDashboardLayout', { id: 'default', name: 'Everyday' })
        await store.dispatch('gui/renameDashboardLayout', { id: 'default', name: '  ' })
        await store.dispatch('gui/renameDashboardLayout', { id: 'gone', name: 'Nope' })

        expect(layoutNames(store)).toEqual(['Everyday'])
        expect(activeId(store)).toBe('default')
    })

    it('numbers a new name that another layout already has', async () => {
        const store = createStore()
        const id = await store.dispatch('gui/createDashboardLayout', { name: 'Calibration', activate: false })
        await store.dispatch('gui/renameDashboardLayout', { id: 'default', name: 'calibration' })
        await store.dispatch('gui/renameDashboardLayout', { id, name: 'Calibration' })

        expect(layoutNames(store)).toEqual(['calibration 2', 'Calibration'])
    })

    it('never deletes the last layout', async () => {
        const store = createStore()
        await store.dispatch('gui/deleteDashboardLayout', 'default')

        expect(layoutNames(store)).toEqual([''])
        expect(emit).not.toHaveBeenCalled()
    })

    it('switches to another layout when the active one is deleted', async () => {
        const store = createStore((state) => (state.dashboard.desktopLayout1 = [panel('macros')]))
        const id = await store.dispatch('gui/createDashboardLayout', { name: 'Calibration' })
        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout1', value: [panel('webcam')] })
        await store.dispatch('gui/deleteDashboardLayout', id)

        expect(layoutNames(store)).toEqual([''])
        expect(activeId(store)).toBe('default')
        expect(store.state.gui.dashboard.desktopLayout1).toEqual([panel('macros')])
        expect(stored(`dashboard.namedLayouts.items.${id}`)).toBeUndefined()
    })

    it('deletes a layout that is not active without touching the dashboard', async () => {
        const store = createStore()
        const id = await store.dispatch('gui/createDashboardLayout', { name: 'Calibration', activate: false })
        const before = JSON.stringify(store.state.gui.dashboard.desktopLayout1)
        await store.dispatch('gui/deleteDashboardLayout', id)

        expect(layoutNames(store)).toEqual([''])
        expect(JSON.stringify(store.state.gui.dashboard.desktopLayout1)).toBe(before)
    })
})

describe('dashboard columns', () => {
    const names = (panels: GuiStateLayoutoption[] | undefined) => (panels ?? []).map((entry) => entry.name)

    it('moves the panels of a removed column into the last column that stays', async () => {
        const store = createStore()
        const before = getDefaultState().dashboard
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'widescreen', count: 2 })

        const dashboard = store.state.gui.dashboard
        expect(dashboard.columns?.widescreen).toEqual({ count: 2, widths: [10, 14] })
        expect(dashboard.widescreenLayout1).toEqual(before.widescreenLayout1)
        expect(names(dashboard.widescreenLayout2)).toEqual([
            ...names(before.widescreenLayout2),
            ...names(before.widescreenLayout3),
        ])
        expect(dashboard.widescreenLayout3).toEqual([])
    })

    it('adds an empty column and stores it under the next key', async () => {
        const store = createStore()
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'desktop', count: 3 })
        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout3', value: [panel('miniconsole')] })

        expect(store.state.gui.dashboard.columns?.desktop).toEqual({ count: 3, widths: [8, 8, 8] })
        expect(store.state.gui.dashboard.desktopLayout3).toEqual([panel('miniconsole')])
    })

    it('clamps the count and ignores an unchanged count or an unknown viewport', async () => {
        const store = createStore()
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'desktop', count: 2 })
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'mobile', count: 3 })
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'watch', count: 1 })
        expect(emit).not.toHaveBeenCalled()

        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'desktop', count: 12 })
        expect(store.state.gui.dashboard.columns?.desktop.count).toBe(3)
    })

    it('rearranges the customized printer state layouts too', async () => {
        const store = createStore((state) => {
            state.dashboard.stateLayouts.printing = {
                widescreenLayout1: [panel('webcam')],
                widescreenLayout2: [panel('temperature')],
                widescreenLayout3: [panel('miniconsole'), panel('macros')],
            }
        })
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'widescreen', count: 2 })

        expect(store.state.gui.dashboard.stateLayouts.printing).toEqual({
            widescreenLayout1: [panel('webcam')],
            widescreenLayout2: [panel('temperature'), panel('miniconsole'), panel('macros')],
        })
        expect(store.state.gui.dashboard.stateLayouts.error).toEqual({})
        expect(stored('dashboard.stateLayouts.printing.widescreenLayout3')).toBeUndefined()
    })

    it('shows every panel exactly once after the column count changed', async () => {
        const store = createStore()
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'widescreen', count: 1 })

        const state = store.state.gui
        const moduleGetters: Record<string, unknown> = {
            getAllPossiblePanels: ['webcam', 'toolhead-control', 'temperature', 'miniconsole'],
            'webcams/getWebcams': [],
            'macros/getAllMacrogroups': [],
        }
        const call = (name: string) => (getters[name] as AnyFn)(state, moduleGetters, { gui: state }, {})
        moduleGetters.getDashboardLayout = call('getDashboardLayout')
        moduleGetters.getAllPanelsFromViewport = call('getAllPanelsFromViewport')
        moduleGetters.getPrintHeroShowsWebcam = call('getPrintHeroShowsWebcam')
        const getPanels = call('getPanels') as (viewport: string, column: number) => GuiStateLayoutoption[]

        expect(names(getPanels('widescreen', 1)).sort()).toEqual(
            ['webcam', 'toolhead-control', 'temperature', 'miniconsole'].sort()
        )
    })

    it('saves valid widths and ignores widths that do not fit', async () => {
        const store = createStore()
        await store.dispatch('gui/setDashboardColumnWidths', { viewport: 'desktop', widths: [12, 12] })
        expect(store.state.gui.dashboard.columns?.desktop).toEqual({ count: 2, widths: [12, 12] })

        await store.dispatch('gui/setDashboardColumnWidths', { viewport: 'desktop', widths: [10, 14] })
        expect(store.state.gui.dashboard.columns?.desktop).toEqual({ count: 2, widths: [10, 14] })
    })

    it('resets the columns of a viewport together with its idle layout', async () => {
        const store = createStore()
        await store.dispatch('gui/setDashboardColumnCount', { viewport: 'desktop', count: 3 })
        await store.dispatch('gui/saveSetting', { name: 'dashboard.desktopLayout3', value: [panel('miniconsole')] })
        await store.dispatch('gui/resetStateLayout', { layoutState: 'idle', viewport: 'desktop' })

        const defaults = getDefaultState().dashboard
        expect(store.state.gui.dashboard.columns?.desktop).toBeUndefined()
        expect(store.state.gui.dashboard.desktopLayout1).toEqual(defaults.desktopLayout1)
        expect(store.state.gui.dashboard.desktopLayout2).toEqual(defaults.desktopLayout2)
        expect(store.state.gui.dashboard.desktopLayout3).toEqual([])
    })
})

describe('deleting a macro group', () => {
    const run = async (prepare: (state: GuiState) => void) => {
        const { actions: macroActions } = await import('@/store/gui/macros/actions')
        const state = getDefaultState()
        prepare(state)
        const dispatch = vi.fn()
        const commit = vi.fn()
        ;(macroActions.groupDelete as (...args: unknown[]) => unknown)(
            { commit, dispatch, rootState: { gui: state } },
            'g1'
        )

        return { commit, dispatch }
    }

    it('removes its panel from the added columns, the panel sizes and the stored layouts', async () => {
        const { commit, dispatch } = await run((state) => {
            state.dashboard.desktopLayout3 = [panel('macrogroup_g1'), panel('webcam')]
            state.dashboard.stateLayouts.printing = { widescreenLayout4: [panel('macrogroup_g1')] }
            state.dashboard.panelDensity = { macrogroup_g1: 'compact' }
            state.dashboard.namedLayouts = {
                active: 'a',
                items: {
                    a: { name: 'A', order: 0 },
                    b: {
                        name: 'B',
                        order: 1,
                        snapshot: { panels: { widescreenLayout4: [panel('macrogroup_g1'), panel('macros')] } },
                    },
                    c: { name: 'C', order: 2, snapshot: { panels: { mobileLayout: [panel('webcam')] } } },
                },
            }
        })

        expect(commit).toHaveBeenCalledWith(
            'gui/deleteFromDashboardLayout',
            { layoutname: 'desktopLayout3', index: 0 },
            { root: true }
        )
        expect(dispatch).toHaveBeenCalledWith(
            'gui/updateSettings',
            { keyName: 'dashboard.desktopLayout3', newVal: [panel('webcam')] },
            { root: true }
        )
        expect(dispatch).toHaveBeenCalledWith(
            'gui/saveSetting',
            { name: 'dashboard.stateLayouts.printing.widescreenLayout4', value: [] },
            { root: true }
        )
        expect(dispatch).toHaveBeenCalledWith('gui/deleteSettingKey', 'dashboard.panelDensity.macrogroup_g1', {
            root: true,
        })
        expect(dispatch).toHaveBeenCalledWith(
            'gui/replaceSetting',
            {
                name: 'dashboard.namedLayouts.items.b',
                value: { name: 'B', order: 1, snapshot: { panels: { widescreenLayout4: [panel('macros')] } } },
            },
            { root: true }
        )
        expect(dispatch).not.toHaveBeenCalledWith(
            'gui/replaceSetting',
            expect.objectContaining({ name: 'dashboard.namedLayouts.items.c' }),
            { root: true }
        )
    })

    it('writes nothing to the dashboard when the group has no panel anywhere', async () => {
        const { dispatch } = await run(() => {})

        expect(dispatch).not.toHaveBeenCalled()
    })
})
