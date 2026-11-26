<template>
    <svg
        class="temperature-sparkline"
        :viewBox="`0 0 ${width} ${height}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="label">
        <defs>
            <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" :stop-color="color" stop-opacity="0.28" />
                <stop offset="1" :stop-color="color" stop-opacity="0" />
            </linearGradient>
        </defs>
        <line
            v-if="targetY !== null"
            class="temperature-sparkline__target"
            x1="0"
            :x2="width"
            :y1="targetY"
            :y2="targetY"
            :stroke="color" />
        <path v-if="sparkline.area" :d="sparkline.area" :fill="`url(#${gradientId})`" />
        <path v-if="sparkline.line" class="temperature-sparkline__line" :d="sparkline.line" :stroke="color" />
    </svg>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    SparklinePoint,
    SparklineRange,
    buildSparkline,
    getSparklineRange,
    getSparklineY,
    getTemperatureSamples,
    reduceSamples,
} from '@/plugins/temperatureCards'
import { PrinterTempHistoryStateSourceEntry } from '@/store/printer/tempHistory/types'

const MILLISECONDS = 1000
// ids are global in the document and object names cannot be turned into unique ids (top_cover, top-cover)
let sparklineCount = 0

@Component
export default class TemperaturePanelCardSparkline extends Mixins(BaseMixin) {
    @Prop({ type: String, required: true }) readonly objectName!: string
    @Prop({ type: String, required: true }) readonly color!: string
    @Prop({ type: Number, required: true }) readonly windowSeconds!: number
    @Prop({ type: Number, default: null }) readonly target!: number | null
    @Prop({ type: String, default: '' }) readonly label!: string

    // the svg is stretched to the card, only the proportions of these matter
    width = 200
    height = 40
    gradientId = `temperature-sparkline-${++sparklineCount}`

    get source(): PrinterTempHistoryStateSourceEntry[] {
        return this.$store.state.printer.tempHistory?.source ?? []
    }

    get points(): SparklinePoint[] {
        if (!this.source.length) return []

        const end = this.source[this.source.length - 1].date.getTime()
        const samples = getTemperatureSamples(this.source, this.objectName, this.windowSeconds, end)

        return reduceSamples(samples, end - this.windowSeconds * MILLISECONDS, end)
    }

    get range(): SparklineRange {
        return getSparklineRange(
            this.points.map((point) => point.value),
            this.target
        )
    }

    get sparkline(): { line: string; area: string } {
        return buildSparkline(this.points, this.range, this.width, this.height)
    }

    get targetY(): number | null {
        if (this.target === null || this.target <= 0) return null

        return getSparklineY(this.target, this.range, this.height)
    }
}
</script>

<style scoped>
/* out of the flow, so the card decides the height and not the proportions of the viewBox */
.temperature-sparkline {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.temperature-sparkline__line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
}

.temperature-sparkline__target {
    stroke-width: 1;
    stroke-dasharray: 3 3;
    stroke-opacity: 0.6;
    vector-effect: non-scaling-stroke;
}
</style>
