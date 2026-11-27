import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { GuiStateLayoutoption } from '@/store/gui/types'
import {
    customLayoutStates,
    dashboardViewports,
    getAllColumnKeys,
    removePanelFromSnapshot,
} from '@/plugins/dashboardNamedLayouts'
import { v4 as uuidv4 } from 'uuid'
import Vue from 'vue'
import { GuiMacrosState } from '@/store/gui/macros/types'

export const actions: ActionTree<GuiMacrosState, RootState> = {
    reset({ commit }) {
        commit('reset')
    },

    saveSetting({ dispatch }, payload) {
        dispatch(
            'gui/saveSetting',
            {
                name: 'macros.' + payload.name,
                value: payload.value,
            },
            { root: true }
        )
    },

    groupUpload({ state }, id) {
        Vue.$socket.emit('server.database.post_item', {
            namespace: 'mainsail',
            key: 'macros.macrogroups.' + id,
            value: state.macrogroups[id],
        })
    },

    async groupStore({ commit, dispatch }, payload) {
        const id = uuidv4()

        await commit('groupStore', { id, values: payload.values })
        await dispatch('groupUpload', id)

        return id
    },

    groupUpdate({ commit, dispatch }, payload) {
        commit('groupUpdate', payload)
        dispatch('groupUpload', payload.id)
    },

    addMacroToMacrogroup({ commit, dispatch }, payload) {
        commit('addMacroToMacrogroup', payload)
        dispatch('groupUpload', payload.id)
    },

    updateMacroFromMacrogroup({ commit, dispatch }, payload) {
        commit('updateMacroFromMacrogroup', payload)

        if (!payload.skipUpload) dispatch('groupUpload', payload.id)
    },

    removeMacroFromMacrogroup({ commit, dispatch }, payload) {
        commit('removeMacroFromMacrogroup', payload)
        dispatch('groupUpload', payload.id)
    },

    groupDelete({ commit, dispatch, rootState }, id) {
        commit('groupDelete', id)
        Vue.$socket.emit('server.database.delete_item', { namespace: 'mainsail', key: 'macros.macrogroups.' + id })

        const dashboard = rootState.gui?.dashboard
        if (!dashboard) return

        const panelName = 'macrogroup_' + id
        const layouts = dashboardViewports.flatMap((viewport) => getAllColumnKeys(viewport))
        const without = (list: GuiStateLayoutoption[]): GuiStateLayoutoption[] => {
            return list.filter((layoutPos) => layoutPos.name !== panelName)
        }
        const columns = dashboard as unknown as Record<string, unknown>

        layouts.forEach((layoutname) => {
            const layoutArray = columns[layoutname]
            if (!Array.isArray(layoutArray)) return

            const index = layoutArray.findIndex((layoutPos: GuiStateLayoutoption) => layoutPos.name === panelName)
            if (index === -1) return

            commit('gui/deleteFromDashboardLayout', { layoutname, index }, { root: true })
            dispatch(
                'gui/updateSettings',
                { keyName: 'dashboard.' + layoutname, newVal: without(layoutArray) },
                { root: true }
            )
        })

        customLayoutStates.forEach((layoutState) => {
            const stateColumns = (dashboard.stateLayouts?.[layoutState] ?? {}) as Record<string, unknown>
            layouts.forEach((layoutname) => {
                const layoutArray = stateColumns[layoutname]
                if (!Array.isArray(layoutArray)) return
                if (!layoutArray.some((layoutPos: GuiStateLayoutoption) => layoutPos.name === panelName)) return

                dispatch(
                    'gui/saveSetting',
                    { name: `dashboard.stateLayouts.${layoutState}.${layoutname}`, value: without(layoutArray) },
                    { root: true }
                )
            })
        })

        if (dashboard.panelDensity?.[panelName] !== undefined) {
            dispatch('gui/deleteSettingKey', `dashboard.panelDensity.${panelName}`, { root: true })
        }

        const items = dashboard.namedLayouts?.items ?? {}
        Object.keys(items).forEach((layoutId) => {
            const snapshot = removePanelFromSnapshot(items[layoutId]?.snapshot, panelName)
            if (snapshot === null) return

            dispatch(
                'gui/replaceSetting',
                { name: `dashboard.namedLayouts.items.${layoutId}`, value: { ...items[layoutId], snapshot } },
                { root: true }
            )
        })
    },
}
