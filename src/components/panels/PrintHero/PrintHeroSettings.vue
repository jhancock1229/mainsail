<template>
    <v-menu :offset-y="true" :left="true" :close-on-content-click="false" content-class="print-hero-settings">
        <template #activator="{ on, attrs }">
            <v-btn
                icon
                dark
                class="print-hero-settings__button"
                :aria-label="$t('Panels.PrintHeroPanel.Settings')"
                v-bind="attrs"
                v-on="on">
                <v-icon small>{{ mdiCog }}</v-icon>
            </v-btn>
        </template>
        <v-list dense>
            <v-subheader class="print-hero-settings__subheader">{{ $t('Panels.PrintHeroPanel.Backdrop') }}</v-subheader>
            <v-list-item class="minHeight36">
                <v-btn-toggle v-model="backdrop" mandatory dense class="print-hero-settings__backdrop">
                    <v-btn v-for="option in backdropOptions" :key="option.value" small :value="option.value">
                        {{ option.text }}
                    </v-btn>
                </v-btn-toggle>
            </v-list-item>
            <v-subheader class="print-hero-settings__subheader mt-2">
                {{ $t('Panels.PrintHeroPanel.Numbers') }}
            </v-subheader>
            <v-list-item v-for="metric in metricOptions" :key="metric.value" class="minHeight36">
                <v-checkbox
                    class="mt-0"
                    hide-details
                    :input-value="metric.visible"
                    :label="metric.text"
                    @change="setMetric(metric.value, $event)" />
            </v-list-item>
            <v-divider class="my-2" />
            <v-list-item class="minHeight36">
                <v-checkbox
                    v-model="showTimeline"
                    class="mt-0"
                    hide-details
                    :label="$t('Panels.PrintHeroPanel.ShowTimeline')" />
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiCog } from '@mdi/js'
import { capitalize } from '@/plugins/helpers'
import {
    printHeroBackdrops,
    printHeroMetrics,
    resolvePrintHeroSettings,
    togglePrintHeroMetric,
    type PrintHeroBackdrop,
    type PrintHeroMetric,
    type PrintHeroSettings as Settings,
} from '@/plugins/printHero'

@Component
export default class PrintHeroSettings extends Mixins(BaseMixin) {
    mdiCog = mdiCog

    get settings(): Settings {
        return resolvePrintHeroSettings(this.$store.state.gui.view.printHero)
    }

    get backdrop(): PrintHeroBackdrop {
        return this.settings.backdrop
    }

    set backdrop(newVal: PrintHeroBackdrop) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.printHero.backdrop', value: newVal })
    }

    get showTimeline(): boolean {
        return this.settings.showTimeline
    }

    set showTimeline(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.printHero.showTimeline', value: newVal })
    }

    get backdropOptions(): { value: PrintHeroBackdrop; text: string }[] {
        return printHeroBackdrops.map((value) => ({
            value,
            text: this.$t(`Panels.PrintHeroPanel.Backdrop${capitalize(value)}`).toString(),
        }))
    }

    get metricOptions(): { value: PrintHeroMetric; text: string; visible: boolean }[] {
        return printHeroMetrics.map((value) => ({
            value,
            text: this.$t(`Panels.PrintHeroPanel.Metrics.${capitalize(value)}`).toString(),
            visible: this.settings.metrics.includes(value),
        }))
    }

    setMetric(metric: PrintHeroMetric, visible: boolean | null): void {
        this.$store.dispatch('gui/saveSetting', {
            name: 'view.printHero.metrics',
            value: togglePrintHeroMetric(this.settings.metrics, metric, visible === true),
        })
    }
}
</script>

<style scoped>
.print-hero-settings__button {
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(6px);
}

.print-hero-settings__subheader {
    height: 28px;
}
</style>
