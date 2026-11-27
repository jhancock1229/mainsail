<template>
    <div class="sh-page sh-page--tabs shell-tune" :data-tab="tab">
        <shell-header :title="$t('Shell.Pages.tune')" :status="shellStatusLine" tabs />
        <shell-tabs
            class="sh-page__tabs"
            :tabs="tabs"
            :value="tab"
            :label="$t('Shell.Pages.tune')"
            @input="goTo('tune', $event)" />

        <shell-tune-move v-if="tab === 'move'" />

        <div v-else-if="!klipperReadyForGui" class="sh-columns sh-columns--1">
            <section class="sh-col">
                <h2 class="sh-h2">{{ $t('Shell.Tune.NotReadyTitle') }}</h2>
                <p class="sh-note">{{ $t('Shell.Tune.NotReady') }}</p>
                <router-link to="/fix/status" class="sh-link">{{ $t('Shell.Pages.fix') }}</router-link>
            </section>
        </div>

        <div
            v-else-if="tab === 'extruder'"
            class="sh-columns"
            :class="filamentSystem ? 'sh-columns--2' : 'sh-columns--1'">
            <div data-section="extruder" class="sh-host shell-tune__extruder">
                <extruder-control-panel />
            </div>
            <div v-if="filamentSystem" data-section="filament" class="sh-host">
                <spoolman-panel v-if="hasSpoolman" />
                <afc-panel v-if="hasAfc" />
                <mmu-panel v-if="hasMmu" />
            </div>
        </div>

        <div v-else-if="tab === 'bed-level'" class="sh-columns" :class="hasBedMesh ? 'sh-columns--2' : 'sh-columns--1'">
            <div v-if="hasBedMesh" data-section="mesh" class="sh-host">
                <heightmap-chart-panel />
            </div>
            <div data-section="level" class="sh-host shell-tune__bed">
                <div v-if="levelTools.length" class="shell-tune__tools">
                    <h2 class="sh-h2">{{ $t('Shell.Tune.LevelTools') }}</h2>
                    <button
                        v-for="tool in levelTools"
                        :key="tool.gcode"
                        type="button"
                        class="sh-btn sh-btn--left"
                        :disabled="printerIsPrinting"
                        @click="sendGcode(tool.gcode)">
                        {{ tool.label }}
                    </button>
                </div>
                <p v-if="!hasBedMesh && !levelTools.length" class="sh-note">{{ $t('Shell.Tune.NoBedLevel') }}</p>
                <template v-if="hasBedMesh">
                    <heightmap-current-profile-panel />
                    <heightmap-profiles-panel />
                </template>
            </div>
        </div>

        <div v-else-if="tab === 'heater-tuning'" class="sh-columns sh-columns--2">
            <div data-section="heaters" class="sh-host">
                <temperature-panel />
            </div>
            <section :aria-label="$t('Shell.Tune.Pid.Title')" data-section="pid" class="sh-col sh-col--scroll">
                <h2 class="sh-h2">{{ $t('Shell.Tune.Pid.Title') }}</h2>
                <p class="sh-note">{{ $t('Shell.Tune.Pid.Help') }}</p>
                <template v-if="canPid">
                    <div v-for="heater in pidHeaters" :key="heater.name" class="shell-tune__pid">
                        <div class="sh-field-row">
                            <div class="text-truncate">{{ heater.label }}</div>
                            <input
                                type="number"
                                class="sh-input"
                                min="1"
                                :max="heater.max"
                                :value="heater.value"
                                :aria-invalid="heater.target === null ? 'true' : 'false'"
                                :aria-label="$t('Shell.Tune.Pid.Target', { heater: heater.label })"
                                @input="setPidInput(heater.name, $event.target.value)" />
                            <button
                                type="button"
                                class="sh-btn sh-btn--44"
                                :data-heater="heater.name"
                                :disabled="printerIsPrinting || heater.target === null"
                                @click="pidCalibrate(heater)">
                                {{ $t('Shell.Tune.Pid.Start') }}
                            </button>
                        </div>
                        <div v-if="heater.target === null" class="shell-tune__pid-error" role="alert">
                            {{ $t('Shell.Tune.Pid.Invalid', { max: heater.max }) }}
                        </div>
                    </div>
                    <p class="sh-note sh-muted">{{ $t('Shell.Tune.Pid.After') }}</p>
                </template>
                <p v-else class="sh-note sh-muted">{{ $t('Shell.Tune.Pid.Unavailable') }}</p>
            </section>
        </div>

        <div v-else-if="tab === 'resonance'" class="sh-columns sh-columns--2">
            <section
                :aria-label="$t('Shell.Tune.Resonance.Title')"
                data-section="resonance"
                class="sh-col sh-col--scroll">
                <h2 class="sh-h2">{{ $t('Shell.Tune.Resonance.Title') }}</h2>
                <div v-if="shaper.length" class="shell-tune__shaper">
                    <div v-for="axis in shaper" :key="axis.axis">
                        <div class="sh-small sh-muted">{{ axis.axis }}</div>
                        <div class="sh-big">{{ axis.frequency }}</div>
                        <div class="sh-small sh-muted">{{ axis.type }}</div>
                    </div>
                </div>
                <p v-else class="sh-note">{{ $t('Shell.Tune.Resonance.NotConfigured') }}</p>
                <template v-if="resonanceTools.length">
                    <button
                        v-for="tool in resonanceTools"
                        :key="tool.gcode"
                        type="button"
                        class="sh-btn sh-btn--left"
                        :disabled="printerIsPrinting"
                        @click="sendGcode(tool.gcode)">
                        {{ tool.label }}
                    </button>
                </template>
                <p v-else class="sh-note sh-muted">{{ $t('Shell.Tune.Resonance.NoSensor') }}</p>
            </section>
            <section data-section="resonance-help" class="sh-col">
                <h2 class="sh-h2">{{ $t('Shell.Tune.Resonance.AboutTitle') }}</h2>
                <p class="sh-note">{{ $t('Shell.Tune.Resonance.About') }}</p>
                <p class="sh-note sh-muted">{{ $t('Shell.Tune.Resonance.Results') }}</p>
                <router-link to="/fix/console" class="sh-link">
                    {{ $t('Shell.Tune.Resonance.OpenConsole') }}
                </router-link>
            </section>
        </div>

        <div v-else-if="tab === 'limits'" class="sh-columns sh-columns--2">
            <div data-section="limits" class="sh-host">
                <machine-settings-panel />
            </div>
            <section
                :aria-label="$t('Panels.ToolheadControlPanel.SpeedFactor')"
                data-section="speed"
                class="sh-col shell-tune__speed">
                <h2 class="sh-h2">{{ $t('Shell.Tune.SpeedTitle') }}</h2>
                <p class="sh-note">{{ $t('Shell.Tune.SpeedHelp') }}</p>
                <tool-slider
                    :label="$t('Panels.ToolheadControlPanel.SpeedFactor')"
                    :icon="mdiSpeedometer"
                    :target="speedFactor"
                    :min="1"
                    :max="200"
                    :multi="100"
                    :step="5"
                    :dynamic-range="true"
                    :has-input-field="true"
                    command="M220"
                    attribute-name="S" />
            </section>
        </div>

        <div v-else class="sh-columns sh-columns--1">
            <div data-section="macros" class="sh-host shell-tune__macros">
                <macros-panel />
                <macrogroup-panel v-for="group in macrogroups" :key="group.id" :panel-id="group.id" />
                <p v-if="!hasMacros" class="sh-note">{{ $t('Shell.Tune.NoMacros') }}</p>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import { mdiSpeedometer } from '@mdi/js'
