<template>
    <div class="temperature-card" :class="cardClasses" :style="cardStyle" :data-object="objectName">
        <div class="temperature-card__header">
            <v-icon small :color="iconColor" :class="iconClass" tabindex="-1" @click="openEditDialog">
                {{ icon }}
            </v-icon>
            <span class="temperature-card__name text-truncate cursor-pointer" @click="openEditDialog">
                {{ formatName }}
            </span>
            <span class="temperature-card__state" :class="stateClass" :data-state="cardState">
                <v-icon x-small :class="stateClass">{{ stateIcon }}</v-icon>
                {{ stateLabel }}
            </span>
        </div>
        <div class="temperature-card__body">
            <div class="temperature-card__temperature">
                {{ temperatureWhole }}
                <span class="temperature-card__decimal">{{ temperatureDecimal }}</span>
                <span class="temperature-card__unit">°C</span>
            </div>
            <temperature-input
                v-if="command !== null"
                class="temperature-card__target"
                :name="name"
                :target="target"
                :presets="null"
                :min_temp="min_temp"
                :max_temp="max_temp"
                :command="command"
                :input-digits="targetDigits"
                :attribute-name="commandAttributeName" />
        </div>
        <div class="temperature-card__meta">
            <span v-if="metaLabel" class="text-truncate">{{ metaLabel }}</span>
            <span v-if="rpm !== null" :class="rpmClass">{{ rpm }} RPM</span>
            <v-spacer />
            <span v-if="state !== null" class="temperature-card__power-label" :title="avgStateTitle">
                <v-icon x-small>{{ powerIcon }}</v-icon>
                {{ powerLabel }}
            </span>
        </div>
        <temperature-panel-list-item-additional-sensor
            v-if="additionalSensorName"
            class="temperature-card__additional"
            :object-name="objectName"
            :additional-object-name="additionalSensorName" />
        <div v-if="command !== null" class="temperature-card__presets">
            <v-chip
                v-for="preset in presets"
                :key="preset.value"
                :small="!isTouchDevice"
                label
                :outlined="preset.value !== target"
                :color="preset.value === target ? 'primary' : undefined"
                :disabled="presetsDisabled"
                @click="setTarget(preset.value)">
                <template v-if="preset.value === 0">
                    <v-icon x-small left>{{ mdiSnowflake }}</v-icon>
                    {{ $t('Panels.TemperaturePanel.Cards.PresetOff') }}
                </template>
                <template v-else>{{ preset.value }}°</template>
            </v-chip>
        </div>
        <div class="temperature-card__sparkline">
            <temperature-panel-card-sparkline
                :object-name="objectName"
                :color="color"
                :window-seconds="windowSeconds"
                :target="target"
                :label="`${formatName}, ${sparklineLabel}`" />
            <span class="temperature-card__window">{{ sparklineLabel }}</span>
        </div>
        <div v-if="state !== null" class="temperature-card__power">
            <div :style="{ width: `${powerPercent}%` }"></div>
        </div>
        <temperature-panel-list-item-edit
            v-model="showEditDialog"
            :object-name="objectName"
            :name="name"
            :format-name="formatName"
            :additional-sensor-name="additionalSensorName"
            :icon="icon"
            :color="color" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import {
    mdiCheck,
    mdiChevronDoubleDown,
    mdiChevronDoubleUp,
    mdiFan,
    mdiFlash,
    mdiPower,
    mdiTrendingDown,
    mdiTrendingNeutral,
    mdiTrendingUp,
} from '@mdi/js'
import TemperaturePanelListItem from '@/components/panels/Temperature/TemperaturePanelListItem.vue'
import {
    TREND_SECONDS,
    TemperatureCardKind,
    TemperatureCardState,
    TemperatureTrend,
    getTemperatureCardKind,
    getTemperatureCardState,
    getTemperatureDelta,
    getTemperatureSamples,
    getTemperatureTrend,
} from '@/plugins/temperatureCards'

const SECONDS_PER_MINUTE = 60
const PERCENT = 100
const MIN_TARGET_DIGITS = 3

