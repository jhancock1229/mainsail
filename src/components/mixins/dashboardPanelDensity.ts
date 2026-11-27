import Vue from 'vue'
import Component from 'vue-class-component'
import { Inject } from 'vue-property-decorator'
import { PanelDensity, applyDensityToHeight } from '@/plugins/dashboardNamedLayouts'

@Component
export default class DashboardPanelDensityMixin extends Vue {
    @Inject({ from: 'dashboardPanelSlot', default: null })
    readonly dashboardPanelSlot!: { density: PanelDensity } | null

    get panelDensity(): PanelDensity {
        return this.dashboardPanelSlot?.density ?? 'normal'
    }

    densityHeight(height: number): number {
        return applyDensityToHeight(height, this.panelDensity)
    }
}
