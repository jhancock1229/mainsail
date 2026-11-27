import { describe, expect, it, vi } from 'vitest'
import { getters } from '@/store/gui/getters'
import { getDefaultState } from '@/store/gui'
import { allDashboardPanels } from '@/store/variables'
import { getDefaultPrintHeroSettings } from '@/plugins/printHero'
import Vue from 'vue'
import { actions } from '@/store/gui/actions'
import { mutations } from '@/store/gui/mutations'
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

const createGetters = (state: GuiState, possiblePanels: string[] = allPossiblePanels, webcams: string[] = []) => {
    const moduleGetters: Record<string, unknown> = {
        getAllPossiblePanels: possiblePanels,
        'webcams/getWebcams': webcams.map((name) => ({ name })),
    }
    const rootState = { gui: state } as unknown as RootState
    const call = (name: string) => (getters[name] as AnyFn)(state, moduleGetters, rootState, {})

    moduleGetters.getDashboardLayout = call('getDashboardLayout')
    moduleGetters.getAllPanelsFromViewport = call('getAllPanelsFromViewport')
    moduleGetters.getPrintHeroShowsWebcam = call('getPrintHeroShowsWebcam')
    moduleGetters.getPanels = call('getPanels')

    moduleGetters.getPrintHeroInLayout = call('getPrintHeroInLayout')

    return moduleGetters as {
        getPrintHeroShowsWebcam: (viewport: string) => boolean
        getPrintHeroInLayout: (viewport: string, layoutState?: string) => boolean
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

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 1, true, 'printing'))).toEqual(['webcam', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 2, true, 'printing'))).toEqual(['temperature', 'miniconsole'])
    })

    it('derives the error layout from the idle layout', () => {
        const g = createGetters(createState())

        expect(names(g.getPanels('mobile', 0, true, 'error'))).toEqual([
            'miniconsole',
            'toolhead-control',
            'temperature',
        ])
        expect(names(g.getPanels('desktop', 2, true, 'error'))).toEqual(['miniconsole', 'temperature'])
    })

    it('applies the derive rules to panels that are missing from the stored layout', () => {
        const state = createState()
        state.dashboard.desktopLayout1 = [{ name: 'toolhead-control', visible: true }]
        state.dashboard.desktopLayout2 = [{ name: 'miniconsole', visible: true }]
        const g = createGetters(state)

        expect(names(g.getPanels('desktop', 1, true))).toEqual(['toolhead-control', 'webcam', 'temperature'])
        expect(names(g.getPanels('desktop', 1, true, 'printing'))).toEqual([
            'webcam',
            'temperature',
            'toolhead-control',
        ])
    })

    it('puts the print hero on top in every state, also for layouts saved before the panel existed', () => {
        const g = createGetters(createState(), [...allPossiblePanels, 'print-hero'])

        expect(names(g.getPanels('desktop', 1, true))).toEqual(['print-hero', 'webcam', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 1, true, 'printing'))).toEqual(['print-hero', 'webcam', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 1, true, 'error'))).toEqual(['print-hero', 'webcam', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 2, true, 'printing'))).toEqual(['temperature', 'miniconsole'])
    })

    it('keeps the print hero right below the console after a failed print', () => {
        const g = createGetters(createState(), [...allPossiblePanels, 'print-hero'])

        expect(names(g.getPanels('mobile', 0, true, 'error'))).toEqual([
            'miniconsole',
            'print-hero',
            'toolhead-control',
            'temperature',
        ])
    })

    it('puts a missing print hero on top of a customized state layout too', () => {
        const custom = [
            { name: 'temperature', visible: true },
            { name: 'webcam', visible: true },
            { name: 'toolhead-control', visible: true },
            { name: 'miniconsole', visible: false },
        ]
        const state = createState({ printing: { mobileLayout: custom } })
        const g = createGetters(state, [...allPossiblePanels, 'print-hero'])

        expect(names(g.getPanels('mobile', 0, false, 'printing'))).toEqual(['print-hero', ...names(custom)])
    })

    it('still appends other missing panels to the first column', () => {
        const state = createState()
        state.dashboard.desktopLayout1 = [{ name: 'toolhead-control', visible: true }]
        const g = createGetters(state, [...allPossiblePanels, 'print-hero'])

        expect(names(g.getPanels('desktop', 1, true))).toEqual(['print-hero', 'toolhead-control', 'webcam'])
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
        expect(names(g.getPanels('mobile', 0, true, 'error'))).toEqual([
            'miniconsole',
            'toolhead-control',
            'temperature',
        ])
    })

    it('falls back to the derived layout when a state layout is not an array', () => {
        const g = createGetters(createState({ printing: { mobileLayout: null } }))

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature', 'toolhead-control'])
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

        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual(['webcam', 'temperature', 'toolhead-control'])
    })
})

