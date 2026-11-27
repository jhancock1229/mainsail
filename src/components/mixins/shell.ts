import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    offeredShellTabs,
    resolveShellLayout,
    resolveShellLocation,
    ShellAvailability,
    ShellLocation,
    ShellPageId,
    shellPath,
    ShellTab,
} from '@/plugins/shellNavigation'
import {
    formatShellDuration,
    formatShellTemperature,
    resolveShellHeadline,
    resolveShellHomeState,
    ShellHomeState,
} from '@/plugins/shellStatus'
import { hiddenShellTabs, KioskSettings } from '@/plugins/kiosk'
import { kioskModeFor } from '@/plugins/kioskSession'

@Component
export default class ShellMixin extends Mixins(BaseMixin) {
    get shellLocation(): ShellLocation {
        return resolveShellLocation(this.$route.path, this.shellAvailability)
    }

    get shellAvailability(): ShellAvailability {
        return {
            moonrakerComponents: this.$store.state.server.components ?? [],
            klipperObjects: Object.keys(this.$store.state.printer.configfile?.settings ?? {}),
            registeredDirectories: this.$store.state.server.registered_directories ?? [],
            farm: this.$store.getters['farm/countPrinters'] > 0,
            printerObjects: Object.keys(this.$store.state.printer ?? {}),
            hidden: this.shellTouchMode ? hiddenShellTabs(this.shellKioskSettings) : [],
        }
    }

    get shellKioskSettings(): KioskSettings {
        return this.$store.getters['gui/getKioskSettings']
    }

    get shellTouchMode(): boolean {
        return kioskModeFor(this.shellKioskSettings).active
    }

    get shellCompact(): boolean {
        const layout = resolveShellLayout({ width: this.$vuetify.breakpoint.width, touchMode: this.shellTouchMode })

        return layout === 'compact'
    }

    get printFilename(): string {
        return this.$store.state.printer.print_stats?.filename ?? ''
    }

    get printPercent(): number {
        return Math.floor((this.$store.getters['printer/getPrintPercent'] ?? 0) * 100)
    }

    get printIsWarmingUp(): boolean {
        return this.printer_state === 'printing' && (this.$store.state.printer.print_stats?.print_duration ?? 0) <= 0
    }

    get shellHomeState(): ShellHomeState {
        return resolveShellHomeState({
            klipperState: this.klipperState,
            printerState: this.printer_state,
            filename: this.printFilename,
        })
    }

    get shellHeadline(): string {
        const headline = resolveShellHeadline({
            klipperState: this.klipperState,
            printerState: this.printer_state,
            filename: this.printFilename,
            percent: this.printPercent,
            warmingUp: this.printIsWarmingUp,
        })

        return this.$t(`Shell.Headlines.${headline.key}`, headline.params).toString()
    }

    get nozzleTemperature(): string {
        const extruder = this.$store.state.printer.toolhead?.extruder ?? 'extruder'

        return formatShellTemperature(this.$store.state.printer[extruder]?.temperature)
    }

    get bedTemperature(): string | null {
        const bed = this.$store.state.printer.heater_bed
        if (bed === undefined) return null

        return formatShellTemperature(bed.temperature)
    }

    get allAxesHomed(): boolean {
        const homed: string = this.$store.state.printer.toolhead?.homed_axes ?? ''

        return ['x', 'y', 'z'].every((axis) => homed.includes(axis))
    }

    get shellTemperatureParts(): string[] {
        if (this.klipperState !== 'ready') return []

        const parts = [this.$t('Shell.Status.Nozzle', { temperature: this.nozzleTemperature }).toString()]
        if (this.bedTemperature !== null) {
            parts.push(this.$t('Shell.Status.Bed', { temperature: this.bedTemperature }).toString())
        }

        return parts
    }

    get shellStatusLine(): string {
        const state = this.klipperState === 'ready' ? this.shellHomeState : 'offline'
        const parts = [this.$t(`Shell.States.${state}`).toString()]
        if (this.klipperState === 'ready') {
            parts.push(this.$t(this.allAxesHomed ? 'Shell.Status.Homed' : 'Shell.Status.NotHomed').toString())
        }

        return [...parts, ...this.shellTemperatureParts].join(' · ')
    }

    availableShellTabs(page: ShellPageId): ShellTab[] {
        return offeredShellTabs(page, this.shellAvailability)
    }

    goTo(page: ShellPageId, tab: string | null = null): void {
        const path = shellPath(page, tab)
        if (this.$route.path !== path) this.$router.push(path)
    }

    formatDuration(seconds: number): string {
        return formatShellDuration(seconds, (key, values) => this.$t(key, values).toString())
    }

    sendGcode(script: string, loading?: string): void {
        this.$store.dispatch('server/addEvent', { message: script, type: 'command' })
        this.$socket.emit('printer.gcode.script', { script }, loading === undefined ? {} : { loading })
    }
}