@Component
export default class TemperaturePanelCard extends Mixins(TemperaturePanelListItem) {
    @Prop({ type: Number, required: true }) readonly windowSeconds!: number

    get kind(): TemperatureCardKind {
        return getTemperatureCardKind(this.objectName, this.availableHeaters)
    }

    get cardState(): TemperatureCardState {
        return getTemperatureCardState({ kind: this.kind, temperature: this.temperature, target: this.target })
    }

    get trend(): TemperatureTrend {
        const source = this.$store.state.printer.tempHistory?.source ?? []
        const samples = getTemperatureSamples(source, this.objectName, TREND_SECONDS)

        return getTemperatureTrend(samples.map((sample) => sample.value))
    }

    get cardClasses(): string[] {
        return [`temperature-card--${this.kind}`, `temperature-card--${this.cardState}`]
    }

    get cardStyle(): Record<string, string> {
        return { '--temperature-card-color': this.color }
    }

    get stateLabel(): string {
        if (this.cardState === 'sensor') {
            const trends = {
                rising: this.$t('Panels.TemperaturePanel.Cards.Rising'),
                falling: this.$t('Panels.TemperaturePanel.Cards.Falling'),
                steady: this.$t('Panels.TemperaturePanel.Cards.Steady'),
            }

            return trends[this.trend].toString()
        }

        if (this.kind === 'fan' && this.cardState === 'atTarget')
            return this.$t('Panels.TemperaturePanel.Cards.InRange').toString()

        const states = {
            heating: this.$t('Panels.TemperaturePanel.Cards.Heating'),
            atTarget: this.$t('Panels.TemperaturePanel.Cards.AtTarget'),
            cooling: this.$t('Panels.TemperaturePanel.Cards.Cooling'),
            off: this.$t('Panels.TemperaturePanel.Cards.Off'),
        }

        return states[this.cardState].toString()
    }

    get stateIcon(): string {
        if (this.cardState === 'sensor') {
            const trends = { rising: mdiTrendingUp, falling: mdiTrendingDown, steady: mdiTrendingNeutral }

            return trends[this.trend]
        }

        const states = {
            heating: mdiChevronDoubleUp,
            atTarget: mdiCheck,
            cooling: mdiChevronDoubleDown,
            off: mdiPower,
        }

        return states[this.cardState]
    }

    get stateClass(): string {
        const classes = {
            heating: 'warning--text',
            atTarget: 'success--text',
            cooling: 'info--text',
            off: 'text--disabled',
            sensor: 'text--secondary',
        }

        return classes[this.cardState]
    }

    get temperatureParts(): string[] {
        return this.temperature?.toFixed(1).split('.') ?? ['--', '-']
    }

    get temperatureWhole(): string {
        return this.temperatureParts[0]
    }

    get temperatureDecimal(): string {
        return `.${this.temperatureParts[1]}`
    }

    get metaLabel(): string {
        if (this.kind === 'sensor') return this.minMaxLabel
        if (this.cardState === 'off') return ''

        const delta = getTemperatureDelta(this.temperature, this.target)
        if (delta === null) return this.$t('Panels.TemperaturePanel.Cards.NoTarget').toString()
        if (delta === 0) return this.$t('Panels.TemperaturePanel.Cards.OnTarget').toString()

        const distance = { delta: Math.abs(delta).toFixed(1) }
        if (delta > 0) return this.$t('Panels.TemperaturePanel.Cards.AboveTarget', distance).toString()

        return this.$t('Panels.TemperaturePanel.Cards.BelowTarget', distance).toString()
    }

    get minMaxLabel(): string {
        if (this.measured_min_temp === null || this.measured_max_temp === null) return ''

        const min = `${this.$t('Panels.TemperaturePanel.Min')} ${this.measured_min_temp}°`
        const max = `${this.$t('Panels.TemperaturePanel.Max')} ${this.measured_max_temp}°`

        return `${min} · ${max}`
    }

    get powerPercent(): number {
        return Math.round((this.state ?? 0) * PERCENT)
    }