describe('gui/hasCustomStateLayout', () => {
    const run = (state: GuiState, viewport: string, layoutState: string) =>
        ((getters.hasCustomStateLayout as AnyFn)(state) as AnyFn)(viewport, layoutState)

    it('is false while a state layout follows the idle layout', () => {
        expect(run(createState(), 'desktop', 'printing')).toBe(false)
        expect(run(createState(), 'desktop', 'idle')).toBe(false)
    })

    it('is true when a column of the viewport is customized for the state', () => {
        const state = createState({ printing: { desktopLayout2: [{ name: 'webcam', visible: true }] } })

        expect(run(state, 'desktop', 'printing')).toBe(true)
        expect(run(state, 'desktop', 'error')).toBe(false)
        expect(run(state, 'mobile', 'printing')).toBe(false)
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

    it('keeps the place and the hidden state of a panel that cannot be shown right now', () => {
        const state = createState()
        const context = { dispatch: vi.fn(), state, getters: createGetters(state, ['webcam', 'toolhead-control']) }
        const value = [
            { name: 'toolhead-control', visible: true },
            { name: 'webcam', visible: true },
        ]
        ;(actions.saveStateLayout as AnyFn)(context, { layoutState: 'idle', viewport: 'mobile', column: 0, value })

        expect(context.dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.mobileLayout',
            value: [
                { name: 'toolhead-control', visible: true },
                { name: 'temperature', visible: true },
                { name: 'miniconsole', visible: false },
                { name: 'webcam', visible: true },
            ],
        })
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
    const run = (state: GuiState, payload: Record<string, unknown>) => {
        const dispatch = vi.fn()
        const commit = vi.fn()
        const emit = vi.fn()
        ;(Vue as unknown as { $socket: unknown }).$socket = { emit }
        ;(actions.resetStateLayout as AnyFn)({ dispatch, commit, state }, payload)

        return { dispatch, commit, emit }
    }

    it('deletes the customized layouts of a viewport for a state', () => {
        const custom = [{ name: 'webcam', visible: true }]
        const state = createState({
            printing: { desktopLayout1: custom, desktopLayout2: custom, mobileLayout: custom },
        })
        const { commit, emit } = run(state, { layoutState: 'printing', viewport: 'desktop' })

        expect(commit).toHaveBeenCalledTimes(2)
        expect(commit).toHaveBeenCalledWith('deleteStateLayout', {
            layoutState: 'printing',
            layoutKey: 'desktopLayout1',
        })
        expect(commit).toHaveBeenCalledWith('deleteStateLayout', {
            layoutState: 'printing',
            layoutKey: 'desktopLayout2',
        })
        expect(emit).toHaveBeenCalledTimes(2)
        expect(emit).toHaveBeenCalledWith('server.database.delete_item', {
            namespace: 'mainsail',
            key: 'dashboard.stateLayouts.printing.desktopLayout1',
        })
    })

    it('does nothing for a state layout that is not customized', () => {
        const { commit, emit, dispatch } = run(createState(), { layoutState: 'error', viewport: 'desktop' })

        expect(commit).not.toHaveBeenCalled()
        expect(emit).not.toHaveBeenCalled()
        expect(dispatch).not.toHaveBeenCalled()
    })

    it('resets the idle layout to the defaults', () => {
        const { dispatch } = run(createState(), { layoutState: 'idle', viewport: 'tablet' })

        expect(dispatch).toHaveBeenCalledWith('resetLayout', 'tabletLayout1')
        expect(dispatch).toHaveBeenCalledWith('resetLayout', 'tabletLayout2')
    })
})

describe('gui/deleteStateLayout', () => {
    it('removes the customized layout from the state', () => {
        const state = createState({ printing: { mobileLayout: [{ name: 'webcam', visible: true }] } })
        ;(mutations.deleteStateLayout as AnyFn)(state, { layoutState: 'printing', layoutKey: 'mobileLayout' })

        expect('mobileLayout' in state.dashboard.stateLayouts.printing).toBe(false)
    })
})

describe('print hero defaults', () => {
    it('is a dashboard panel that can be arranged and hidden in the layout settings', () => {
        expect(allDashboardPanels).toContain('print-hero')
    })

    it('is the first panel of the default layouts, so it stays in place when a print ends', () => {
        const { dashboard } = getDefaultState()

        expect(dashboard.mobileLayout[0]).toEqual({ name: 'print-hero', visible: true })
        expect(dashboard.tabletLayout1[0]).toEqual({ name: 'print-hero', visible: true })
        expect(dashboard.desktopLayout1[0]).toEqual({ name: 'print-hero', visible: true })
        expect(dashboard.widescreenLayout2[0]).toEqual({ name: 'print-hero', visible: true })
    })

    it('has default settings in the gui store', () => {
        expect(getDefaultState().view.printHero).toEqual(getDefaultPrintHeroSettings())
    })
})

describe('webcam panel while the print hero shows the webcam', () => {
    const withHero = [...allPossiblePanels, 'print-hero']
    const withView = (printHero: unknown, stateLayouts: Record<string, unknown> = {}) => {
        const state = createState(stateLayouts)
        ;(state as unknown as Record<string, unknown>).view = { printHero }

        return state
    }

    it('knows that the hero shows the webcam: one camera, webcam backdrop, hero visible', () => {
        expect(createGetters(createState(), withHero, ['cam']).getPrintHeroShowsWebcam('desktop')).toBe(true)
        expect(
            createGetters(withView({ backdrop: 'webcam' }), withHero, ['cam']).getPrintHeroShowsWebcam('mobile')
        ).toBe(true)
    })

    it('knows that the hero does not show the webcam', () => {
        expect(createGetters(createState(), withHero).getPrintHeroShowsWebcam('desktop')).toBe(false)
        for (const backdrop of ['thumbnail', 'none']) {
            const g = createGetters(withView({ backdrop }), withHero, ['cam'])
            expect(g.getPrintHeroShowsWebcam('desktop')).toBe(false)
        }
        expect(createGetters(createState(), allPossiblePanels, ['cam']).getPrintHeroShowsWebcam('desktop')).toBe(false)
        const hidden = createState()
        hidden.dashboard.desktopLayout2 = [...hidden.dashboard.desktopLayout2, { name: 'print-hero', visible: false }]
        expect(createGetters(hidden, withHero, ['cam']).getPrintHeroShowsWebcam('desktop')).toBe(false)
        expect(createGetters(hidden, withHero, ['cam']).getPrintHeroShowsWebcam('mobile')).toBe(true)
    })

    it('leaves the webcam panel alone with several cameras, because it shows more than the hero', () => {
        expect(createGetters(createState(), withHero, ['cam', 'nozzle']).getPrintHeroShowsWebcam('desktop')).toBe(false)
    })

    it('does not show the webcam panel in the derived printing layout', () => {
        const g = createGetters(createState(), withHero, ['cam'])

        expect(names(g.getPanels('desktop', 1, true, 'printing'))).toEqual(['print-hero', 'toolhead-control'])
        expect(g.getPanels('desktop', 1, false, 'printing')).toContainEqual({ name: 'webcam', visible: false })
        expect(names(g.getPanels('mobile', 0, true, 'printing'))).toEqual([
            'print-hero',
            'temperature',
            'toolhead-control',
        ])
    })

    it('does not touch the webcam panel while idle or after an error', () => {
        const g = createGetters(createState(), withHero, ['cam'])

        expect(names(g.getPanels('desktop', 1, true))).toEqual(['print-hero', 'webcam', 'toolhead-control'])
        expect(names(g.getPanels('desktop', 1, true, 'error'))).toEqual(['print-hero', 'webcam', 'toolhead-control'])
    })

    it('shows and promotes the webcam panel as before when the hero does not show the webcam', () => {
        const thumbnail = createGetters(withView({ backdrop: 'thumbnail' }), withHero, ['cam'])
        expect(names(thumbnail.getPanels('mobile', 0, true, 'printing'))).toEqual([
            'print-hero',
            'webcam',
            'temperature',
            'toolhead-control',
        ])

        const hidden = createState()
        hidden.dashboard.mobileLayout = [{ name: 'print-hero', visible: false }, ...hidden.dashboard.mobileLayout]
        expect(names(createGetters(hidden, withHero, ['cam']).getPanels('mobile', 0, true, 'printing'))).toEqual([
            'webcam',
            'temperature',
            'toolhead-control',
        ])
    })

    it('does not change a printing layout that the user has customized', () => {
        const custom = [
            { name: 'print-hero', visible: true },
            { name: 'webcam', visible: true },
            { name: 'toolhead-control', visible: true },
            { name: 'temperature', visible: true },
            { name: 'miniconsole', visible: false },
        ]
        const g = createGetters(withView(undefined, { printing: { mobileLayout: custom } }), withHero, ['cam'])

        expect(g.getPanels('mobile', 0, false, 'printing')).toEqual(custom)
    })

    it('pins the other columns as they are shown when one column of the printing layout is customized', () => {
        const state = createState()
        const dispatch = vi.fn()
        const value = [{ name: 'miniconsole', visible: true }]
        ;(actions.saveStateLayout as AnyFn)(
            { dispatch, state, getters: createGetters(state, withHero, ['cam']) },
            { layoutState: 'printing', viewport: 'desktop', column: 2, value }
        )

        expect(dispatch).toHaveBeenCalledWith('saveSetting', {
            name: 'dashboard.stateLayouts.printing.desktopLayout1',
            value: [
                { name: 'webcam', visible: false },
                { name: 'toolhead-control', visible: true },
            ],
        })
    })
})

describe('gui/getPrintHeroInLayout', () => {
    const withHero = [...allPossiblePanels, 'print-hero']

    it('is true when the hero is a visible panel of the viewport, in any column', () => {
        const state = createState()
        state.dashboard.desktopLayout2 = [{ name: 'print-hero', visible: true }, ...state.dashboard.desktopLayout2]
        const g = createGetters(state, withHero)

        expect(g.getPrintHeroInLayout('desktop')).toBe(true)
        expect(g.getPrintHeroInLayout('desktop', 'printing')).toBe(true)
        expect(g.getPrintHeroInLayout('desktop', 'error')).toBe(true)
    })

    it('is true for layouts saved before the panel existed, where it gets added', () => {
        expect(createGetters(createState(), withHero).getPrintHeroInLayout('mobile', 'printing')).toBe(true)
    })

    it('is false when the user has hidden the hero', () => {
        const state = createState()
        state.dashboard.mobileLayout = [{ name: 'print-hero', visible: false }, ...state.dashboard.mobileLayout]
        const g = createGetters(state, withHero)

        expect(g.getPrintHeroInLayout('mobile')).toBe(false)
        expect(g.getPrintHeroInLayout('mobile', 'printing')).toBe(false)
        expect(g.getPrintHeroInLayout('desktop', 'printing')).toBe(true)
    })

    it('follows the layout of the printer state', () => {
        const custom = [
            { name: 'print-hero', visible: false },
            { name: 'toolhead-control', visible: true },
        ]
        const g = createGetters(createState({ printing: { mobileLayout: custom } }), withHero)

        expect(g.getPrintHeroInLayout('mobile', 'printing')).toBe(false)
        expect(g.getPrintHeroInLayout('mobile', 'error')).toBe(true)
        expect(g.getPrintHeroInLayout('mobile')).toBe(true)
    })

    it('is false when the panel does not exist', () => {
        expect(createGetters(createState()).getPrintHeroInLayout('desktop', 'printing')).toBe(false)
    })
})
