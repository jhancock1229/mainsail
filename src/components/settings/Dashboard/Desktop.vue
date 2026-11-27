<template>
    <v-card flat>
        <v-card-text>
            <v-row>
                <v-col v-for="column in columnNumbers" :key="column" :class="columnClass">
                    <settings-dashboard-sortable viewport-name="desktop" :column="column" :layout-state="layoutState" />
                </v-col>
            </v-row>
            <v-row>
                <v-col class="text-center">
                    <v-btn color="error" @click="resetLayout">{{ $t('Settings.DashboardTab.ResetLayout') }}</v-btn>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import SettingsDashboardSortable from '@/components/settings/Dashboard/Sortable.vue'
import { DashboardLayoutState } from '@/plugins/dashboardLayoutState'

@Component({
    components: {
        SettingsDashboardSortable,
    },
})
export default class SettingsDashboardTabDesktop extends Mixins(DashboardLayoutsMixin) {
    @Prop({ type: String, required: false, default: 'idle' }) declare readonly layoutState: DashboardLayoutState

    get columnNumbers(): number[] {
        return this.getSettingsColumnNumbers('desktop')
    }

    get columnClass(): string {
        return this.getSettingsColumnClass('desktop')
    }

    resetLayout() {
        this.editDashboardLayout('resetStateLayout', { layoutState: this.layoutState, viewport: 'desktop' })
    }
}
</script>

<style scoped></style>
