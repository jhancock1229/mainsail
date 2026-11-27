import Vue from 'vue'
import { ActionContext, ActionTree } from 'vuex'
import { v4 as uuidv4 } from 'uuid'
import { GuiState, GuiStateLayoutoption } from '@/store/gui/types'
import { RootState } from '@/store/types'
import { getDefaultSnapshot } from './dashboardLayoutDefaults'
import { getDefaultState } from './index'
import { inOrder, isSameSetting, readStoredSetting, withStoredValues } from './layoutSync'
import {
    DashboardLayoutSnapshot,
    MAX_NAMED_LAYOUTS,
    NamedLayouts,
    PanelDensity,
    captureSnapshot,
    customLayoutStates,
    getAllColumnKeys,
    getStoredSnapshot,
    isDashboardViewport,
    redistributeColumns,
    resolveColumns,
    resolveNamedLayouts,
    sanitizeLayoutName,
    uniqueLayoutName,
} from '@/plugins/dashboardNamedLayouts'

type Context = ActionContext<GuiState, RootState>

const ITEMS_KEY = 'dashboard.namedLayouts.items'

const isSame = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const applySnapshot = ({ dispatch }: Context, snapshot: DashboardLayoutSnapshot): void => {
    Object.keys(snapshot.panels).forEach((key) => {
        dispatch('replaceSetting', { name: `dashboard.${key}`, value: snapshot.panels[key] })
    })
    customLayoutStates.forEach((layoutState) => {
        dispatch('replaceSetting', {
            name: `dashboard.stateLayouts.${layoutState}`,
            value: snapshot.stateLayouts[layoutState],
        })
    })
    dispatch('replaceSetting', { name: 'dashboard.columns', value: snapshot.columns })
    dispatch('replaceSetting', { name: 'dashboard.panelDensity', value: snapshot.density })
}

// A dashboard that never had a second layout has no stored entry for its only layout.
const materializeActiveLayout = ({ dispatch, state }: Context, named: NamedLayouts): void => {
    if (state.dashboard.namedLayouts?.items?.[named.activeId] !== undefined) return

    const active = named.layouts.find((layout) => layout.id === named.activeId)
    dispatch('replaceSetting', {
        name: `${ITEMS_KEY}.${named.activeId}`,
        value: { name: active?.name ?? '', order: active?.order ?? 0 },
    })
    dispatch('replaceSetting', { name: 'dashboard.namedLayouts.active', value: named.activeId })
}

type SyncResult = 'unchanged' | 'updated' | 'active-changed'

const syncDashboard = async ({ commit, state }: Context): Promise<SyncResult> => {
    const stored = await readStoredSetting('dashboard')
    if (stored === null) return 'unchanged'

    const fresh = withStoredValues(getDefaultState().dashboard, stored.value)
    if (isSameSetting(fresh, state.dashboard)) return 'unchanged'

    const activeBefore = resolveNamedLayouts(state.dashboard.namedLayouts).activeId
    commit('replaceSetting', { name: 'dashboard', value: fresh })

    return resolveNamedLayouts(fresh.namedLayouts).activeId === activeBefore ? 'updated' : 'active-changed'
}

const switchLayout = async (context: Context, id: string): Promise<void> => {
    await syncDashboard(context)

    const { dispatch, state } = context
    const named = resolveNamedLayouts(state.dashboard.namedLayouts)
    if (id === named.activeId || !named.layouts.some((layout) => layout.id === id)) return

    const fallback = getDefaultSnapshot()
    const outgoing = named.layouts.find((layout) => layout.id === named.activeId)
    dispatch('replaceSetting', {
        name: `${ITEMS_KEY}.${named.activeId}`,
        value: {
            name: outgoing?.name ?? '',
            order: outgoing?.order ?? 0,
            snapshot: captureSnapshot(state.dashboard, fallback),
        },
    })

    const incoming = getStoredSnapshot(state.dashboard.namedLayouts, id, fallback)
    dispatch('replaceSetting', { name: 'dashboard.namedLayouts.active', value: id })
    applySnapshot(context, incoming)
}

const createLayout = async (
    context: Context,
    payload: { name: string; snapshot?: DashboardLayoutSnapshot; sourceId?: string; activate?: boolean }
): Promise<string | null> => {
    await syncDashboard(context)

    const { dispatch, state } = context
    const named = resolveNamedLayouts(state.dashboard.namedLayouts)
    const requestedName = sanitizeLayoutName(payload.name)
    if (requestedName === '' || named.layouts.length >= MAX_NAMED_LAYOUTS) return null

    materializeActiveLayout(context, named)

    const fallback = getDefaultSnapshot()
    const copiesStored = payload.sourceId !== undefined && payload.sourceId !== named.activeId
    const snapshot =
        payload.snapshot ??
        (copiesStored
            ? getStoredSnapshot(state.dashboard.namedLayouts, payload.sourceId ?? '', fallback)
            : captureSnapshot(state.dashboard, fallback))

    const id = uuidv4()
    dispatch('replaceSetting', {
        name: `${ITEMS_KEY}.${id}`,
        value: {
            name: uniqueLayoutName(
                requestedName,
                named.layouts.map((layout) => layout.name)
            ),
            order: Math.max(...named.layouts.map((layout) => layout.order)) + 1,
            snapshot,
        },
    })

    if (payload.activate ?? true) await switchLayout(context, id)

    return id
}

