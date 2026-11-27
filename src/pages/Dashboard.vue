<template>
    <div :class="{ 'dashboard-layout-changed': layoutChanged, 'dashboard--editing': editing }">
        <dashboard-layout-bar v-if="showDashboardLayoutBar || editing" :layout-viewport="viewport" />
        <v-row>
            <v-col v-for="column in columns" :key="column.key" class="dashboard-column" :style="column.style">
                <status-panel v-if="column.index === 0" />
                <draggable
                    :value="column.panels"
                    class="dashboard-column__panels"
                    handle=".dashboard-slot__handle"
                    ghost-class="dashboard-slot--ghost"
                    :group="'dashboard-' + viewport"
                    :disabled="!editing"
                    :animation="150"
                    :force-fallback="true"
                    :data-empty-text="$t('Dashboard.Layouts.EmptyColumn')"
                    @input="saveColumn(column, $event)">
                    <dashboard-panel-slot
                        v-for="component in column.panels"
                        :key="'dashboard-' + column.key + '-' + component.name"
                        :name="component.name"
                        :visible="component.visible"
                        :editing="editing"
                        :density="getPanelDensity(component.name)"
                        @cycle-density="cyclePanelDensity(component.name)"
                        @toggle-visible="toggleVisible(column, component.name)">
                        <component
                            :is="extractPanelName(component.name)"
                            :panel-id="extractPanelId(component.name)"></component>
                    </dashboard-panel-slot>
                </draggable>
            </v-col>
        </v-row>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import AfcPanel from '@/components/panels/AfcPanel.vue'
import ExtruderControlPanel from '@/components/panels/ExtruderControlPanel.vue'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import DashboardLayoutBar from '@/components/dashboard/DashboardLayoutBar.vue'
import DashboardPanelSlot from '@/components/dashboard/DashboardPanelSlot.vue'
import draggable from 'vuedraggable'
import { dashboardEditBus, stopDashboardEdit } from '@/plugins/dashboardEditBus'
import { DashboardLayoutState } from '@/plugins/dashboardLayoutState'
import { columnWidthPercent, getColumnKey, getColumnNumber, isDashboardViewport } from '@/plugins/dashboardNamedLayouts'
import { GuiStateLayoutoption } from '@/store/gui/types'
import KlippyStatePanel from '@/components/panels/KlippyStatePanel.vue'
import LedEffectsPanel from '@/components/panels/LedEffectsPanel.vue'
import MachineSettingsPanel from '@/components/panels/MachineSettingsPanel.vue'
import MacrogroupPanel from '@/components/panels/MacrogroupPanel.vue'
import MacrosPanel from '@/components/panels/MacrosPanel.vue'
import MiniconsolePanel from '@/components/panels/MiniconsolePanel.vue'
import MinSettingsPanel from '@/components/panels/MinSettingsPanel.vue'
import MiscellaneousPanel from '@/components/panels/MiscellaneousPanel.vue'
import SpoolmanPanel from '@/components/panels/SpoolmanPanel.vue'
import MmuPanel from '@/components/panels/MmuPanel.vue'
import PrintHeroPanel from '@/components/panels/PrintHeroPanel.vue'
import StatusPanel from '@/components/panels/StatusPanel.vue'
import ToolheadControlPanel from '@/components/panels/ToolheadControlPanel.vue'
import TemperaturePanel from '@/components/panels/TemperaturePanel.vue'
import WebcamPanel from '@/components/panels/WebcamPanel.vue'

interface DashboardColumn {
    index: number
    number: number
    key: string
    style: Record<string, string>
    panels: GuiStateLayoutoption[]
}

