<template>
    <div class="dashboard-layout-bar" :class="{ 'dashboard-layout-bar--editing': editing }">
        <template v-if="!editing">
            <v-menu offset-y :max-height="420">
                <template #activator="{ on, attrs }">
                    <v-btn
                        class="dashboard-layout-bar__switcher"
                        text
                        small
                        v-bind="attrs"
                        :title="$t('Dashboard.Layouts.Switch')"
                        v-on="on">
                        <v-icon small left>{{ mdiViewDashboardOutline }}</v-icon>
                        <span class="dashboard-layout-bar__name text-truncate">{{ activeDashboardLayout.name }}</span>
                        <v-icon small right>{{ mdiMenuDown }}</v-icon>
                    </v-btn>
                </template>
                <v-list dense class="dashboard-layout-menu">
                    <v-subheader>{{ $t('Dashboard.Layouts.Layouts') }}</v-subheader>
                    <v-list-item
                        v-for="layout in dashboardLayouts"
                        :key="layout.id"
                        class="dashboard-layout-menu__layout"
                        @click="switchDashboardLayout(layout.id)">
                        <v-list-item-icon class="mr-3">
                            <v-icon small :color="layout.active ? 'primary' : ''">
                                {{ layout.active ? mdiCheck : mdiViewDashboardOutline }}
                            </v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ layout.name }}</v-list-item-title>
                    </v-list-item>
                    <v-divider class="my-1" />
                    <v-list-item :disabled="!canAddDashboardLayout" @click="showSaveAs = true">
                        <v-list-item-icon class="mr-3">
                            <v-icon small>{{ mdiContentSaveOutline }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ $t('Dashboard.Layouts.SaveAs') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="manageLayouts">
                        <v-list-item-icon class="mr-3">
                            <v-icon small>{{ mdiCog }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ $t('Dashboard.Layouts.Manage') }}</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
            <v-spacer />
            <v-btn class="dashboard-layout-bar__edit" text small @click="startEdit">
                <v-icon small left>{{ mdiPencilRulerOutline }}</v-icon>
                {{ $t('Dashboard.Layouts.Edit') }}
            </v-btn>
        </template>
        <v-sheet v-else class="dashboard-layout-editor" elevation="6" rounded>
            <div class="dashboard-layout-editor__row">
                <div class="dashboard-layout-editor__title">
                    <v-icon small left color="primary">{{ mdiPencilRulerOutline }}</v-icon>
                    <span class="text-truncate">
                        {{ $t('Dashboard.Layouts.Editing', { name: activeDashboardLayout.name }) }}
                    </span>
                </div>
                <v-btn-toggle
                    v-if="stateLayoutsEnabled"
                    v-model="editState"
                    class="dashboard-layout-editor__states"
                    mandatory
                    dense>
                    <v-btn v-for="state in layoutStates" :key="state.value" :value="state.value" small>
                        <v-icon small left>{{ state.icon }}</v-icon>
                        {{ state.text }}
                    </v-btn>
                </v-btn-toggle>
                <v-spacer />
                <v-btn class="dashboard-layout-editor__done" color="primary" small depressed @click="stopEdit">
                    <v-icon small left>{{ mdiCheck }}</v-icon>
                    {{ $t('Dashboard.Layouts.Done') }}
                </v-btn>
            </div>
            <div class="dashboard-layout-editor__row">
                <template v-if="canChangeColumns">
                    <span class="text-caption text--secondary">{{ $t('Dashboard.Layouts.Columns') }}</span>
                    <dashboard-column-controls
                        class="dashboard-layout-editor__columns"
                        :layout-viewport="layoutViewport"
                        @preview="previewWidths" />
                </template>
                <span class="dashboard-layout-editor__hint text-caption text--secondary">
                    <template v-if="editState !== 'idle'">
                        {{
                            isCustomized
                                ? $t('Dashboard.Layouts.StateCustomized')
                                : $t('Dashboard.Layouts.StateDerived')
                        }}
                    </template>
                    <template v-else>{{ $t('Dashboard.Layouts.EditHint') }}</template>
                </span>
                <v-spacer />
                <v-btn class="dashboard-layout-editor__reset" text small @click="resetLayout">
                    <v-icon small left>{{ mdiRestore }}</v-icon>
                    {{ $t('Dashboard.Layouts.Reset') }}
                </v-btn>
            </div>
        </v-sheet>
        <dashboard-layout-name-dialog
            :show="showSaveAs"
            :title="$t('Dashboard.Layouts.SaveAs')"
            :hint="$t('Dashboard.Layouts.SaveAsHint')"
            :confirm-text="$t('Buttons.Save')"
            @confirm="saveAs"
            @close="showSaveAs = false" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import DashboardColumnControls from '@/components/dashboard/DashboardColumnControls.vue'
