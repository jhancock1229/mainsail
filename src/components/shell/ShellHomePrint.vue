<template>
    <div class="shell-home-print">
        <div class="sh-columns sh-columns--757" :class="{ 'sh-columns--ruled-bottom': active }">
            <section :aria-label="$t('Shell.Print.Title')" class="sh-col sh-col--gap-16 shell-job">
                <h2 class="sh-h2">{{ $t('Shell.Print.Title') }}</h2>
                <div class="shell-job__percent">
                    <span class="shell-job__percent-value">{{ printPercent }}</span>
                    <span class="shell-job__percent-sign">%</span>
                </div>
                <div class="sh-bar sh-bar--accent" :class="'shell-job__bar--' + shellHomeState">
                    <div :style="{ width: printPercent + '%' }" />
                </div>
                <div class="shell-job__facts">
                    <div v-for="fact in facts" :key="fact.name" :class="'shell-job__fact--' + fact.name">
                        <div class="shell-job__fact-label">{{ fact.label }}</div>
                        {{ fact.value }}
                    </div>
                </div>
                <div v-if="phaseSegments.length" class="shell-phases">
                    <div class="sh-row">
                        <h2 class="sh-h2">{{ $t('Shell.Print.Phases.Title') }}</h2>
                        <div v-if="startedAt" class="sh-small sh-muted">{{ startedAt }}</div>
                    </div>
                    <div class="shell-phases__bar" role="img" :aria-label="phaseSummary">
                        <div
                            v-for="(segment, index) in phaseSegments"
                            :key="index"
                            :class="'shell-phases__segment shell-phases__segment--' + segment.type"
                            :style="{ width: segment.percent + '%' }" />
                    </div>
                    <div class="shell-phases__legend">
                        <span v-for="entry in phaseLegend" :key="entry.type" :data-phase="entry.type">
                            <i :class="'shell-phases__dot shell-phases__segment--' + entry.type" />
                            {{ entry.label }}
                            <b>{{ entry.duration }}</b>
                        </span>
                    </div>
                </div>
                <div class="sh-spacer" />
                <div v-if="active && (canExclude || canPauseAtLayer)" class="shell-job__more">
                    <button v-if="canExclude" type="button" class="sh-link" @click="showExclude = true">
                        {{ $t('Shell.Print.ExcludeObject') }}
                    </button>
                    <button v-if="canPauseAtLayer" type="button" class="sh-link" @click="showPauseAtLayer = true">
                        {{ $t('Shell.Print.PauseAtLayer') }}
                    </button>
                </div>
                <div class="shell-job__actions">
                    <template v-if="active">
                        <button
                            v-if="shellHomeState === 'printing'"
                            type="button"
                            class="sh-btn sh-btn--strong shell-job__main shell-job__pause"
                            :disabled="loadings.includes('statusPrintPause')"
                            @click="pauseJob">
                            {{ $t('Shell.Print.Pause') }}
                        </button>
                        <button
                            v-else
                            type="button"
                            class="sh-btn sh-btn--strong shell-job__main shell-job__resume"
                            :disabled="loadings.includes('statusPrintResume')"
                            @click="resumeJob">
                            {{ $t('Shell.Print.Resume') }}
                        </button>
                        <button type="button" class="sh-btn shell-job__side shell-job__cancel" @click="askCancelJob">
                            {{ $t('Shell.Print.Cancel') }}
                        </button>
                    </template>
                    <template v-else>
                        <button
                            type="button"
                            class="sh-btn sh-btn--strong shell-job__main shell-job__reprint"
                            @click="reprintJob">
                            {{ $t('Shell.Print.PrintAgain') }}
                        </button>
                        <button type="button" class="sh-btn shell-job__side shell-job__clear" @click="clearJob">
                            {{ $t('Shell.Print.Done') }}
                        </button>
                    </template>
                </div>
            </section>

            <section :aria-label="viewLabel" class="sh-col shell-view">
                <div class="sh-row shell-view__head">
                    <h2 class="sh-h2">{{ viewLabel }}</h2>
                    <shell-tabs v-model="view" :tabs="views" :label="$t('Shell.Print.View')" small />
                </div>
                <shell-camera v-if="view === 'camera'" />
                <shell-console v-else />
            </section>

            <section :aria-label="$t('Shell.Heat.Title')" class="sh-col sh-col--gap-16">
                <shell-heat />
                <div class="sh-rule" />
                <shell-spool printing />
                <div v-if="showSpoolRule" class="sh-rule" />
                <shell-events />
            </section>
        </div>

        <footer v-if="active" :aria-label="$t('Shell.Print.While')" class="shell-while">
            <div class="shell-while__label">{{ $t('Shell.Print.While') }}</div>
            <button type="button" class="sh-btn sh-btn--56" data-action="nudge" @click="goTo('tune', 'move')">
                {{ $t('Shell.Print.Nudge') }}
            </button>
            <button type="button" class="sh-btn sh-btn--56" data-action="speed" @click="showSpeedAndFlow = true">
                {{ $t('Shell.Print.SpeedAndFlow') }}
            </button>
            <button type="button" class="sh-btn sh-btn--56" data-action="filament" @click="goTo('tune', 'extruder')">
                {{ $t('Shell.Print.ChangeFilament') }}
            </button>
            <button type="button" class="sh-btn sh-btn--56" data-action="queue" @click="goTo('print', 'files')">
                {{ $t('Shell.Print.QueueNext') }}
            </button>
        </footer>

        <div class="shell-home-print__hidden">
            <status-panel-exclude-object :show-dialog.sync="showExclude" />
        </div>
        <status-panel-pause-at-layer-dialog :show-dialog.sync="showPauseAtLayer" />
        <shell-speed-flow-dialog v-model="showSpeedAndFlow" />
        <confirmation-dialog
            v-model="showCancelJobDialog"
            :icon="mdiStopCircleOutline"
            :title="$t('CancelJobDialog.CancelJob')"
            :text="$t('CancelJobDialog.AreYouSure')"
            :action-button-text="$t('Buttons.Yes')"
            :cancel-button-text="$t('Buttons.No')"
            @action="cancelJob" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import { mdiStopCircleOutline } from '@mdi/js'