import ShellMixin from '@/components/mixins/shell'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ShellTuneMove from '@/components/shell/ShellTuneMove.vue'
import AfcPanel from '@/components/panels/AfcPanel.vue'
import ExtruderControlPanel from '@/components/panels/ExtruderControlPanel.vue'
import MachineSettingsPanel from '@/components/panels/MachineSettingsPanel.vue'
import MacrogroupPanel from '@/components/panels/MacrogroupPanel.vue'
import MacrosPanel from '@/components/panels/MacrosPanel.vue'
import MmuPanel from '@/components/panels/MmuPanel.vue'
import SpoolmanPanel from '@/components/panels/SpoolmanPanel.vue'
import TemperaturePanel from '@/components/panels/TemperaturePanel.vue'
import HeightmapCurrentProfilePanel from '@/components/panels/Heightmap/HeightmapCurrentProfilePanel.vue'
import HeightmapProfilesPanel from '@/components/panels/Heightmap/HeightmapProfilesPanel.vue'
import ToolSlider from '@/components/inputs/ToolSlider.vue'
import { resolvePidTarget } from '@/plugins/shellStatus'

interface GcodeTool {
    gcode: string
    label: string
}

const DEFAULT_PID_TARGETS: Record<string, number> = { heater_bed: 60 }
const DEFAULT_PID_TARGET = 210
const DEFAULT_MAX_TEMPERATURE = 300

interface PidHeater {
    name: string
    label: string
    max: number
    value: string
    target: number | null
}

@Component({
    components: {
        AfcPanel,
        ExtruderControlPanel,
        HeightmapChartPanel: () => import('@/components/panels/Heightmap/HeightmapChartPanel.vue'),
        HeightmapCurrentProfilePanel,
        HeightmapProfilesPanel,
        MachineSettingsPanel,
        MacrogroupPanel,
        MacrosPanel,
        MmuPanel,
        ShellHeader,
        ShellTabs,
        ShellTuneMove,
        SpoolmanPanel,
        TemperaturePanel,
        ToolSlider,
    },
})
export default class ShellTunePage extends Mixins(ShellMixin) {
    @Prop({ type: String, default: 'move' }) declare readonly tab: string

    mdiSpeedometer = mdiSpeedometer
    pidInputs: Record<string, string> = {}

