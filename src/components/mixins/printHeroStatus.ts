import Component from 'vue-class-component'
import DashboardMixin from '@/components/mixins/dashboard'
import { shouldSimplifyStatusPanel } from '@/plugins/printHero'

@Component
export default class PrintHeroStatusMixin extends DashboardMixin {
    get simplifiedByPrintHero(): boolean {
        return shouldSimplifyStatusPanel({
            settings: this.$store.state.gui.view.printHero,
            heroInLayout: this.$store.getters['gui/getPrintHeroInLayout'](this.viewport, this.dashboardLayoutState),
            klipperReady: this.klipperReadyForGui,
            printerState: this.printer_state,
            filename: this.$store.state.printer.print_stats?.filename ?? '',
        })
    }
}
