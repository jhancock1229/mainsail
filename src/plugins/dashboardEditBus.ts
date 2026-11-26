import Vue from 'vue'
import type { DashboardLayoutState } from '@/plugins/dashboardLayoutState'

export const dashboardEditBus = Vue.observable({
    editing: false,
    layoutState: null as DashboardLayoutState | null,
    previewWidths: null as number[] | null,
})

export const startDashboardEdit = (layoutState: DashboardLayoutState): void => {
    dashboardEditBus.layoutState = layoutState
    dashboardEditBus.previewWidths = null
    dashboardEditBus.editing = true
}

export const stopDashboardEdit = (): void => {
    dashboardEditBus.editing = false
    dashboardEditBus.layoutState = null
    dashboardEditBus.previewWidths = null
}
