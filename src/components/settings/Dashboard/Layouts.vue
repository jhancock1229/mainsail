<template>
    <named-layout-list
        :layouts="dashboardLayouts"
        :can-add="canAddDashboardLayout"
        :title="$t('Dashboard.Layouts.Layouts')"
        :description="$t('Dashboard.Layouts.Description')"
        @switch="switchDashboardLayout"
        @rename="renameDashboardLayout"
        @create="createDashboardLayout"
        @delete="deleteLayout"
        @export="exportLayout"
        @import="importDashboardLayout" />
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import NamedLayoutList from '@/components/layouts/NamedLayoutList.vue'

@Component({
    components: { NamedLayoutList },
})
export default class SettingsDashboardLayouts extends Mixins(DashboardLayoutsMixin) {
    deleteLayout(id: string): void {
        this.$store.dispatch('gui/deleteDashboardLayout', id)
    }

    exportLayout(id: string): void {
        const layout = this.dashboardLayouts.find((entry) => entry.id === id)
        if (layout) this.exportDashboardLayout(layout)
    }
}
</script>
