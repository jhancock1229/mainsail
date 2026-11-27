<template>
    <div class="shell-heat">
        <div class="sh-row">
            <h2 class="sh-h2">{{ $t('Shell.Heat.Title') }}</h2>
            <router-link to="/tune/heater-tuning" class="shell-heat__adjust">{{ $t('Shell.Heat.Adjust') }}</router-link>
        </div>
        <div class="shell-heat__grid">
            <template v-for="row in rows">
                <div :key="row.name + '-label'" class="shell-heat__label text-truncate">{{ row.label }}</div>
                <div :key="row.name + '-value'" class="shell-heat__value">{{ row.value }}</div>
                <div
                    :key="row.name + '-status'"
                    class="shell-heat__status"
                    :class="'shell-heat__status--' + row.status">
                    {{ row.statusText }}
                </div>
            </template>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import TemperatureCardsMixin from '@/components/mixins/temperatureCards'
import { formatShellTemperature, resolveHeatStatus, resolveSensorTrend } from '@/plugins/shellStatus'

const TREND_SAMPLE_MS = 5000
const TREND_SAMPLES = 6

interface HeatRow {
    name: string
    label: string
    value: string
    status: string
    statusText: string
}

@Component
export default class ShellHeat extends Mixins(BaseMixin, TemperatureCardsMixin) {
    @Prop({ type: Number, default: 4 }) declare readonly max: number

    samples: Record<string, number>[] = []
    sampleTimer: number | null = null

    get rows(): HeatRow[] {
        return this.visibleTemperatureCardObjects.slice(0, this.max).map((name) => {
            const object = this.$store.state.printer[name] ?? {}
            const temperature: number = object.temperature ?? 0
            const hasTarget = 'target' in object
            const status = hasTarget
                ? resolveHeatStatus({ temperature, target: object.target ?? 0 })
                : resolveSensorTrend(temperature, this.samples[0]?.[name] ?? null)

            return {
                name,
                label: this.label(name),
                value: formatShellTemperature(object.temperature),
                status,
                statusText: this.$t(`Shell.Heat.${status}`, {
                    target: formatShellTemperature(object.target),
                }).toString(),
            }
        })
    }

    mounted(): void {
        this.sample()
        this.sampleTimer = window.setInterval(this.sample, TREND_SAMPLE_MS)
    }

    beforeDestroy(): void {
        if (this.sampleTimer !== null) window.clearInterval(this.sampleTimer)
    }

    sample(): void {
        const reading: Record<string, number> = {}
        this.visibleTemperatureCardObjects.forEach((name) => {
            reading[name] = this.$store.state.printer[name]?.temperature ?? 0
        })
        this.samples = [...this.samples, reading].slice(-TREND_SAMPLES)
    }

    label(name: string): string {
        if (name === 'heater_bed') return this.$t('Shell.Heat.Bed').toString()
        if (name === 'extruder') return this.$t('Shell.Heat.Nozzle').toString()

        const extruder = /^extruder(\d+)$/.exec(name)
        if (extruder) return this.$t('Shell.Heat.NozzleNumber', { number: Number(extruder[1]) + 1 }).toString()

        const short = name.split(' ').pop() ?? name
        const words = short.replace(/_/g, ' ')

        return words.charAt(0).toUpperCase() + words.slice(1)
    }
}
</script>

<style scoped>
.shell-heat {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.shell-heat__adjust {
    font-size: 13px;
    color: var(--shell-muted);
    text-decoration: none;
}

.shell-heat__adjust:hover {
    color: var(--shell-text);
    text-decoration: underline;
}

.shell-heat__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 12px 16px;
    align-items: baseline;
}

.shell-heat__label {
    font-size: 16px;
}

.shell-heat__value {
    font-size: 26px;
    line-height: 1.2;
    font-weight: 500;
    text-align: right;
}

.shell-heat__status {
    font-size: 13px;
    color: var(--shell-muted);
    min-width: 64px;
}

.shell-heat__status--onTarget {
    color: var(--shell-good);
}

@media (max-height: 800px) {
    .shell-heat__grid > :nth-child(n + 10) {
        display: none;
    }
}
</style>
