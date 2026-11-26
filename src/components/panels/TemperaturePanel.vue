<template>
    <panel
        v-if="klipperReadyForGui"
        :icon="mdiThermometerLines"
        :title="$t('Panels.TemperaturePanel.Headline')"
        :collapsible="true"
        card-class="temperature-panel">
        <template #buttons>
            <temperature-panel-presets />
            <temperature-panel-settings />
        </template>
        <v-card-text v-if="temperatureCardsActive" class="pa-0">
            <temperature-panel-cards />
            <template v-if="boolTempchart">
                <v-divider class="my-0" />
                <button
                    type="button"
                    class="temperature-panel__chart-toggle"
                    :aria-expanded="chartExpanded ? 'true' : 'false'"
                    @click="chartExpanded = !chartExpanded">
                    <v-icon small>{{ mdiChartLine }}</v-icon>
                    <span>{{ $t('Panels.TemperaturePanel.Cards.Chart') }}</span>
                    <v-spacer />
                    <v-icon small :class="{ 'temperature-panel__chevron--open': chartExpanded }">
                        {{ mdiChevronDown }}
                    </v-icon>
                </button>
                <v-expand-transition>
                    <div v-if="chartExpanded">
                        <temp-chart />
                    </div>
                </v-expand-transition>
            </template>
        </v-card-text>
        <v-card-text v-else class="pa-0">
            <temperature-panel-list />
            <template v-if="boolTempchart">
                <v-divider class="my-0" />
                <temp-chart />
            </template>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import { capitalize, convertName } from '@/plugins/helpers'
import BaseMixin from '@/components/mixins/base'
import ControlMixin from '@/components/mixins/control'
import TempChart from '@/components/charts/TempChart.vue'
import Panel from '@/components/ui/Panel.vue'
import { mdiChartLine, mdiChevronDown, mdiCloseThick, mdiThermometerLines } from '@mdi/js'
import TemperaturePanelPresets from '@/components/panels/Temperature/TemperaturePanelPresets.vue'
import TemperatureCardsMixin from '@/components/mixins/temperatureCards'

@Component({
    components: { Panel, TempChart, TemperaturePanelPresets },
})
export default class TemperaturePanel extends Mixins(BaseMixin, ControlMixin, TemperatureCardsMixin) {
    mdiChartLine = mdiChartLine
    mdiChevronDown = mdiChevronDown
    mdiCloseThick = mdiCloseThick
    mdiThermometerLines = mdiThermometerLines

    convertName = convertName
    capitalize = capitalize

    get boolTempchart(): boolean {
        return this.$store.state.gui.view.tempchart.boolTempchart ?? false
    }

    get chartExpanded(): boolean {
        return this.temperatureCardSettings.chartExpanded
    }

    set chartExpanded(newVal: boolean) {
        this.saveTemperatureCardSetting('chartExpanded', newVal)
    }
}
</script>

<style scoped>
.temperature-panel__chart-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 16px;
    font-size: 0.8125rem;
    color: inherit;
    opacity: 0.8;
}

.temperature-panel__chart-toggle:hover,
.temperature-panel__chart-toggle:focus-visible {
    opacity: 1;
}

.temperature-panel__chart-toggle .v-icon {
    transition: transform 0.2s ease;
}

.temperature-panel__chevron--open {
    transform: rotate(180deg);
}
</style>
