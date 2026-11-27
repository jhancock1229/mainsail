<template>
    <v-card v-if="isVisible" class="panel print-hero-panel mb-3 mb-md-6" :class="'print-hero-panel--' + stateName">
        <div class="print-hero__stage" :class="'print-hero__stage--' + backdrop">
            <div class="print-hero__backdrop">
                <!-- not page="dashboard": that ties the stream to the expand state of the webcam panel -->
                <webcam-wrapper-item
                    v-if="backdrop === 'webcam' && webcam"
                    :webcam="webcam"
                    :show-fps="false"
                    page="print-hero" />
                <template v-else-if="backdrop === 'thumbnail'">
                    <img class="print-hero__thumbnail-glow" :src="thumbnailUrl" alt="" aria-hidden="true" />
                    <img class="print-hero__thumbnail" :src="thumbnailUrl" :alt="filename" draggable="false" />
                </template>
            </div>
            <div class="print-hero__scrim" />
            <div class="print-hero__content">
                <div class="print-hero__top">
                    <div class="print-hero__title">
                        <span class="print-hero__state">
                            <span class="print-hero__state-dot" />
                            {{ stateLabel }}
                        </span>
                        <span class="print-hero__filename text-truncate">{{ filename }}</span>
                    </div>
                    <div class="print-hero__actions">
                        <v-tooltip v-for="button in buttons" :key="button.loadingName" bottom>
                            <template #activator="{ on, attrs }">
                                <v-btn
                                    icon
                                    dark
                                    class="print-hero__action"
                                    :class="'print-hero__action--' + button.name"
                                    :aria-label="button.text"
                                    :loading="loadings.includes(button.loadingName)"
                                    v-bind="attrs"
                                    v-on="on"
                                    @click="button.click">
                                    <v-icon :color="button.color">{{ button.icon }}</v-icon>
                                </v-btn>
                            </template>
                            <span>{{ button.text }}</span>
                        </v-tooltip>
                        <print-hero-settings />
                    </div>
                </div>
                <div class="print-hero__bottom">
                    <div v-if="shows('progress')" class="print-hero__progress">
                        <div class="print-hero__progress-value" :style="{ width: percent + '%' }" />
                    </div>
                    <div v-if="showHeadline || tiles.length" class="print-hero__bar">
                        <div v-if="showHeadline" class="print-hero__headline">
                            <div v-if="shows('progress')" class="print-hero__percent">
                                {{ percent }}
                                <span class="print-hero__percent-sign">%</span>
                            </div>
                            <div class="print-hero__times">
                                <template v-if="isEnded">
                                    <div class="print-hero__time-primary">{{ endedLabel }}</div>
                                    <div v-if="message" class="print-hero__message">{{ message }}</div>
                                </template>
                                <template v-else>
                                    <div v-if="shows('remaining')" class="print-hero__time-primary">
                                        {{ $t('Panels.PrintHeroPanel.Remaining', { duration: remainingOutput }) }}
                                    </div>
                                    <div v-if="shows('eta')" class="print-hero__time-secondary">
                                        {{ $t('Panels.PrintHeroPanel.DoneAt', { time: eta }) }}
                                    </div>
                                </template>
                            </div>
                        </div>
                        <div v-if="tiles.length" class="print-hero__metrics">
                            <div
                                v-for="tile in tiles"
                                :key="tile.name"
                                class="print-hero__metric"
                                :class="'print-hero__metric--' + tile.name">
                                <div class="print-hero__metric-label">{{ tile.label }}</div>
                                <div class="print-hero__metric-value">{{ tile.value }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <print-hero-timeline v-if="settings.showTimeline" :timeline="timeline" :remaining="timelineRemaining" />
        <confirmation-dialog
            v-model="showCancelJobDialog"
            :icon="mdiStopCircleOutline"
            :title="$t('CancelJobDialog.CancelJob')"
            :text="$t('CancelJobDialog.AreYouSure')"
            :action-button-text="$t('Buttons.Yes')"
            :cancel-button-text="$t('Buttons.No')"
            @action="cancelJob" />
    </v-card>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import PrintHeroSettings from '@/components/panels/PrintHero/PrintHeroSettings.vue'
import PrintHeroTimeline from '@/components/panels/PrintHero/PrintHeroTimeline.vue'
import WebcamWrapperItem from '@/components/webcams/WebcamWrapperItem.vue'
import { mdiBroom, mdiPause, mdiPlay, mdiPrinter, mdiStop, mdiStopCircleOutline } from '@mdi/js'
import { capitalize, escapePath } from '@/plugins/helpers'
import { GuiWebcamStateWebcam } from '@/store/gui/webcams/types'
import {
    calcVolumetricFlow,
    formatFilamentLength,
    formatPrintHeroDuration,
    getPrintHeroThumbnailPath,
    getVisiblePrintHeroMetrics,
    isPrintEnded,
    isPrintHeroVisible,
    resolvePrintHeroBackdrop,
    resolvePrintHeroSettings,
    type PrintHeroBackdrop,
    type PrintHeroMetric,
    type PrintHeroSettings as Settings,
} from '@/plugins/printHero'
import { recordedPrintTimeline, type PrintTimeline } from '@/plugins/printTimeline'

const MS_PER_SECOND = 1000
const DEFAULT_FILAMENT_DIAMETER = 1.75
const headlineMetrics: PrintHeroMetric[] = ['progress', 'remaining', 'eta']

interface PrintHeroButton {
    name: string
    text: string
    color: string
    icon: string
    loadingName: string
    click: () => void
}

interface PrintHeroTile {
    name: PrintHeroMetric
    label: string
    value: string
}

@Component({
    components: { ConfirmationDialog, PrintHeroSettings, PrintHeroTimeline, WebcamWrapperItem },
})
export default class PrintHeroPanel extends Mixins(BaseMixin) {
    mdiStopCircleOutline = mdiStopCircleOutline

    showCancelJobDialog = false

    get settings(): Settings {
        return resolvePrintHeroSettings(this.$store.state.gui.view.printHero)
    }

    get filename(): string {
        return this.$store.state.printer.print_stats?.filename ?? ''
    }

    get isVisible(): boolean {
        return isPrintHeroVisible({
            klipperReady: this.klipperReadyForGui,
            printerState: this.printer_state,
            filename: this.filename,
        })
    }

    get isEnded(): boolean {
        return isPrintEnded(this.printer_state)
    }

    get printDuration(): number {
        return this.$store.state.printer.print_stats?.print_duration ?? 0
    }

    get totalDuration(): number {
        return this.$store.state.printer.print_stats?.total_duration ?? 0
    }

    get isWarmingUp(): boolean {
        return this.printer_state === 'printing' && this.printDuration <= 0
    }

    get stateName(): string {
        return this.isWarmingUp ? 'warmingUp' : this.printer_state
    }

    get stateLabel(): string {
        return this.$t(`Panels.PrintHeroPanel.States.${capitalize(this.stateName)}`).toString()
    }

    get message(): string {
        return this.$store.state.printer.print_stats?.message ?? ''
    }

    get endedLabel(): string {
        const duration = formatPrintHeroDuration(this.totalDuration)

        return this.$t(`Panels.PrintHeroPanel.Ended${capitalize(this.printer_state)}`, { duration }).toString()
    }

    get visibleMetrics(): PrintHeroMetric[] {
        return getVisiblePrintHeroMetrics(this.settings.metrics, this.printer_state)
    }

    get percent(): number {
        return Math.floor((this.$store.getters['printer/getPrintPercent'] ?? 0) * 100)
    }

    get eta(): string {
        return this.$store.getters['printer/getEstimatedTimeETAFormat'] ?? '--'
    }

    get remaining(): number {
        const eta = this.$store.getters['printer/getEstimatedTimeETA'] ?? 0
        if (eta <= 0) return 0

        return Math.max(0, (eta - Date.now()) / MS_PER_SECOND)
    }

    get remainingOutput(): string {
        return formatPrintHeroDuration(this.remaining)
    }

    get timelineRemaining(): number {
        if (this.isEnded) return 0
        if (this.remaining > 0) return this.remaining

        const slicerEstimate = Number(this.currentFile.estimated_time ?? 0)

        return Math.max(0, slicerEstimate - this.printDuration)
    }

    get currentFile(): Record<string, unknown> {
        return this.$store.state.printer.current_file ?? {}
    }

    get speed(): string {
        const liveVelocity = this.$store.state.printer.motion_report?.live_velocity ?? null
        if (liveVelocity !== null) return Math.abs(liveVelocity).toFixed(0)

        const gcodeMove = this.$store.state.printer.gcode_move ?? {}
        const requested = ((gcodeMove.speed ?? 0) / 60) * (gcodeMove.speed_factor ?? 0)
        const maxVelocity = this.$store.state.printer.toolhead?.max_velocity ?? requested

        return Math.min(requested, maxVelocity).toFixed(0)
    }

    get flow(): string {
        const diameter =
            this.$store.state.printer.configfile?.settings?.extruder?.filament_diameter ?? DEFAULT_FILAMENT_DIAMETER
        const velocity = this.$store.state.printer.motion_report?.live_extruder_velocity ?? null

        return calcVolumetricFlow(diameter, velocity).toFixed(1)
    }

    get layer(): string {
        const current = this.$store.getters['printer/getPrintCurrentLayer'] ?? 0
        const max = this.$store.getters['printer/getPrintMaxLayers'] ?? 0

        return `${current} / ${max}`
    }

    get tileValues(): Partial<Record<PrintHeroMetric, string>> {
        return {
            layer: this.layer,
            speed: `${this.speed} mm/s`,
            flow: `${this.flow} mm³/s`,
            filament: formatFilamentLength(this.$store.state.printer.print_stats?.filament_used ?? 0),
            elapsed: formatPrintHeroDuration(this.totalDuration),
        }
    }

    get showHeadline(): boolean {
        return this.isEnded || headlineMetrics.some((metric) => this.shows(metric))
    }

    get tiles(): PrintHeroTile[] {
        return this.visibleMetrics
            .filter((metric) => !headlineMetrics.includes(metric))
            .map((metric) => ({
                name: metric,
                label: this.$t(`Panels.PrintHeroPanel.Metrics.${capitalize(metric)}`).toString(),
                value: this.tileValues[metric] ?? '--',
            }))
    }

    get webcam(): GuiWebcamStateWebcam | null {
        const webcams: GuiWebcamStateWebcam[] = this.$store.getters['gui/webcams/getWebcams'] ?? []
        const selected = this.$store.state.gui.view.webcam?.currentCam?.dashboard ?? 'all'

        return webcams.find((webcam) => webcam.name === selected) ?? webcams[0] ?? null
    }

    get thumbnailUrl(): string {
        const path = getPrintHeroThumbnailPath(this.currentFile)
        if (path === null) return ''

        return `${this.apiUrl}/server/files/gcodes/${escapePath(path)}?timestamp=${this.currentFile.modified}`
    }

    get backdrop(): PrintHeroBackdrop {
        return resolvePrintHeroBackdrop(this.settings.backdrop, {
            webcam: this.webcam !== null,
            thumbnail: this.thumbnailUrl !== '',
        })
    }

    get timeline(): PrintTimeline | null {
        return recordedPrintTimeline.timeline
    }

    get canCancel(): boolean {
        if (this.$store.state.gui.uiSettings.displayCancelPrint) return this.printerIsPrinting

        return this.printer_state === 'paused'
    }

    get allButtons(): (PrintHeroButton & { visible: boolean })[] {
        return [
            {
                name: 'pause',
                text: this.$t('Panels.StatusPanel.PausePrint').toString(),
                color: 'warning',
                icon: mdiPause,
                loadingName: 'statusPrintPause',
                visible: this.printer_state === 'printing',
                click: this.pauseJob,
            },
            {
                name: 'resume',
                text: this.$t('Panels.StatusPanel.ResumePrint').toString(),
                color: 'success',
                icon: mdiPlay,
                loadingName: 'statusPrintResume',
                visible: this.printer_state === 'paused',
                click: this.resumeJob,
            },
            {
                name: 'cancel',
                text: this.$t('Panels.StatusPanel.CancelPrint').toString(),
                color: 'error',
                icon: mdiStop,
                loadingName: 'statusPrintCancel',
                visible: this.canCancel,
                click: this.askCancelJob,
            },
            {
                name: 'clear',
                text: this.$t('Panels.StatusPanel.ClearPrintStats').toString(),
                color: 'white',
                icon: mdiBroom,
                loadingName: 'statusPrintClear',
                visible: this.isEnded,
                click: this.clearJob,
            },
            {
                name: 'reprint',
                text: this.$t('Panels.StatusPanel.ReprintJob').toString(),
                color: 'white',
                icon: mdiPrinter,
                loadingName: 'statusPrintReprint',
                visible: this.isEnded,
                click: this.reprintJob,
            },
        ]
    }

    get buttons(): PrintHeroButton[] {
        return this.allButtons.filter((button) => button.visible)
    }

    shows(metric: PrintHeroMetric): boolean {
        return this.visibleMetrics.includes(metric)
    }

    pauseJob(): void {
        this.$socket.emit('printer.print.pause', {}, { loading: 'statusPrintPause' })
    }

    resumeJob(): void {
        this.$socket.emit('printer.print.resume', {}, { loading: 'statusPrintResume' })
    }

    askCancelJob(): void {
        if (this.$store.state.gui.uiSettings.confirmOnCancelJob) {
            this.showCancelJobDialog = true
            return
        }

        this.cancelJob()
    }

    cancelJob(): void {
        this.$socket.emit('printer.print.cancel', {}, { loading: 'statusPrintCancel' })
    }

    clearJob(): void {
        this.$socket.emit('printer.gcode.script', { script: 'SDCARD_RESET_FILE' }, { loading: 'statusPrintClear' })
    }

    reprintJob(): void {
        this.$socket.emit('printer.print.start', { filename: this.filename }, { loading: 'statusPrintReprint' })
    }
}
</script>

<style scoped>
.print-hero-panel {
    --print-hero-accent: var(--v-primary-base);
    container-type: inline-size;
    overflow: hidden;
}

.print-hero-panel--paused,
.print-hero-panel--warmingUp {
    --print-hero-accent: #ffa726;
}

.print-hero-panel--complete {
    --print-hero-accent: var(--v-success-base);
}

.print-hero-panel--error {
    --print-hero-accent: var(--v-error-base);
}

.print-hero-panel--cancelled {
    --print-hero-accent: #9e9e9e;
}

.print-hero__stage {
    position: relative;
    display: flex;
    flex-direction: column;
    /* not aspect-ratio: the stage has to grow with its content */
    min-height: clamp(300px, 62.5cqw, 480px);
    color: #fff;
    background: linear-gradient(135deg, #1d2530 0%, #0c0f13 100%);
}

.print-hero__stage--webcam {
    min-height: clamp(340px, 75cqw, 480px);
}

.print-hero__stage--none {
    min-height: 240px;
    background:
        radial-gradient(
            120% 150% at 0% 0%,
            color-mix(in srgb, var(--print-hero-accent) 55%, #10141a) 0%,
            transparent 62%
        ),
        linear-gradient(135deg, #1d2530 0%, #0c0f13 100%);
}

.print-hero__backdrop {
    position: absolute;
    inset: 0;
    overflow: hidden;
}

.print-hero__stage--webcam .print-hero__backdrop > div,
.print-hero__backdrop ::v-deep .webcamBackground {
    width: 100%;
    height: 100%;
    max-height: none;
}

.print-hero__backdrop ::v-deep .webcamImage,
.print-hero__backdrop ::v-deep video,
.print-hero__backdrop ::v-deep canvas,
.print-hero__backdrop ::v-deep iframe {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.print-hero__thumbnail-glow {
    position: absolute;
    top: -40px;
    left: -40px;
    width: calc(100% + 80px);
    height: calc(100% + 80px);
    object-fit: cover;
    filter: blur(36px) saturate(1.4);
    opacity: 0.55;
}

.print-hero__thumbnail {
    position: absolute;
    top: 8%;
    right: 4%;
    height: 62%;
    max-width: 55%;
    object-fit: contain;
    filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.5));
}

.print-hero__scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 28%);
    pointer-events: none;
}

.print-hero__content {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.print-hero__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 12px 0 16px;
}

.print-hero__title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    padding-top: 4px;
}

