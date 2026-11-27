import Vue from 'vue'
import { getDefaultState } from './index'
import { MutationTree } from 'vuex'
import { GuiState, GuiStateDashboard, GuiStateDashboardLayoutKey, GuiStateLayoutoption } from '@/store/gui/types'
import { isRecord, setDataDeep } from '@/plugins/helpers'

export const mutations: MutationTree<GuiState> = {
    reset(state) {
        Object.assign(state, getDefaultState())
    },

    setData(state, payload) {
        setDataDeep(state, payload)
    },

    saveSetting(state, payload: { name: string; value: unknown }) {
        const nested = payload.name.split('.').reduceRight<unknown>((value, key) => ({ [key]: value }), payload.value)
        setDataDeep(state, nested)
    },

    setHeaterChartVisibility(state, payload) {
        const index = state.view.tempchart.hiddenDataset.indexOf(payload.name.toUpperCase())

        if (payload.hidden && index === -1) state.view.tempchart.hiddenDataset.push(payload.name.toUpperCase())
        else if (payload.hidden !== true && index > -1) state.view.tempchart.hiddenDataset.splice(index, 1)
    },

    setGcodefilesMetadata(state, data) {
        const array = [...state.view.gcodefiles.hideMetadataColumns]
        const index = array.findIndex((value: string) => value === data.name)

        if (data.value && index !== -1) array.splice(index, 1)
        else if (!data.value && index === -1) array.push(data.name)

        Vue.set(state.view.gcodefiles, 'hideMetadataColumns', array)
    },

    setGcodefilesShowHiddenFiles(state, value) {
        Vue.set(state.view.gcodefiles, 'showHiddenFiles', value)
    },

    setCurrentWebcam(state, payload) {
        Vue.set(state.view.webcam.currentCam, payload.page, payload.value)
    },

    setHistoryColumns(state, data) {
        if (data.value && state.view.history.hideColums.includes(data.name)) {
            state.view.history.hideColums.splice(state.view.history.hideColums.indexOf(data.name), 1)
        } else if (!data.value && !state.view.history.hideColums.includes(data.name)) {
            state.view.history.hideColums.push(data.name)
        }
    },

    setHistoryHidePrintStatus(state, payload) {
        Vue.set(state.view.history, 'hidePrintStatus', payload)
    },

    addClosePanel(state, payload) {
        const nonExpandPanels = [...state.dashboard.nonExpandPanels[payload.viewport]]

        if (!nonExpandPanels.includes(payload.name)) {
            nonExpandPanels.push(payload.name)

            Vue.set(state.dashboard.nonExpandPanels, payload.viewport, nonExpandPanels)
        }
    },

    removeClosePanel(state, payload) {
        const nonExpandPanels = [...state.dashboard.nonExpandPanels[payload.viewport]]
        const index = nonExpandPanels.indexOf(payload.name)
        if (index > -1) {
            nonExpandPanels.splice(index, 1)

            Vue.set(state.dashboard.nonExpandPanels, payload.viewport, nonExpandPanels)
        }
    },

    deleteFromDashboardLayout(state, payload) {
        const layoutArray = [
            ...(state.dashboard[payload.layoutname as keyof GuiStateDashboard] as GuiStateLayoutoption[]),
        ]
        layoutArray.splice(payload.index, 1)
        Vue.set(state.dashboard, payload.layoutname, layoutArray)
    },

    replaceSetting(state, payload: { name: string; value: unknown }) {
        const keys = payload.name.split('.')
        let target = state as unknown as Record<string, unknown>
        keys.slice(0, -1).forEach((key) => {
            if (!isRecord(target[key])) Vue.set(target, key, {})
            target = target[key] as Record<string, unknown>
        })
        Vue.set(target, keys[keys.length - 1], payload.value)
    },

    deleteSetting(state, payload: { name: string }) {
        const keys = payload.name.split('.')
        let target: unknown = state
        keys.slice(0, -1).forEach((key) => {
            target = isRecord(target) ? target[key] : undefined
        })
        if (isRecord(target)) Vue.delete(target, keys[keys.length - 1])
    },

    deleteStateLayout(state, payload: { layoutState: 'printing' | 'error'; layoutKey: GuiStateDashboardLayoutKey }) {
        const stateLayouts = state.dashboard.stateLayouts?.[payload.layoutState]
        if (stateLayouts) Vue.delete(stateLayouts, payload.layoutKey)
    },

    setChartDatasetStatus(state, payload: { objectName: string; dataset: string; value: boolean }) {
        // set new value if object doesn't exist in view.tempchart.datasetSettings
        if (!(payload.objectName in state.view.tempchart.datasetSettings)) {
            const newVal: Record<string, boolean> = {}
            newVal[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings, payload.objectName, newVal)
            return
        }

        Vue.set(state.view.tempchart.datasetSettings[payload.objectName], payload.dataset, payload.value)
    },

    setDatasetAdditionalSensorStatus(state, payload: { objectName: string; dataset: string; value: boolean }) {
        // set new value if object doesn't exist in view.tempchart.datasetSettings
        if (!(payload.objectName in state.view.tempchart.datasetSettings)) {
            const newVal: { additionalSensors: Record<string, boolean> } = { additionalSensors: {} }
            newVal.additionalSensors[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings, payload.objectName, newVal)
            return
        }

        // set new value if additionalSensor object doesn't exist in view.tempchart.datasetSettings
        if (!('additionalSensors' in state.view.tempchart.datasetSettings[payload.objectName])) {
            const newVal: Record<string, boolean> = {}
            newVal[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings[payload.objectName], 'additionalSensors', newVal)
            return
        }

        Vue.set(
            state.view.tempchart.datasetSettings[payload.objectName].additionalSensors as Record<string, boolean>,
            payload.dataset,
            payload.value
        )
    },
}
