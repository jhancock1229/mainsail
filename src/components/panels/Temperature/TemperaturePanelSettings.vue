<template>
    <v-menu :offset-y="true" :close-on-content-click="false" :title="$t('Panels.TemperaturePanel.SetupTemperatures')">
        <template #activator="{ on, attrs }">
            <v-btn icon tile v-bind="attrs" v-on="on">
                <v-icon small>{{ mdiCog }}</v-icon>
            </v-btn>
        </template>
        <v-list>
            <v-list-item class="minHeight36">
                <span class="text-body-2 mr-4">{{ $t('Panels.TemperaturePanel.Cards.View') }}</span>
                <v-spacer />
                <v-btn-toggle v-model="viewMode" class="temperature-panel-settings__view" dense mandatory>
                    <v-btn value="cards" small>
                        <v-icon small left>{{ mdiViewGridOutline }}</v-icon>
                        {{ $t('Panels.TemperaturePanel.Cards.ViewCards') }}
                    </v-btn>
                    <v-btn value="table" small>
                        <v-icon small left>{{ mdiTable }}</v-icon>
                        {{ $t('Panels.TemperaturePanel.Cards.ViewTable') }}
                    </v-btn>
                </v-btn-toggle>
            </v-list-item>
            <v-list-item class="minHeight36">
                <v-checkbox
                    v-model="boolTempchart"
                    class="mt-0"
                    hide-details
                    :label="$t('Panels.TemperaturePanel.ShowChart')" />
            </v-list-item>
            <v-list-item class="minHeight36">
                <v-checkbox
                    v-model="hideMcuHostSensors"
                    class="mt-0"
                    hide-details
                    :label="$t('Panels.TemperaturePanel.HideMcuHostSensors')" />
            </v-list-item>
            <v-list-item class="minHeight36">
                <v-checkbox
                    v-model="hideMonitors"
                    class="mt-0"
                    hide-details
                    :label="$t('Panels.TemperaturePanel.HideMonitors')" />
            </v-list-item>
            <v-list-item class="minHeight36">
                <v-checkbox
                    v-model="autoscaleTempchart"
                    class="mt-0"
                    hide-details
                    :label="$t('Panels.TemperaturePanel.AutoscaleChart')" />
            </v-list-item>
            <temperature-panel-settings-cards v-if="temperatureCardsActive" />
        </v-list>
    </v-menu>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiCog, mdiTable, mdiViewGridOutline } from '@mdi/js'
import TemperatureCardsMixin from '@/components/mixins/temperatureCards'
import { TemperatureViewMode } from '@/plugins/temperatureCards'

@Component
export default class TemperaturePanelSettings extends Mixins(BaseMixin, TemperatureCardsMixin) {
    mdiCog = mdiCog
    mdiTable = mdiTable
    mdiViewGridOutline = mdiViewGridOutline

    get viewMode(): TemperatureViewMode {
        return this.temperatureCardSettings.viewMode
    }

    set viewMode(newVal: TemperatureViewMode) {
        this.saveTemperatureCardSetting('viewMode', newVal)
    }

    get boolTempchart(): boolean {
        return this.$store.state.gui.view.tempchart.boolTempchart ?? false
    }

    set boolTempchart(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.tempchart.boolTempchart', value: newVal })
    }

    get autoscaleTempchart(): boolean {
        return this.$store.state.gui.view.tempchart.autoscale ?? false
    }

    set autoscaleTempchart(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.tempchart.autoscale', value: newVal })
    }

    get hideMcuHostSensors(): boolean {
        return this.$store.state.gui.view.tempchart.hideMcuHostSensors ?? false
    }

    set hideMcuHostSensors(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.tempchart.hideMcuHostSensors', value: newVal })
    }

    get hideMonitors(): boolean {
        return this.$store.state.gui.view.tempchart.hideMonitors ?? false
    }

    set hideMonitors(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.tempchart.hideMonitors', value: newVal })
    }
}
</script>

<style scoped>
.temperature-panel-settings__view .v-btn {
    text-transform: none;
}
</style>