import ShellPrintMixin from '@/components/mixins/shellPrint'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ShellCamera from '@/components/shell/ShellCamera.vue'
import ShellConsole from '@/components/shell/ShellConsole.vue'
import ShellHeat from '@/components/shell/ShellHeat.vue'
import ShellSpool from '@/components/shell/ShellSpool.vue'
import ShellEvents from '@/components/shell/ShellEvents.vue'
import ShellSpeedFlowDialog from '@/components/shell/ShellSpeedFlowDialog.vue'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import StatusPanelExcludeObject from '@/components/panels/Status/ExcludeObject.vue'
import StatusPanelPauseAtLayerDialog from '@/components/panels/Status/PauseAtLayerDialog.vue'
import { PrinterStateMacro } from '@/store/printer/types'
import { resolveSpoolSource, resolveSpoolTrackerSettings } from '@/plugins/spoolTracker'
import { getPrintTimelinePhases, recordedPrintTimeline } from '@/plugins/printTimeline'
import { buildPhaseSegments, PhaseSegment } from '@/plugins/shellStatus'

interface JobFact {
    name: string
    label: string
    value: string
}

@Component({
    components: {
        ConfirmationDialog,
        ShellCamera,
        ShellConsole,
        ShellEvents,
        ShellHeat,
        ShellSpeedFlowDialog,
        ShellSpool,
        ShellTabs,
        StatusPanelExcludeObject,
        StatusPanelPauseAtLayerDialog,
    },
})
export default class ShellHomePrint extends Mixins(ShellPrintMixin) {
    mdiStopCircleOutline = mdiStopCircleOutline

    view = 'camera'
    showExclude = false
    showPauseAtLayer = false
    showSpeedAndFlow = false
    showCancelJobDialog = false

    get active(): boolean {
        return ['printing', 'paused'].includes(this.shellHomeState)
    }

    get views(): ShellTabItem[] {
        return ['camera', 'console'].map((id) => ({
            id,
            label: this.$t(`Shell.Print.Views.${id}`).toString(),
        }))
    }

    get viewLabel(): string {
        return this.$t(`Shell.Print.Views.${this.view}`).toString()
    }

    get facts(): JobFact[] {
        const fact = (name: string, value: string): JobFact => ({
            name,
            label: this.$t(`Shell.Print.Facts.${name}`).toString(),
            value,
        })

        return [
            this.active ? fact('timeLeft', this.printRemaining) : fact('took', this.printTotalDuration),
            fact('layer', this.printLayer),
            this.active ? fact('speed', this.printSpeed) : fact('result', this.resultText),
            fact('filament', this.printFilamentUsed),
        ]
    }

    get phaseSegments(): PhaseSegment[] {
        const phases = getPrintTimelinePhases(recordedPrintTimeline.timeline)

        return buildPhaseSegments(phases, this.active ? this.printRemainingSeconds : 0)
    }