const renameLayout = async (context: Context, payload: { id: string; name: string }): Promise<void> => {
    await syncDashboard(context)

    const { dispatch, state } = context
    const named = resolveNamedLayouts(state.dashboard.namedLayouts)
    const requestedName = sanitizeLayoutName(payload.name)
    if (requestedName === '' || !named.layouts.some((layout) => layout.id === payload.id)) return

    const otherNames = named.layouts.filter((layout) => layout.id !== payload.id).map((layout) => layout.name)

    materializeActiveLayout(context, named)
    dispatch('saveSetting', {
        name: `${ITEMS_KEY}.${payload.id}.name`,
        value: uniqueLayoutName(requestedName, otherNames),
    })
}

const deleteLayout = async (context: Context, id: string): Promise<void> => {
    await syncDashboard(context)

    const { dispatch, state } = context
    const named = resolveNamedLayouts(state.dashboard.namedLayouts)
    const index = named.layouts.findIndex((layout) => layout.id === id)
    if (index === -1 || named.layouts.length < 2) return

    if (id === named.activeId) {
        const next = named.layouts[index + 1] ?? named.layouts[index - 1]
        await switchLayout(context, next.id)
    }

    dispatch('deleteSettingKey', `${ITEMS_KEY}.${id}`)
}

export const dashboardLayoutActions: ActionTree<GuiState, RootState> = {
    editDashboardLayout(context, edit: { action: string; payload: unknown }): Promise<boolean> {
        return inOrder(async () => {
            if ((await syncDashboard(context)) === 'active-changed') return false

            await context.dispatch(edit.action, edit.payload)

            return true
        })
    },

    replaceSetting({ commit }, payload: { name: string; value: unknown }) {
        commit('replaceSetting', payload)
        Vue.$socket.emit('server.database.post_item', {
            namespace: 'mainsail',
            key: payload.name,
            value: payload.value,
        })
    },

    deleteSettingKey({ commit }, name: string) {
        commit('deleteSetting', { name })
        Vue.$socket.emit('server.database.delete_item', { namespace: 'mainsail', key: name })
    },

    switchDashboardLayout(context, id: string) {
        return inOrder(() => switchLayout(context, id))
    },

    createDashboardLayout(
        context,
        payload: { name: string; snapshot?: DashboardLayoutSnapshot; sourceId?: string; activate?: boolean }
    ): Promise<string | null> {
        return inOrder(() => createLayout(context, payload))
    },

    renameDashboardLayout(context, payload: { id: string; name: string }) {
        return inOrder(() => renameLayout(context, payload))
    },

    deleteDashboardLayout(context, id: string) {
        return inOrder(() => deleteLayout(context, id))
    },

    setDashboardColumnCount({ dispatch, state }, payload: { viewport: string; count: number }) {
        const viewport = payload.viewport
        if (!isDashboardViewport(viewport)) return

        const current = resolveColumns(viewport, state.dashboard.columns?.[viewport])
        const count = resolveColumns(viewport, { count: payload.count }).count
        if (count === current.count) return

        const keys = getAllColumnKeys(viewport)
        const redistribute = (source: Record<string, unknown>): GuiStateLayoutoption[][] => {
            const columns = keys.map((key) => (Array.isArray(source[key]) ? source[key] : []))

            return redistributeColumns(columns, count)
        }

        const idle = state.dashboard as unknown as Record<string, unknown>
        const idleColumns = redistribute(idle)
        keys.forEach((key, index) => {
            const value = idleColumns[index] ?? []
            if (!isSame(idle[key] ?? [], value)) dispatch('replaceSetting', { name: `dashboard.${key}`, value })
        })

        customLayoutStates.forEach((layoutState) => {
            const custom = (state.dashboard.stateLayouts?.[layoutState] ?? {}) as Record<string, unknown>
            if (!keys.some((key) => Array.isArray(custom[key]))) return

            const customColumns = redistribute(custom)
            keys.forEach((key, index) => {
                const name = `dashboard.stateLayouts.${layoutState}.${key}`
                if (index < count) dispatch('replaceSetting', { name, value: customColumns[index] })
                else if (custom[key] !== undefined) dispatch('deleteSettingKey', name)
            })
        })

        dispatch('replaceSetting', {
            name: `dashboard.columns.${viewport}`,
            value: resolveColumns(viewport, { count }),
        })
    },

    setDashboardColumnWidths({ dispatch, state }, payload: { viewport: string; widths: number[] }) {
        const viewport = payload.viewport
        if (!isDashboardViewport(viewport)) return

        const current = resolveColumns(viewport, state.dashboard.columns?.[viewport])
        const next = resolveColumns(viewport, { count: current.count, widths: payload.widths })
        if (isSame(current, next)) return

        dispatch('replaceSetting', { name: `dashboard.columns.${viewport}`, value: next })
    },

    setDashboardPanelDensity({ dispatch }, payload: { name: string; density: PanelDensity }) {
        dispatch('saveSetting', { name: `dashboard.panelDensity.${payload.name}`, value: payload.density })
    },
}