import DashboardLayoutNameDialog from '@/components/dashboard/DashboardLayoutNameDialog.vue'
import { DashboardLayoutState } from '@/plugins/dashboardLayoutState'
import { dashboardEditBus, startDashboardEdit, stopDashboardEdit } from '@/plugins/dashboardEditBus'
import { OPEN_SETTINGS_TAB } from '@/plugins/commandPaletteBus'
import { columnLimits, isDashboardViewport } from '@/plugins/dashboardNamedLayouts'
import { EventBus } from '@/plugins/eventBus'
import {
    mdiAlertCircleOutline,
    mdiCheck,
    mdiCog,
    mdiContentSaveOutline,
    mdiMenuDown,
    mdiPencilRulerOutline,
    mdiPrinter3dNozzle,
    mdiRestore,
    mdiSleep,
    mdiViewDashboardOutline,
} from '@mdi/js'
import { TranslateResult } from 'vue-i18n'

@Component({
    components: { DashboardColumnControls, DashboardLayoutNameDialog },
})
export default class DashboardLayoutBar extends Mixins(DashboardLayoutsMixin) {
    @Prop({ type: String, required: true }) declare readonly layoutViewport: string

    mdiCheck = mdiCheck
    mdiCog = mdiCog
    mdiContentSaveOutline = mdiContentSaveOutline
    mdiMenuDown = mdiMenuDown
    mdiPencilRulerOutline = mdiPencilRulerOutline
    mdiRestore = mdiRestore
    mdiViewDashboardOutline = mdiViewDashboardOutline

    showSaveAs = false

    get editing(): boolean {
        return dashboardEditBus.editing
    }

    get stateLayoutsEnabled(): boolean {
        return this.$store.state.gui.dashboard.stateLayouts?.enabled ?? true
    }

    get editState(): DashboardLayoutState {
        return this.stateLayoutsEnabled ? (dashboardEditBus.layoutState ?? 'idle') : 'idle'
    }

    set editState(newVal: DashboardLayoutState) {
        dashboardEditBus.layoutState = newVal
    }

    get layoutStates(): { value: DashboardLayoutState; text: TranslateResult; icon: string }[] {
        return [
            { value: 'idle', text: this.$t('Settings.DashboardTab.Idle'), icon: mdiSleep },
            { value: 'printing', text: this.$t('Settings.DashboardTab.Printing'), icon: mdiPrinter3dNozzle },
            { value: 'error', text: this.$t('Settings.DashboardTab.Error'), icon: mdiAlertCircleOutline },
        ]
    }

    get canChangeColumns(): boolean {
        return isDashboardViewport(this.layoutViewport) && columnLimits[this.layoutViewport].max > 1
    }

    get isCustomized(): boolean {
        return this.$store.getters['gui/hasCustomStateLayout'](this.layoutViewport, this.editState)
    }

    startEdit(): void {
        startDashboardEdit(this.dashboardLayoutState)
    }

    stopEdit(): void {
        stopDashboardEdit()
    }

    saveAs(name: string): void {
        this.createDashboardLayout({ name })
    }

    manageLayouts(): void {
        EventBus.$emit(OPEN_SETTINGS_TAB, 'dashboard')
    }

    previewWidths(widths: number[] | null): void {
        dashboardEditBus.previewWidths = widths
    }

    resetLayout(): void {
        this.$store.dispatch('gui/resetStateLayout', { layoutState: this.editState, viewport: this.layoutViewport })
    }
}
</script>

<style scoped>
.dashboard-layout-bar {
    display: flex;
    align-items: center;
    min-height: 28px;
    margin: -8px 0 8px;
}

.dashboard-layout-bar .v-btn {
    text-transform: none;
    letter-spacing: normal;
}

.dashboard-layout-bar__switcher,
.dashboard-layout-bar__edit {
    opacity: 0.75;
}

.dashboard-layout-bar__switcher:hover,
.dashboard-layout-bar__edit:hover,
.dashboard-layout-bar__switcher[aria-expanded='true'] {
    opacity: 1;
}

.dashboard-layout-bar__name {
    max-width: 200px;
}

.dashboard-layout-bar--editing {
    position: sticky;
    top: 52px;
    z-index: 4;
    margin: 0 0 20px;
}

.dashboard-layout-editor {
    width: 100%;
    padding: 4px 12px;
    border: 1px solid var(--v-primary-base);
}

.dashboard-layout-editor__row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    padding: 6px 0;
}

.dashboard-layout-editor__row + .dashboard-layout-editor__row {
    border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.dashboard-layout-editor__title {
    display: flex;
    align-items: center;
    min-width: 0;
    font-weight: 500;
}

.dashboard-layout-editor__columns {
    flex: 0 1 420px;
}

.dashboard-layout-editor__hint {
    flex: 1 1 200px;
    min-width: 0;
}
</style>