    get powerLabel(): string {
        return `${this.powerPercent} %`
    }

    get powerIcon(): string {
        return this.isFan ? mdiFan : mdiFlash
    }

    get avgStateTitle(): string {
        return `${this.$t('Panels.TemperaturePanel.Avg')}: ${this.avgState} %`
    }

    get targetDigits(): number {
        return Math.max(MIN_TARGET_DIGITS, this.max_temp.toString().length)
    }

    get presetsDisabled(): boolean {
        return ['printing', 'paused'].includes(this.printer_state)
    }

    get sparklineLabel(): string {
        return this.$t('Panels.TemperaturePanel.Cards.Minutes', {
            minutes: Math.round(this.windowSeconds / SECONDS_PER_MINUTE),
        }).toString()
    }

    setTarget(value: number): void {
        const gcode = `${this.command} ${this.commandAttributeName}=${this.name} TARGET=${value}`
        this.$store.dispatch('server/addEvent', { message: gcode, type: 'command' })
        this.$socket.emit('printer.gcode.script', { script: gcode })
    }
}
</script>

<style scoped>
.temperature-card {
    position: relative;
    display: flex;
    flex: 1 1 150px;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
}

.theme--light .temperature-card {
    border-color: rgba(0, 0, 0, 0.1);
    background: rgba(0, 0, 0, 0.02);
}

.temperature-card--heater,
.temperature-card--fan {
    flex: 2 1 260px;
}

.temperature-card::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 1;
    width: 3px;
    content: '';
    background: transparent;
    transition: background 0.3s ease;
}

.temperature-card--heating::before {
    background: var(--v-warning-base);
}

.temperature-card--atTarget::before {
    background: var(--v-success-base);
}

.temperature-card--cooling::before {
    background: var(--v-info-base);
}

.temperature-card__header,
.temperature-card__body,
.temperature-card__meta,
.temperature-card__additional,
.temperature-card__presets {
    padding: 0 12px;
}

.temperature-card__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 10px;
    font-size: 0.875rem;
    font-weight: 500;
}

.temperature-card__name {
    flex: 1 1 auto;
    min-width: 0;
}

.temperature-card__state {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
}

.temperature-card--heating .temperature-card__state .v-icon {
    animation: temperature-card-pulse 1.6s ease-in-out infinite;
}

.temperature-card__body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 2px;
}

.temperature-card__temperature {
    display: flex;
    align-items: baseline;
    font-size: 2rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
}

.temperature-card__decimal,
.temperature-card__unit {
    font-size: 1rem;
    opacity: 0.7;
}

.temperature-card__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
    font-size: 0.75rem;
    opacity: 0.7;
}

.temperature-card__power-label {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    font-variant-numeric: tabular-nums;
}

.temperature-card__additional {
    font-size: 0.75rem;
}

.temperature-card__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}

.temperature-card__sparkline {
    position: relative;
    flex: 1 0 40px;
    margin-top: 6px;
}

.temperature-card__window {
    position: absolute;
    bottom: 3px;
    left: 6px;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba(30, 30, 30, 0.8);
    font-size: 0.625rem;
    line-height: 1;
    color: rgba(255, 255, 255, 0.6);
    pointer-events: none;
}

.theme--light .temperature-card__window {
    background: rgba(255, 255, 255, 0.85);
    color: rgba(0, 0, 0, 0.6);
}

.temperature-card__power {
    height: 3px;
    background: rgba(128, 128, 128, 0.2);
}

.temperature-card__power > div {
    height: 100%;
    background: var(--temperature-card-color);
    transition: width 0.5s ease;
}

::v-deep .v-icon._no-focus-style:focus::after {
    opacity: 0 !important;
}

.cursor-pointer {
    cursor: pointer;
}

@keyframes temperature-card-pulse {
    50% {
        opacity: 0.35;
    }
}

@media (prefers-reduced-motion: reduce) {
    .temperature-card--heating .temperature-card__state .v-icon {
        animation: none;
    }
}
</style>