@Component({
    components: {
        AfcPanel,
        DashboardLayoutBar,
        DashboardPanelSlot,
        draggable,
        ExtruderControlPanel,
        KlippyStatePanel,
        LedEffectsPanel,
        MachineSettingsPanel,
        MacrogroupPanel,
        MacrosPanel,
        MiniconsolePanel,
        MinSettingsPanel,
        MiscellaneousPanel,
        SpoolmanPanel,
        MmuPanel,
        PrintHeroPanel,
        StatusPanel,
        ToolheadControlPanel,
        TemperaturePanel,
        WebcamPanel,
    },
})
export default class PageDashboard extends Mixins(DashboardLayoutsMixin) {
    layoutChanged = false
    layoutChangedTimeout: number | null = null

    get editing(): boolean {
        return dashboardEditBus.editing
    }

    get shownLayoutState(): DashboardLayoutState {
        if (!this.editing) return this.dashboardLayoutState

        const stateLayoutsEnabled = this.$store.state.gui.dashboard.stateLayouts?.enabled ?? true

        return stateLayoutsEnabled ? (dashboardEditBus.layoutState ?? 'idle') : 'idle'
    }

    get columns(): DashboardColumn[] {
        const viewport = this.viewport
        if (!isDashboardViewport(viewport)) return []

        const widths = dashboardEditBus.previewWidths ?? this.getDashboardColumns(viewport).widths

        return widths.map((width, index) => {
            const number = getColumnNumber(viewport, index)
            const percent = `${columnWidthPercent(width)}%`

            return {
                index,
                number,
                key: getColumnKey(viewport, index + 1),
                style: { flex: `0 0 ${percent}`, maxWidth: percent },
                panels: this.$store.getters['gui/getPanels'](viewport, number, !this.editing, this.shownLayoutState),
            }
        })
    }

    get layoutIdentity(): string {
        return `${this.namedLayouts.activeId}:${this.dashboardLayoutState}`
    }

    @Watch('layoutIdentity')
    onLayoutIdentityChanged(): void {
        if (this.layoutChangedTimeout !== null) window.clearTimeout(this.layoutChangedTimeout)

        this.layoutChanged = true
        this.layoutChangedTimeout = window.setTimeout(() => {
            this.layoutChanged = false
            this.layoutChangedTimeout = null
        }, 400)
    }

    @Watch('viewport')
    onViewportChanged(): void {
        dashboardEditBus.previewWidths = null
    }

    beforeDestroy(): void {
        if (this.layoutChangedTimeout !== null) window.clearTimeout(this.layoutChangedTimeout)
        stopDashboardEdit()
    }

    saveColumn(column: DashboardColumn, value: Array<GuiStateLayoutoption | undefined>): void {
        this.editDashboardLayout('saveStateLayout', {
            layoutState: this.shownLayoutState,
            viewport: this.viewport,
            column: column.number,
            value: value.filter((panel) => panel !== undefined),
        })
    }

    toggleVisible(column: DashboardColumn, name: string): void {
        this.saveColumn(
            column,
            column.panels.map((panel) => (panel.name === name ? { ...panel, visible: !panel.visible } : panel))
        )
    }

    extractPanelName(name: string) {
        return name.split('_')[0] + '-panel'
    }

    extractPanelId(name: string) {
        return name.split('_')[1] ?? null
    }
}
</script>

<style scoped>
.dashboard--editing .dashboard-column__panels {
    position: relative;
    min-height: 120px;
    padding-bottom: 48px;
}

.dashboard--editing .dashboard-column__panels:empty::before {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8125rem;
    content: attr(data-empty-text);
    border: 1px dashed rgba(128, 128, 128, 0.55);
    border-radius: 6px;
    opacity: 0.7;
}

.dashboard-column__panels ::v-deep .dashboard-slot--ghost {
    opacity: 0.35;
}

@keyframes dashboard-panel-settle {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
}

.dashboard-layout-changed ::v-deep .panel {
    animation: dashboard-panel-settle 0.35s ease-out;
}

@media (prefers-reduced-motion: reduce) {
    .dashboard-layout-changed ::v-deep .panel {
        animation: none;
    }
}
</style>
