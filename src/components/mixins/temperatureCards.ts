import Component from 'vue-class-component'
import Vue from 'vue'
import {
    TemperatureCardSettings,
    getTemperatureCardObjects,
    normalizeTemperatureCardSettings,
    resolveSparklineWindow,
    sortTemperatureCards,
} from '@/plugins/temperatureCards'

@Component
export default class TemperatureCardsMixin extends Vue {
    // settings stored before the cards existed lack this block, so every access goes through the fallbacks
    get temperatureCardSettings(): TemperatureCardSettings {
        return normalizeTemperatureCardSettings(this.$store.state.gui?.view?.temperatureCards)
    }

    get temperatureCardsActive(): boolean {
        return this.temperatureCardSettings.viewMode === 'cards'
    }

    get temperatureStoreSize(): number {
        return this.$store.getters['printer/tempHistory/getTemperatureStoreSize']
    }

    get sparklineWindow(): number {
        return resolveSparklineWindow(this.temperatureCardSettings.sparklineWindow, this.temperatureStoreSize)
    }

    // all cards in the order of the user, including the ones the user has hidden
    get temperatureCardObjects(): string[] {
        const names = getTemperatureCardObjects({
            heaters: this.$store.state.printer?.heaters?.available_heaters ?? [],
            sensors: this.$store.state.printer?.heaters?.available_sensors ?? [],
            monitors: this.$store.state.printer?.heaters?.available_monitors ?? [],
            settings: this.$store.state.printer?.configfile?.settings ?? {},
            hideMcuHostSensors: this.$store.state.gui?.view?.tempchart?.hideMcuHostSensors ?? false,
            hideMonitors: this.$store.state.gui?.view?.tempchart?.hideMonitors ?? false,
        })

        return sortTemperatureCards(names, this.temperatureCardSettings.order)
    }

    get visibleTemperatureCardObjects(): string[] {
        const hidden = this.temperatureCardSettings.hidden

        return this.temperatureCardObjects.filter((name) => !hidden.includes(name))
    }

    saveTemperatureCardSetting(name: keyof TemperatureCardSettings, value: unknown): void {
        this.$store.dispatch('gui/saveSetting', { name: `view.temperatureCards.${name}`, value })
    }
}
