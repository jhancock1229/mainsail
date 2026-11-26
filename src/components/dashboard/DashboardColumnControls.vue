<template>
    <div class="column-controls">
        <div class="column-controls__count">
            <v-btn
                class="column-controls__fewer"
                icon
                small
                :disabled="columns.count <= limits.min"
                :title="$t('Dashboard.Layouts.FewerColumns')"
                @click="setColumnCount(columns.count - 1)">
                <v-icon small>{{ mdiMinus }}</v-icon>
            </v-btn>
            <span class="column-controls__value">{{ columns.count }}</span>
            <v-btn
                class="column-controls__more"
                icon
                small
                :disabled="columns.count >= limits.max"
                :title="$t('Dashboard.Layouts.MoreColumns')"
                @click="setColumnCount(columns.count + 1)">
                <v-icon small>{{ mdiPlus }}</v-icon>
            </v-btn>
        </div>
        <dashboard-column-widths
            v-if="columns.count > 1"
            class="column-controls__widths"
            :widths="columns.widths"
            @preview="$emit('preview', $event)"
            @change="setColumnWidths" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import DashboardColumnWidths from '@/components/dashboard/DashboardColumnWidths.vue'
import { DashboardColumns, columnLimits, isDashboardViewport } from '@/plugins/dashboardNamedLayouts'
import { mdiMinus, mdiPlus } from '@mdi/js'

@Component({
    components: { DashboardColumnWidths },
})
export default class DashboardColumnControls extends Mixins(DashboardLayoutsMixin) {
    @Prop({ type: String, required: true }) declare readonly layoutViewport: string

    mdiMinus = mdiMinus
    mdiPlus = mdiPlus

    get columns(): DashboardColumns {
        return this.getDashboardColumns(this.layoutViewport)
    }

    get limits(): { min: number; max: number } {
        return isDashboardViewport(this.layoutViewport) ? columnLimits[this.layoutViewport] : { min: 1, max: 1 }
    }

    setColumnCount(count: number): void {
        this.$store.dispatch('gui/setDashboardColumnCount', { viewport: this.layoutViewport, count })
    }

    setColumnWidths(widths: number[]): void {
        this.$store.dispatch('gui/setDashboardColumnWidths', { viewport: this.layoutViewport, widths })
    }
}
</script>

<style scoped>
.column-controls {
    display: flex;
    flex: 1 1 auto;
    gap: 12px;
    align-items: center;
    min-width: 0;
}

.column-controls__count {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
}

.column-controls__value {
    min-width: 20px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    text-align: center;
}

.column-controls__widths {
    flex: 1 1 160px;
    max-width: 360px;
}
</style>
