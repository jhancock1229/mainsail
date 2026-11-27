import { ActionContext, ActionTree } from 'vuex'
import { v4 as uuidv4 } from 'uuid'
import { GuiState } from '@/store/gui/types'
import { RootState } from '@/store/types'
import { sanitizeLayoutName, uniqueLayoutName } from '@/plugins/layoutNames'
import {
    HomeArrangement,
    HomeLayout,
    HomeLayoutEntry,
    HomeLayoutState,
    MAX_HOME_LAYOUTS,
    WhileActionId,
    checkArrangement,
    defaultHomeArrangement,
    defaultWhileActions,
    normalizeHomeLayout,
    normalizeWhileActions,
    resolveHomeLayouts,
} from '@/plugins/shellHomeLayout'

type Context = ActionContext<GuiState, RootState>

const ITEMS_KEY = 'shellHome.items'

const saveEntry = ({ dispatch }: Context, entry: HomeLayoutEntry): void => {
    dispatch('replaceSetting', {
        name: `${ITEMS_KEY}.${entry.id}`,
        value: { name: entry.name, order: entry.order, layout: entry.layout },
    })
}

const saveActiveLayout = (context: Context, change: (layout: HomeLayout) => HomeLayout): void => {
    const home = resolveHomeLayouts(context.state.shellHome)
    const active = home.layouts.find((entry) => entry.id === home.activeId) ?? home.layouts[0]

    saveEntry(context, { ...active, layout: change(active.layout) })
    if (context.state.shellHome?.active !== active.id) {
        context.dispatch('replaceSetting', { name: 'shellHome.active', value: active.id })
    }
}

export const shellHomeActions: ActionTree<GuiState, RootState> = {
    saveHomeArrangement(context, payload: { state: HomeLayoutState; columns: HomeArrangement }): boolean {
        if (checkArrangement(payload.state, payload.columns) !== null) return false

        saveActiveLayout(context, (layout) => ({
            ...layout,
            states: { ...layout.states, [payload.state]: payload.columns },
        }))

        return true
    },

    saveHomeActions(context, actions: WhileActionId[]): boolean {
        if (normalizeWhileActions(actions).join() !== actions.join()) return false

        saveActiveLayout(context, (layout) => ({ ...layout, actions: [...actions] }))

        return true
    },

    resetHomeArrangement(context, state: HomeLayoutState) {
        saveActiveLayout(context, (layout) => ({
            states: { ...layout.states, [state]: defaultHomeArrangement(state) },
            actions: state === 'printing' ? [...defaultWhileActions] : layout.actions,
        }))
    },

    createHomeLayout(
        context,
        payload: { name: string; layout?: HomeLayout; sourceId?: string; activate?: boolean }
    ): string | null {
        const home = resolveHomeLayouts(context.state.shellHome)
        const requestedName = sanitizeLayoutName(payload.name)
        if (requestedName === '' || home.layouts.length >= MAX_HOME_LAYOUTS) return null

        const stored = context.state.shellHome?.items ?? {}
        home.layouts.filter((entry) => stored[entry.id] === undefined).forEach((entry) => saveEntry(context, entry))

        const source = home.layouts.find((entry) => entry.id === (payload.sourceId ?? home.activeId)) ?? home.layouts[0]
        const id = uuidv4()
        saveEntry(context, {
            id,
            name: uniqueLayoutName(
                requestedName,
                home.layouts.map((entry) => entry.name)
            ),
            order: Math.max(...home.layouts.map((entry) => entry.order)) + 1,
            layout: normalizeHomeLayout(payload.layout ?? source.layout),
        })
        context.dispatch('replaceSetting', {
            name: 'shellHome.active',
            value: (payload.activate ?? true) ? id : home.activeId,
        })

        return id
    },

    switchHomeLayout({ dispatch, state }, id: string) {
        const home = resolveHomeLayouts(state.shellHome)
        if (id === home.activeId || !home.layouts.some((entry) => entry.id === id)) return

        dispatch('replaceSetting', { name: 'shellHome.active', value: id })
    },

    renameHomeLayout(context, payload: { id: string; name: string }) {
        const home = resolveHomeLayouts(context.state.shellHome)
        const entry = home.layouts.find((layout) => layout.id === payload.id)
        const name = sanitizeLayoutName(payload.name)
        if (entry === undefined || name === '') return

        saveEntry(context, { ...entry, name })
    },

    deleteHomeLayout({ dispatch, state }, id: string) {
        const home = resolveHomeLayouts(state.shellHome)
        const index = home.layouts.findIndex((entry) => entry.id === id)
        if (index === -1 || home.layouts.length < 2) return

        if (id === home.activeId) {
            const next = home.layouts[index + 1] ?? home.layouts[index - 1]
            dispatch('replaceSetting', { name: 'shellHome.active', value: next.id })
        }

        dispatch('deleteSettingKey', `${ITEMS_KEY}.${id}`)
    },
}
