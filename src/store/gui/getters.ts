import { GetterTree } from 'vuex'
import { GuiState, GuiStateDashboardLayoutKey, GuiStateLayoutoption } from '@/store/gui/types'
import { GuiMacrosStateMacrogroup } from '@/store/gui/macros/types'
import { allDashboardPanels, defaultTheme, themes } from '@/store/variables'
import { RootState, Theme } from '@/store/types'
import { DashboardLayoutState, deriveStateLayout, getViewportLayoutKeys } from '@/plugins/dashboardLayoutState'
import { resolvePrintHeroSettings } from '@/plugins/printHero'

export const getters: GetterTree<GuiState, RootState> = {
    theme: (state): string => {
        const theme = state.uiSettings.theme

        // return defaultTheme, if theme doesnt exists
        if (themes.findIndex((tmp: Theme) => tmp.name === theme) === -1) return defaultTheme

        return theme
    },

    getTheme: (state, getters): Theme => {
        return themes.find((theme: Theme) => theme.name === getters.theme) ?? themes[0]
    },

    getDatasetValue: (state) => (payload: { name: string; type: string }) => {
        if (
            payload.name in state.view.tempchart.datasetSettings &&
            payload.type in state.view.tempchart.datasetSettings[payload.name]
        )
            return state.view.tempchart.datasetSettings[payload.name][payload.type]

        return ['temperature', 'target'].includes(payload.type)
    },

    getDatasetAdditionalSensorValue: (state) => (payload: { name: string; sensor: string }) => {
        const entry = state.view.tempchart.datasetSettings[payload.name] ?? null
        if (entry === null || typeof entry !== 'object' || !('additionalSensors' in entry)) return true

        const sensors = entry.additionalSensors as Record<string, unknown>
        return (sensors[payload.sensor] ?? true) as boolean
    },

    getPanelExpand: (state) => (name: string, viewport: string) => {
        if ('dashboard' in state && viewport in state.dashboard.nonExpandPanels) {
            return !state.dashboard.nonExpandPanels[viewport].includes(name)
        }

        return true
    },

    getAllPossiblePanels: (state, getters, rootState, rootGetters) => {
        let allPanels = [...allDashboardPanels]

        // remove macros panel and add macrogroups panels if macroMode === expert
        if (state.macros?.mode === 'expert') {
            const macrogroups = getters['macros/getAllMacrogroups']

            macrogroups.forEach((group: GuiMacrosStateMacrogroup) => {
                allPanels.push('macrogroup_' + group.id)
            })

            allPanels = allPanels.filter((name) => name !== 'macros')
        }

        // remove toolhead & machine-settings panel, if kinematics === none
        const printerKinematics = rootGetters['printer/getKinematics']
        if (printerKinematics === 'none') {
            allPanels = allPanels.filter((name) => !['toolhead-control', 'machine-settings'].includes(name))
        }

        // remove extruder panel, if printerExtruderCount < 1
        const printerExtruders = rootGetters['printer/getExtruders']
        if (printerExtruders.length < 1) {
            allPanels = allPanels.filter((name) => name !== 'extruder-control')
        }

        // remove temperature panel, if sensors < 1
        const printerTemperatureSensors = rootState.printer?.heaters?.available_sensors ?? []
        if (printerTemperatureSensors.length < 1) {
            allPanels = allPanels.filter((name) => name !== 'temperature')
        }

        // remove webcam panel, if no webcam exists
        const webcams = getters['webcams/getWebcams']
        if (webcams.length === 0) {
            allPanels = allPanels.filter((name) => name !== 'webcam')
        }

        // remove spoolman panel, if no spoolman component exists in moonraker
        if (!rootState.server?.components.includes('spoolman')) {
            allPanels = allPanels.filter((name) => name !== 'spoolman')
        }

        // remove afc panel, if no AFC module exists in Klipper
        if (!rootState.printer?.AFC) {
            allPanels = allPanels.filter((name) => name !== 'afc')
        }

        // remove mmu panel, if no Happy Hare exists in Klipper
        if (!rootState.printer?.mmu) {
            allPanels = allPanels.filter((name) => name !== 'mmu')
        }

        // remove led_effects panel, if no led_effect object exists in Klipper
        const ledEffectsPrefix = 'led_effect '
        const existsLedEffects = Object.keys(rootState.printer ?? {}).some((name) =>
            name.toLowerCase().startsWith(ledEffectsPrefix)
        )
        if (!existsLedEffects) {
            allPanels = allPanels.filter((name) => name !== 'led-effects')
        }

        return allPanels
    },

    getDashboardLayout:
        (state, getters) =>
        (layoutName: GuiStateDashboardLayoutKey, layoutState: DashboardLayoutState = 'idle') => {
            const idlePanels = (state.dashboard[layoutName] ?? []).filter((element) => element !== null)
            if (layoutState === 'idle') return idlePanels

            const customPanels = state.dashboard.stateLayouts?.[layoutState]?.[layoutName]
            if (Array.isArray(customPanels)) return customPanels.filter((element) => element !== null)

            const viewport = layoutName.replace(/Layout\d?$/, '')

            return deriveStateLayout(layoutState, idlePanels, {
                heroShowsWebcam: getters['getPrintHeroShowsWebcam'](viewport),
            })
        },

    getPrintHeroShowsWebcam:
        (state, getters) =>
        (viewport: string): boolean => {
            if (!getters['getAllPossiblePanels'].includes('print-hero')) return false
            if ((getters['webcams/getWebcams'] ?? []).length !== 1) return false
            if (resolvePrintHeroSettings(state.view?.printHero).backdrop !== 'webcam') return false

            const idlePanels = getters['getAllPanelsFromViewport'](viewport, 'idle') as GuiStateLayoutoption[]

            return idlePanels.find((panel) => panel.name === 'print-hero')?.visible ?? true
        },

    hasCustomStateLayout:
        (state) =>
        (viewport: string, layoutState: DashboardLayoutState): boolean => {
            if (layoutState === 'idle') return false

            const customLayouts = state.dashboard.stateLayouts?.[layoutState] ?? {}
            return getViewportLayoutKeys(viewport).some((layoutKey) => Array.isArray(customLayouts[layoutKey]))
        },

    getPrintHeroInLayout:
        (state, getters) =>
        (viewport: string, layoutState: DashboardLayoutState = 'idle'): boolean => {
            const columnCount = getViewportLayoutKeys(viewport).length
            const columns = columnCount === 1 ? [0] : Array.from({ length: columnCount }, (_, index) => index + 1)

            return columns.some((column) => {
                const panels = getters['getPanels'](viewport, column, true, layoutState) as GuiStateLayoutoption[]

                return panels.some((panel) => panel.name === 'print-hero')
            })
        },

    getPanels:
        (state, getters, rootState) =>
        (
            viewport: string,
            column: number,
            onlyVisible: boolean = false,
            layoutState: DashboardLayoutState = 'idle'
        ) => {
            const layoutName = (
                column ? `${viewport}Layout${column}` : `${viewport}Layout`
            ) as GuiStateDashboardLayoutKey

            const isDerived =
                layoutState !== 'idle' && !Array.isArray(state.dashboard.stateLayouts?.[layoutState]?.[layoutName])
            const sourceState = isDerived ? 'idle' : layoutState
            let panels = getters['getDashboardLayout'](layoutName, sourceState) as GuiStateLayoutoption[]

            const allPossiblePanels = getters['getAllPossiblePanels']

            if (column < 2) {
                const allViewportPanels = getters['getAllPanelsFromViewport'](
                    viewport,
                    sourceState
                ) as GuiStateLayoutoption[]
                const missingPanels: GuiStateLayoutoption[] = []

                allPossiblePanels.forEach((panelname: string) => {
                    if (!allViewportPanels.find((panel) => panel.name === panelname))
                        missingPanels.push({
                            name: panelname,
                            visible: true,
                        })
                })
                const isHero = (panel: GuiStateLayoutoption) => panel.name === 'print-hero'
                panels = [
                    ...missingPanels.filter(isHero),
                    ...panels,
                    ...missingPanels.filter((panel) => !isHero(panel)),
                ]
            }

            if (isDerived) {
                panels = deriveStateLayout(layoutState, panels, {
                    heroShowsWebcam: getters['getPrintHeroShowsWebcam'](viewport),
                })
            }

            if (onlyVisible) {
                panels = panels.filter((element) => element.visible)
            }

            if (rootState.gui?.macros?.mode === 'simple')
                panels = panels.filter((element) => !element.name.startsWith('macrogroup_'))
            else {
                panels = panels.filter((element) => element.name !== 'macros')
                const macrogroups = getters['macros/getAllMacrogroups']
                if (macrogroups.length) {
                    panels = panels.filter((element) => {
                        if (!element.name.startsWith('macrogroup_')) return true

                        const macrogroupId = element.name.slice(11)
                        return (
                            macrogroups.findIndex(
                                (macrogroup: GuiMacrosStateMacrogroup) => macrogroup.id === macrogroupId
                            ) !== -1
                        )
                    })
                }
            }

            return panels.filter((element) => allPossiblePanels.includes(element.name))
        },

    getAllPanelsFromViewport:
        (state, getters) =>
        (viewport: string, layoutState: DashboardLayoutState = 'idle') => {
            let panels: GuiStateLayoutoption[] = []

            getViewportLayoutKeys(viewport).forEach((layoutKey) => {
                if (!(layoutKey in state.dashboard)) return

                panels = panels.concat(getters['getDashboardLayout'](layoutKey, layoutState))
            })

            return panels
        },

    getDefaultControlActionButton: (state, getters, rootState, rootGetters) => {
        if (rootGetters['printer/existsQGL']) return 'qgl'
        else if (rootGetters['printer/existsZtilt']) return 'ztilt'

        return 'm84'
    },

    getHours12Format: (state) => {
        const setting = state.general.timeFormat
        if (setting === '12hours') return true
        if (setting === null) {
            return Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hour12
        }

        return false
    },
}
