import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import Vuex, { Store } from 'vuex'
import { actions } from '@/store/gui/actions'
import { mutations } from '@/store/gui/mutations'
import { getDefaultState } from '@/store/gui'
import {
    HomeArrangement,
    defaultHomeArrangement,
    defaultHomeLayout,
    defaultWhileActions,
    resolveHomeLayouts,
} from '@/plugins/shellHomeLayout'
import type { GuiState } from '@/store/gui/types'

Vue.use(Vuex)

type GuiStore = Store<{ gui: GuiState }>

let emit: ReturnType<typeof vi.fn>

const createStore = (prepare: (state: GuiState) => void = () => {}): GuiStore => {
    const state = getDefaultState()
    prepare(state)

    return new Vuex.Store({
        modules: { gui: { namespaced: true, state, actions, mutations } },
    }) as unknown as GuiStore
}

const home = (store: GuiStore) => resolveHomeLayouts(store.state.gui.shellHome)
const active = (store: GuiStore) => home(store).layouts.find((entry) => entry.id === home(store).activeId)
const layoutNames = (store: GuiStore) => home(store).layouts.map((entry) => entry.name)

const customIdle: HomeArrangement = [
    { mode: 'split', blocks: ['ready'] },
    { mode: 'tabs', blocks: ['start', 'macros'] },
    { mode: 'split', blocks: ['camera', 'heat'] },
]

beforeEach(() => {
    emit = vi.fn()
    ;(Vue as unknown as { $socket: unknown }).$socket = { emit }
})

describe('Home layouts in the store', () => {
    it('starts with the approved default and writes nothing', () => {
        const store = createStore()

        expect(home(store).layouts).toHaveLength(1)
        expect(active(store)?.layout).toEqual(defaultHomeLayout())
        expect(emit).not.toHaveBeenCalled()
    })

    it('saves an arrangement into the active layout', async () => {
        const store = createStore()
        const saved = await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: customIdle })

        expect(saved).toBe(true)
        expect(active(store)?.layout.states.idle).toEqual(customIdle)
        expect(active(store)?.layout.states.printing).toEqual(defaultHomeArrangement('printing'))
        expect(emit).toHaveBeenCalledWith(
            'server.database.post_item',
            expect.objectContaining({ namespace: 'mainsail', key: 'shellHome.items.default' })
        )
    })

    it('refuses an arrangement that would scroll or lose required controls', async () => {
        const store = createStore()
        const tooTall = [customIdle[0], { mode: 'split', blocks: ['start', 'macros', 'spool'] }, customIdle[2]]
        const noJob = defaultHomeArrangement('idle')

        expect(await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: tooTall })).toBe(false)
        expect(await store.dispatch('gui/saveHomeArrangement', { state: 'printing', columns: noJob })).toBe(false)
        expect(emit).not.toHaveBeenCalled()
    })

    it('saves four different actions and refuses anything else', async () => {
        const store = createStore()

        expect(await store.dispatch('gui/saveHomeActions', ['macros', 'speed', 'console', 'limits'])).toBe(true)
        expect(active(store)?.layout.actions).toEqual(['macros', 'speed', 'console', 'limits'])
        expect(await store.dispatch('gui/saveHomeActions', ['macros', 'macros', 'console', 'limits'])).toBe(false)
        expect(await store.dispatch('gui/saveHomeActions', ['macros'])).toBe(false)
        expect(active(store)?.layout.actions).toEqual(['macros', 'speed', 'console', 'limits'])
    })

    it('resets one state to the approved default, and the action row with the printing state', async () => {
        const store = createStore()
        await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: customIdle })
        await store.dispatch('gui/saveHomeActions', ['macros', 'speed', 'console', 'limits'])

        await store.dispatch('gui/resetHomeArrangement', 'idle')
        expect(active(store)?.layout.states.idle).toEqual(defaultHomeArrangement('idle'))
        expect(active(store)?.layout.actions).toEqual(['macros', 'speed', 'console', 'limits'])

        await store.dispatch('gui/resetHomeArrangement', 'printing')
        expect(active(store)?.layout.actions).toEqual(defaultWhileActions)
    })

    it('creates a named copy, keeps each arrangement and switches between them', async () => {
        const store = createStore()
        const id = await store.dispatch('gui/createHomeLayout', { name: ' Calibration ' })

        expect(layoutNames(store)).toEqual(['', 'Calibration'])
        expect(home(store).activeId).toBe(id)

        await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: customIdle })
        await store.dispatch('gui/switchHomeLayout', 'default')
        expect(active(store)?.layout.states.idle).toEqual(defaultHomeArrangement('idle'))

        await store.dispatch('gui/switchHomeLayout', id)
        expect(active(store)?.layout.states.idle).toEqual(customIdle)

        await store.dispatch('gui/switchHomeLayout', 'gone')
        expect(home(store).activeId).toBe(id)
    })

    it('duplicates another layout without switching, numbers a used name and refuses an empty one', async () => {
        const store = createStore()
        await store.dispatch('gui/saveHomeArrangement', { state: 'idle', columns: customIdle })
        const first = await store.dispatch('gui/createHomeLayout', { name: 'Calibration' })
        await store.dispatch('gui/resetHomeArrangement', 'idle')
        const copy = await store.dispatch('gui/createHomeLayout', {
            name: 'calibration',
            sourceId: 'default',
            activate: false,
        })

        expect(await store.dispatch('gui/createHomeLayout', { name: '  ' })).toBeNull()
        expect(layoutNames(store)).toEqual(['', 'Calibration', 'calibration 2'])
        expect(home(store).activeId).toBe(first)
        expect(home(store).layouts.find((entry) => entry.id === copy)?.layout.states.idle).toEqual(customIdle)
    })

    it('renames a layout', async () => {
        const store = createStore()
        await store.dispatch('gui/renameHomeLayout', { id: 'default', name: 'Everyday' })
        await store.dispatch('gui/renameHomeLayout', { id: 'default', name: ' ' })
        await store.dispatch('gui/renameHomeLayout', { id: 'gone', name: 'Nope' })

        expect(layoutNames(store)).toEqual(['Everyday'])
    })

    it('never deletes the last layout and switches away from a deleted active one', async () => {
        const store = createStore()
        await store.dispatch('gui/deleteHomeLayout', 'default')
        expect(emit).not.toHaveBeenCalled()

        const id = await store.dispatch('gui/createHomeLayout', { name: 'Calibration' })
        await store.dispatch('gui/deleteHomeLayout', id)

        expect(layoutNames(store)).toEqual([''])
        expect(home(store).activeId).toBe('default')
        expect(emit).toHaveBeenCalledWith('server.database.delete_item', {
            namespace: 'mainsail',
            key: `shellHome.items.${id}`,
        })
    })

    it('repairs corrupt stored layouts instead of failing', () => {
        const store = createStore((state) => {
            state.shellHome = {
                active: 'gone',
                items: { a: { name: 'Kept', order: 0, layout: { states: { idle: 'broken' }, actions: 7 } } },
            }
        })

        expect(home(store).activeId).toBe('a')
        expect(active(store)?.layout).toEqual(defaultHomeLayout())
    })
})
