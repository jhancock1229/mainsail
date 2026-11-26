<template>
    <v-card flat>
        <v-card-text>
            <v-row>
                <v-col class="col-12 col-md-6">
                    <settings-dashboard-sortable viewport-name="tablet" :column="1" :layout-state="layoutState" />
                </v-col>
                <v-col class="col-12 col-md-6">
                    <settings-dashboard-sortable viewport-name="tablet" :column="2" :layout-state="layoutState" />
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
import DashboardMixin from '@/components/mixins/dashboard'
import SettingsDashboardSortable from '@/components/settings/Dashboard/Sortable.vue'
import { DashboardLayoutState } from '@/plugins/dashboardLayoutState'
@Component({
    components: {
        SettingsDashboardSortable,
    },
})
export default class SettingsDashboardTabTablet extends Mixins(DashboardMixin) {
    @Prop({ type: String, required: false, default: 'idle' }) declare readonly layoutState: DashboardLayoutState

    resetLayout() {
        this.$store.dispatch('gui/resetStateLayout', { layoutState: this.layoutState, viewport: 'tablet' })
    }
}
</script>

<style scoped></style>