    get tabs(): ShellTabItem[] {
        return this.availableShellTabs('tune').map((tab) => ({
            id: tab.id,
            label: this.$t(`Shell.Tabs.tune.${tab.id}`).toString(),
        }))
    }

    get commands(): Record<string, unknown> {
        return this.$store.state.printer.gcode?.commands ?? {}
    }

    get settings(): Record<string, Record<string, unknown>> {
        return this.$store.state.printer.configfile?.settings ?? {}
    }

    get hasSpoolman(): boolean {
        return this.moonrakerComponents.includes('spoolman')
    }

    get hasAfc(): boolean {
        return 'AFC' in this.$store.state.printer
    }

    get hasMmu(): boolean {
        return 'mmu' in this.$store.state.printer
    }

    get filamentSystem(): boolean {
        return this.hasSpoolman || this.hasAfc || this.hasMmu
    }

    get hasBedMesh(): boolean {
        return 'bed_mesh' in this.settings
    }

    get levelTools(): GcodeTool[] {
        const tools: [string, string][] = [
            ['QUAD_GANTRY_LEVEL', 'Qgl'],
            ['Z_TILT_ADJUST', 'ZTilt'],
            ['BED_TILT_CALIBRATE', 'BedTilt'],
            ['BED_SCREWS_ADJUST', 'BedScrews'],
            ['SCREWS_TILT_CALCULATE', 'ScrewsTilt'],
            ['DELTA_CALIBRATE', 'Delta'],
        ]

        return tools
            .filter(([gcode]) => gcode in this.commands)
            .map(([gcode, key]) => ({ gcode, label: this.$t(`Shell.Tune.Level.${key}`).toString() }))
    }

    get canPid(): boolean {
        return 'PID_CALIBRATE' in this.commands
    }

    get pidHeaters(): PidHeater[] {
        const heaters: string[] = this.$store.state.printer.heaters?.available_heaters ?? []

        return heaters.map((name) => {
            const max = Number(this.settings[name.toLowerCase()]?.max_temp ?? DEFAULT_MAX_TEMPERATURE)
            const value = this.pidInputs[name] ?? String(DEFAULT_PID_TARGETS[name] ?? DEFAULT_PID_TARGET)

            return { name, label: this.heaterLabel(name), max, value, target: resolvePidTarget(value, max) }
        })
    }

    get shaper(): { axis: string; frequency: string; type: string }[] {
        const config = this.settings.input_shaper
        if (config === undefined) return []

        return ['x', 'y'].map((axis) => ({
            axis: axis.toUpperCase(),
            frequency: `${Number(config[`shaper_freq_${axis}`] ?? 0).toFixed(1)} Hz`,
            type: String(config[`shaper_type_${axis}`] ?? config.shaper_type ?? 'mzv').toUpperCase(),
        }))
    }

    get resonanceTools(): GcodeTool[] {
        const tools: [string, string, string][] = [
            ['SHAPER_CALIBRATE', 'SHAPER_CALIBRATE AXIS=X', 'TuneX'],
            ['SHAPER_CALIBRATE', 'SHAPER_CALIBRATE AXIS=Y', 'TuneY'],
            ['MEASURE_AXES_NOISE', 'MEASURE_AXES_NOISE', 'Noise'],
            ['ACCELEROMETER_QUERY', 'ACCELEROMETER_QUERY', 'Query'],
        ]

        return tools
            .filter(([command]) => command in this.commands)
            .map(([, gcode, key]) => ({ gcode, label: this.$t(`Shell.Tune.Resonance.${key}`).toString() }))
    }

    get speedFactor(): number {
        return this.$store.state.printer?.gcode_move?.speed_factor ?? 1
    }

    get macrogroups(): { id: string }[] {
        return this.$store.getters['gui/macros/getAllMacrogroups'] ?? []
    }

    get hasMacros(): boolean {
        return (this.$store.getters['printer/getMacros'] ?? []).length > 0
    }

    setPidInput(name: string, value: string): void {
        this.pidInputs = { ...this.pidInputs, [name]: value }
    }

    heaterLabel(name: string): string {
        if (name === 'heater_bed') return this.$t('Shell.Heat.Bed').toString()
        if (name === 'extruder') return this.$t('Shell.Heat.Nozzle').toString()

        const words = (name.split(' ').pop() ?? name).replace(/_/g, ' ')

        return words.charAt(0).toUpperCase() + words.slice(1)
    }

    pidCalibrate(heater: PidHeater): void {
        if (heater.target === null) return

        this.sendGcode(`PID_CALIBRATE HEATER=${heater.name.split(' ').pop()} TARGET=${heater.target}`)
        this.$toast.info(this.$t('Shell.Tune.Pid.Started').toString())
    }
}
</script>

<style scoped>
.shell-tune__tools {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
}

.shell-tune__pid {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.shell-tune__pid-error {
    font-size: 13px;
    color: var(--shell-danger);
}

.shell-tune__shaper {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.shell-tune__macros {
    column-width: 420px;
    column-gap: 16px;
}

.shell-tune__macros ::v-deep .panel {
    break-inside: avoid;
}
</style>
