<template>
    <v-card flat>
        <v-card-text>
            <v-row>
                <v-col>
                    <settings-dashboard-sortable viewport-name="mobile" :column="0" :layout-state="layoutState" />
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
export default class SettingsDashboardTabMobile extends Mixins(DashboardLayoutsMixin) {
    @Prop({ type: String, required: false, default: 'idle' }) declare readonly layoutState: DashboardLayoutState

    resetLayout() {
        this.editDashboardLayout('resetStateLayout', { layoutState: this.layoutState, viewport: 'mobile' })
    }
}
</script>

<style scoped></style>
