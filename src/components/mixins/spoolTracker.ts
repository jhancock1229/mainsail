import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { ServerHistoryStateJob } from '@/store/server/history/types'
import {
    DEFAULT_FILAMENT_DIAMETER,
    estimateSpool,
    materialDensity,
    resolveSpoolSource,
    resolveSpoolTrackerSettings,
    settleSpoolUsage,
    SpoolEstimate,
    SpoolJob,
    SpoolSource,
    SpoolTrackerSettings,
    SpoolUsage,
    spoolUsedLength,
} from '@/plugins/spoolTracker'

const HISTORY_INITIAL_JOBS = 100

@Component
export default class SpoolTrackerMixin extends Mixins(BaseMixin) {
    get spoolSettings(): SpoolTrackerSettings {
        return resolveSpoolTrackerSettings(this.$store.state.gui.spoolTracker)
    }

    get spoolSource(): SpoolSource {
        return resolveSpoolSource({ components: this.moonrakerComponents, trackerEnabled: this.spoolSettings.enabled })
    }

    get spoolJobs(): SpoolJob[] {
        const jobs: ServerHistoryStateJob[] = this.$store.state.server.history?.jobs ?? []

        return jobs.map((job) => ({ id: job.job_id, filamentUsed: job.filament_used, status: job.status }))
    }

    get spoolUsage(): SpoolUsage {
        const { usedLength, lastJobId, baselineLength } = this.spoolSettings
        const usage = { usedLength, lastJobId, baselineLength }
        if (this.spoolSettings.loadedAt === null) return usage

        const history = this.$store.state.server.history ?? {}
        const historyLoaded = (history.all_loaded ?? false) || this.spoolJobs.length >= HISTORY_INITIAL_JOBS

        return settleSpoolUsage(usage, this.spoolJobs, historyLoaded)
    }

    get spoolDiameter(): number {
        return this.$store.state.printer.configfile?.settings?.extruder?.filament_diameter ?? DEFAULT_FILAMENT_DIAMETER
    }

    get spoolDensity(): number {
        return materialDensity(this.spoolSettings.material)
    }

    get spoolEstimate(): SpoolEstimate {
        const active = this.printerIsPrinting ? (this.$store.state.printer.print_stats?.filament_used ?? 0) : null

        return estimateSpool({
            usedLength: spoolUsedLength(this.spoolUsage, active),
            sizeGrams: this.spoolSettings.sizeGrams,
            diameter: this.spoolDiameter,
            density: this.spoolDensity,
        })
    }
}
