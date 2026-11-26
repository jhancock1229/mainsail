import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import { formatFilamentMeters, formatShellDuration } from '@/plugins/shellStatus'

const MS_PER_SECOND = 1000

@Component
export default class ShellPrintMixin extends Mixins(ShellMixin) {
    get printStats(): Record<string, number | string | undefined> {
        return this.$store.state.printer.print_stats ?? {}
    }

    get printEta(): string {
        return this.$store.getters['printer/getEstimatedTimeETAFormat'] ?? '--'
    }

    get printRemainingSeconds(): number {
        const eta = this.$store.getters['printer/getEstimatedTimeETA'] ?? 0
        if (eta > 0) return Math.max(0, (eta - Date.now()) / MS_PER_SECOND)

        const estimate = Number(this.$store.state.printer.current_file?.estimated_time ?? 0)

        return Math.max(0, estimate - Number(this.printStats.print_duration ?? 0))
    }

    get printRemaining(): string {
        return formatShellDuration(this.printRemainingSeconds)
    }

    get printTotalDuration(): string {
        return formatShellDuration(Number(this.printStats.total_duration ?? 0))
    }

    get printLayer(): string {
        const current = this.$store.getters['printer/getPrintCurrentLayer'] ?? 0
        const max = this.$store.getters['printer/getPrintMaxLayers'] ?? 0

        return `${current} / ${max}`
    }

    get printSpeed(): string {
        const liveVelocity = this.$store.state.printer.motion_report?.live_velocity ?? null
        if (liveVelocity !== null) return `${Math.abs(liveVelocity).toFixed(0)} mm/s`

        const gcodeMove = this.$store.state.printer.gcode_move ?? {}
        const requested = ((gcodeMove.speed ?? 0) / 60) * (gcodeMove.speed_factor ?? 0)
        const maxVelocity = this.$store.state.printer.toolhead?.max_velocity ?? requested

        return `${Math.min(requested, maxVelocity).toFixed(0)} mm/s`
    }

    get printFilamentUsed(): string {
        return formatFilamentMeters(Number(this.printStats.filament_used ?? 0))
    }

    get printShortFilename(): string {
        return this.printFilename.slice(this.printFilename.lastIndexOf('/') + 1)
    }
}