.print-hero__state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 3px 12px 3px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.print-hero__state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--print-hero-accent);
    box-shadow: 0 0 0 0 var(--print-hero-accent);
}

.print-hero-panel--printing .print-hero__state-dot,
.print-hero-panel--warmingUp .print-hero__state-dot {
    animation: print-hero-pulse 2s ease-out infinite;
}

@keyframes print-hero-pulse {
    from {
        box-shadow: 0 0 0 0 var(--print-hero-accent);
    }
    to {
        box-shadow: 0 0 0 8px transparent;
    }
}

.print-hero__filename {
    max-width: 100%;
    font-size: 0.875rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    opacity: 0.9;
}

.print-hero__actions {
    display: flex;
    flex: none;
    gap: 6px;
}

.print-hero__action {
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(6px);
}

.print-hero__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 20px;
    padding: 10px 16px 12px;
    background: rgba(10, 13, 17, 0.62);
    backdrop-filter: blur(14px);
}

.print-hero__headline {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
}

.print-hero__percent {
    display: flex;
    align-items: baseline;
    font-size: 3.25rem;
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.print-hero__percent-sign {
    margin-left: 0.1em;
    font-size: 1.5rem;
    font-weight: 400;
    opacity: 0.75;
}

.print-hero__times {
    min-width: 0;
    line-height: 1.35;
}

.print-hero__time-primary {
    font-size: 1.0625rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
}

.print-hero__time-secondary,
.print-hero__message {
    font-size: 0.8125rem;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
}

.print-hero__message {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.print-hero__progress {
    height: 3px;
    background: rgba(255, 255, 255, 0.18);
}

.print-hero__progress-value {
    height: 100%;
    background: var(--print-hero-accent);
    box-shadow: 0 0 10px var(--print-hero-accent);
    transition: width 0.5s linear;
}

.print-hero__metrics {
    display: grid;
    flex: 1 1 172px;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 4px 12px;
}

.print-hero__metric {
    min-width: 0;
}

.print-hero__metric-label {
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.65;
}

.print-hero__metric-value {
    font-size: 1rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

@container (max-width: 420px) {
    .print-hero__percent {
        font-size: 2.75rem;
    }

    .print-hero__metrics {
        flex-basis: 100%;
        grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    }
}

@media (prefers-reduced-motion: reduce) {
    .print-hero__state-dot {
        animation: none !important;
    }

    .print-hero__progress-value {
        transition: none;
    }
}
</style>
