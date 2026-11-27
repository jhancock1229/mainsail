import { ActionContext, ActionTree } from 'vuex'
import { v4 as uuidv4 } from 'uuid'
import { GuiState } from '@/store/gui/types'
import { RootState } from '@/store/types'
import { getDefaultState } from './index'
import { inOrder, isSameSetting, readStoredSetting, withStoredValues } from './layoutSync'
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

export type HomeSaveResult = 'saved' | 'invalid' | 'stale'

const syncHome = async ({ commit, state }: Context): Promise<boolean> => {
    const stored = await readStoredSetting('shellHome')
    if (stored === null) return true

    const fresh = withStoredValues(getDefaultState().shellHome, stored.value)
    if (isSameSetting(fresh, state.shellHome)) return true

    const activeBefore = resolveHomeLayouts(state.shellHome).activeId
    commit('replaceSetting', { name: 'shellHome', value: fresh })

    return resolveHomeLayouts(fresh).activeId === activeBefore
}

const saveActiveLayout = (context: Context, change: (layout: HomeLayout) => HomeLayout): Promise<HomeSaveResult> => {
    return inOrder(() => changeActiveLayout(context, change))
}

const changeActiveLayout = async (
    context: Context,
    change: (layout: HomeLayout) => HomeLayout
): Promise<HomeSaveResult> => {
    if (!(await syncHome(context))) return 'stale'

    const home = resolveHomeLayouts(context.state.shellHome)
    const active = home.layouts.find((entry) => entry.id === home.activeId) ?? home.layouts[0]

    saveEntry(context, { ...active, layout: change(active.layout) })
    if (context.state.shellHome?.active !== active.id) {
        context.dispatch('replaceSetting', { name: 'shellHome.active', value: active.id })
    }

    return 'saved'
}

export const shellHomeActions: ActionTree<GuiState, RootState> = {
    saveHomeArrangement(
        context,
        payload: { state: HomeLayoutState; columns: HomeArrangement }
    ): Promise<HomeSaveResult> {
        if (checkArrangement(payload.state, payload.columns) !== null) return Promise.resolve('invalid')

        return saveActiveLayout(context, (layout) => ({
            ...layout,
            states: { ...layout.states, [payload.state]: payload.columns },
        }))
    },

    saveHomeActions(context, actions: WhileActionId[]): Promise<HomeSaveResult> {
        if (normalizeWhileActions(actions).join() !== actions.join()) return Promise.resolve('invalid')

        return saveActiveLayout(context, (layout) => ({ ...layout, actions: [...actions] }))
    },

    resetHomeArrangement(context, state: HomeLayoutState): Promise<HomeSaveResult> {
        return saveActiveLayout(context, (layout) => ({
            states: { ...layout.states, [state]: defaultHomeArrangement(state) },
            actions: state === 'printing' ? [...defaultWhileActions] : layout.actions,
        }))
    },

    createHomeLayout(
        context,
        payload: { name: string; layout?: HomeLayout; sourceId?: string; activate?: boolean }
    ): Promise<string | null> {
        return inOrder(() => createLayout(context, payload))
    },

    switchHomeLayout(context, id: string) {
        return inOrder(() => switchLayout(context, id))
    },

    renameHomeLayout(context, payload: { id: string; name: string }) {
        return inOrder(() => renameLayout(context, payload))
    },

    deleteHomeLayout(context, id: string) {
        return inOrder(() => deleteLayout(context, id))
    },
}

const createLayout = async (
    context: Context,
    payload: { name: string; layout?: HomeLayout; sourceId?: string; activate?: boolean }
): Promise<string | null> => {
    await syncHome(context)

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
}

const switchLayout = async (context: Context, id: string): Promise<void> => {
    await syncHome(context)

    const { dispatch, state } = context
    const home = resolveHomeLayouts(state.shellHome)
    if (id === home.activeId || !home.layouts.some((entry) => entry.id === id)) return

    dispatch('replaceSetting', { name: 'shellHome.active', value: id })
}

const renameLayout = async (context: Context, payload: { id: string; name: string }): Promise<void> => {
    await syncHome(context)

    const home = resolveHomeLayouts(context.state.shellHome)
    const entry = home.layouts.find((layout) => layout.id === payload.id)
    const requestedName = sanitizeLayoutName(payload.name)
    if (entry === undefined || requestedName === '') return

    const otherNames = home.layouts.filter((layout) => layout.id !== payload.id).map((layout) => layout.name)

    saveEntry(context, { ...entry, name: uniqueLayoutName(requestedName, otherNames) })
}

const deleteLayout = async (context: Context, id: string): Promise<void> => {
    await syncHome(context)

    const { dispatch, state } = context
    const home = resolveHomeLayouts(state.shellHome)
    const index = home.layouts.findIndex((entry) => entry.id === id)
    if (index === -1 || home.layouts.length < 2) return

    if (id === home.activeId) {
        const next = home.layouts[index + 1] ?? home.layouts[index - 1]
        dispatch('replaceSetting', { name: 'shellHome.active', value: next.id })
    }

    dispatch('deleteSettingKey', `${ITEMS_KEY}.${id}`)
}
