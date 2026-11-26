import { describe, expect, it, vi } from 'vitest'
import { getters } from '@/store/gui/getters'
import { actions } from '@/store/gui/actions'
import type { GuiState, GuiStateLayoutoption } from '@/store/gui/types'
import type { RootState } from '@/store/types'

type AnyFn = (...args: unknown[]) => unknown

const createState = (stateLayouts: Record<string, unknown> = {}) =>
    ({
        dashboard: {
            nonExpandPanels: {},
            mobileLayout: [
                { name: 'webcam', visible: false },
                { name: 'toolhead-control', visible: true },
                { name: 'temperature', visible: true },
                { name: 'miniconsole', visible: false },
            ],
            desktopLayout1: [
                { name: 'webcam', visible: true },
                { name: 'toolhead-control', visible: true },
            ],
            desktopLayout2: [
                { name: 'temperature', visible: true },
                { name: 'miniconsole', visible: true },
            ],
            stateLayouts: {
                enabled: true,
                printing: {},
                error: {},
                ...stateLayouts,
            },
        },
        macros: { mode: 'simple' },
    }) as unknown as GuiState

const allPossiblePanels = ['webcam', 'toolhead-control', 'temperature', 'miniconsole']

const createGetters = (state: GuiState) => {
    const moduleGetters: Record<string, unknown> = { getAllPossiblePanels: allPossiblePanels }
    const rootState = { gui: state } as unknown as RootState
    const call = (name: string) => (getters[name] as AnyFn)(state, moduleGetters, rootState, {})

    moduleGetters.getDashboardLayout = call('getDashboardLayout')
    moduleGetters.getAllPanelsFromViewport = call('getAllPanelsFromViewport')
    moduleGetters.getPanels = call('getPanels')

    return moduleGetters as {
        getDashboardLayout: (layoutName: string, layoutState?: string) => GuiStateLayoutoption[]
        getAllPanelsFromViewport: (viewport: string, layoutState?: string) => GuiStateLayoutoption[]
        getPanels: (
            viewport: string,
            column: number,
            onlyVisible?: boolean,
            layoutState?: string
        ) => GuiStateLayoutoption[]
    }
}

const names = (panels: GuiStateLayoutoption[]) => panels.map((panel) => panel.name)

describe('gui/getPanels with layout states', () => {
    it('returns the stored layout when no layout state is given', () => {
        const g = createGetters(createState())

        expect(names(g.getPanels('mobile', 0, true))).toEqual(['toolhead-control', 'temperature'])
        expect(g.getPanels('mobile', 0, true, 'idle')).toEqual(g.getPanels('mobile', 0, true))
    })

    it('derives the printing layout from the idle layout', () => {
        const g = createGetters(createState())

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature'])
        expect(names(g.getPanels('desktop', 1, true, 'printing'))).toEqual(['webcam'])
        expect(names(g.getPanels('desktop', 2, true, 'printing'))).toEqual(['temperature', 'miniconsole'])
    })

    it('derives the error layout from the idle layout', () => {
        const g = createGetters(createState())

        expect(names(g.getPanels('mobile', 0, true, 'error'))).toEqual(['miniconsole', 'temperature'])
        expect(names(g.getPanels('desktop', 2, true, 'error'))).toEqual(['miniconsole', 'temperature'])
    })

    it('prefers a customized state layout over the derived one', () => {
        const custom = [
            { name: 'temperature', visible: true },
            { name: 'toolhead-control', visible: true },
            { name: 'webcam', visible: false },
            { name: 'miniconsole', visible: false },
        ]
        const g = createGetters(createState({ printing: { mobileLayout: custom } }))

        expect(g.getPanels('mobile', 0, false, 'printing')).toEqual(custom)
        expect(names(g.getPanels('mobile', 0, true, 'error'))).toEqual(['miniconsole', 'temperature'])
    })

    it('falls back to the derived layout after a state layout was reset to null', () => {
        const g = createGetters(createState({ printing: { mobileLayout: null } }))

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature'])
    })

    it('does not re-add panels that live in another column of a customized state layout', () => {
        const g = createGetters(
            createState({
                printing: {
                    desktopLayout1: [{ name: 'temperature', visible: true }],
                    desktopLayout2: [
                        { name: 'webcam', visible: true },
                        { name: 'toolhead-control', visible: false },
                        { name: 'miniconsole', visible: true },
                    ],
                },
            })
        )

        expect(names(g.getPanels('desktop', 1, false, 'printing'))).toEqual(['temperature'])
        expect(names(g.getPanels('desktop', 2, false, 'printing'))).toEqual([
            'webcam',
            'toolhead-control',
            'miniconsole',
        ])
    })

    it('works with settings saved before layout states existed', () => {
        const state = createState()
        delete (state.dashboard as unknown as Record<string, unknown>).stateLayouts
        const g = createGetters(state)

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature'])
    })
})

describe('gui/saveStateLayout', () => {
    const run = (state: GuiState, payload: Record<string, unknown>) => {
        const dispatch = vi.fn()
        const context = { dispatch, state, getters: createGetters(state) }
        ;(actions.saveStateLayout as AnyFn)(context, payload)

        return dispatch
    }

    it('saves the idle layout under its original key', () => {
        const value = [{ name: 'temperature', visible: true }]
        const dispatch = run(createState(), { layoutState: 'idle', viewport: 'mobile', column: 0, value })

        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(dispatch).toHaveBeenCalledWith('saveSetting', { name: 'dashboard.mobileLayout', value })
    })

    it('saves a state layout under stateLayouts and pins the other columns of the viewport', () => {
        const state = createState()
        const value = [{ name: 'webcam', visible: true }]
        const dispatch = run(state, { layoutState: 'printing', viewport: 'desktop', column: 1, value })

        expect(dispatch).toHaveBeenCalledTimes(2)
        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout1',
            value,
        })
        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout2',
            value: [
                { name: 'temperature', visible: true },
                { name: 'miniconsole', visible: true },
            ],
        })
    })

    it('does not overwrite other columns that are already customized', () => {
        const state = createState({ error: { desktopLayout2: [{ name: 'miniconsole', visible: true }] } })
        const value = [{ name: 'webcam', visible: true }]
        const dispatch = run(state, { layoutState: 'error', viewport: 'desktop', column: 1, value })

        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.error.desktopLayout1',
            value,
        })
    })
})

describe('gui/resetStateLayout', () => {
    it('clears the customized layouts of a viewport for a state', () => {
        const dispatch = vi.fn()
        ;(actions.resetStateLayout as AnyFn)({ dispatch }, { layoutState: 'printing', viewport: 'desktop' })

        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout1',
            value: null,
        })
        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout2',
            value: null,
        })
    })

    it('resets the idle layout to the defaults', () => {
        const dispatch = vi.fn()
        ;(actions.resetStateLayout as AnyFn)({ dispatch }, { layoutState: 'idle', viewport: 'tablet' })

        expect(dispatch).toHaveBeenCalledWith('resetLayout', 'tabletLayout1')
        expect(dispatch).toHaveBeenCalledWith('resetLayout', 'tabletLayout2')
    })
})