    get phaseLegend(): { type: string; label: string; duration: string }[] {
        return ['warmup', 'printing', 'paused', 'remaining']
            .map((type) => ({
                type,
                seconds: this.phaseSegments
                    .filter((segment) => segment.type === type)
                    .reduce((sum, segment) => sum + segment.seconds, 0),
            }))
            .filter((entry) => entry.seconds > 0)
            .map((entry) => ({
                type: entry.type,
                label: this.$t(`Shell.Print.Phases.${entry.type}`).toString(),
                duration: this.formatDuration(entry.seconds),
            }))
    }

    get phaseSummary(): string {
        return this.phaseLegend.map((entry) => `${entry.label} ${entry.duration}`).join(', ')
    }

    get startedAt(): string {
        const started = recordedPrintTimeline.timeline?.startedAt ?? null
        if (started === null) return ''

        return this.$t('Shell.Print.Phases.Started', { time: this.formatTime(started) }).toString()
    }

    get resultText(): string {
        return this.$t(`Shell.Print.Results.${this.printer_state}`).toString()
    }

    get canExclude(): boolean {
        return (this.$store.state.printer.exclude_object?.objects ?? []).length > 0
    }

    get canPauseAtLayer(): boolean {
        const macros: PrinterStateMacro[] = this.$store.getters['printer/getMacros'] ?? []
        const names = macros.map((macro) => macro.name)

        return names.includes('SET_PAUSE_AT_LAYER') || names.includes('SET_PAUSE_NEXT_LAYER')
    }

    get showSpoolRule(): boolean {
        const settings = resolveSpoolTrackerSettings(this.$store.state.gui.spoolTracker)

        return resolveSpoolSource({ components: this.moonrakerComponents, trackerEnabled: settings.enabled }) !== 'none'
    }

    pauseJob(): void {
        this.$socket.emit('printer.print.pause', {}, { loading: 'statusPrintPause' })
    }

    resumeJob(): void {
        this.$socket.emit('printer.print.resume', {}, { loading: 'statusPrintResume' })
    }

    askCancelJob(): void {
        const stillPrinting = this.shellHomeState === 'printing'
        if (stillPrinting || this.$store.state.gui.uiSettings.confirmOnCancelJob) {
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
        this.$socket.emit('printer.print.start', { filename: this.printFilename }, { loading: 'statusPrintReprint' })
    }
}
</script>

<style scoped>
.shell-home-print {
    display: contents;
}

.shell-job__percent {
    display: flex;
    align-items: baseline;
    font-size: clamp(76px, 13vh, 148px);
    line-height: 1;
    font-weight: 500;
}

.shell-job__percent-sign {
    font-size: 0.37em;
    color: var(--shell-muted);
}

.shell-job__bar--paused > div {
    background: var(--shell-warn);
}

.shell-job__bar--finished > div {
    background: var(--shell-good);
}

.shell-job__facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 20px;
    font-size: 17px;
    line-height: 1.5;
}

.shell-job__fact-label {
    font-size: 13px;
    color: var(--shell-muted);
}

.shell-phases {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
}

.shell-phases__bar {
    display: flex;
    gap: 2px;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
}

.shell-phases__segment {
    min-width: 2px;
    transition: width 0.4s ease;
}

.shell-phases__segment--warmup {
    background: var(--shell-warn);
}

.shell-phases__segment--printing {
    background: var(--shell-accent);
}

.shell-phases__segment--paused {
    background: var(--shell-border);
}

.shell-phases__segment--remaining {
    background: var(--shell-track);
}

.shell-phases__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--shell-muted);
}

.shell-phases__legend b {
    font-weight: 500;
    color: var(--shell-text);
}

.shell-phases__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 4px;
}

.shell-job__more {
    display: flex;
    gap: 20px;
}

.shell-job__more .sh-link {
    padding: 4px 0;
}

.shell-job__actions {
    display: flex;
    gap: 10px;
}

.shell-job__main {
    flex: 2 1 0;
    font-size: 16px;
}

.shell-job__side {
    flex: 1 1 0;
}

.shell-view__head {
    align-items: center;
}

.shell-while {
    display: grid;
    grid-template-columns: auto repeat(4, minmax(0, 1fr));
    gap: 12px;
    align-items: center;
    padding: 16px 28px;
}

.shell-while__label {
    font-size: 13px;
    color: var(--shell-muted);
    padding-right: 8px;
}

.shell-home-print__hidden {
    display: none;
}
</style>
