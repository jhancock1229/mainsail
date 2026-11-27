import Component from 'vue-class-component'
import DashboardMixin from '@/components/mixins/dashboard'
import {
    DashboardColumns,
    DashboardLayoutSnapshot,
    MAX_NAMED_LAYOUTS,
    NamedLayouts,
    PanelDensity,
    captureSnapshot,
    getStoredSnapshot,
    isDashboardViewport,
    layoutExportFilename,
    nextPanelDensity,
    parseLayoutImport,
    resolveColumns,
    resolveNamedLayouts,
    resolvePanelDensity,
    serializeLayoutExport,
    uniqueLayoutName,
} from '@/plugins/dashboardNamedLayouts'
import { getDefaultSnapshot } from '@/store/gui/dashboardLayoutDefaults'

export interface DashboardLayoutListItem {
    id: string
    name: string
    active: boolean
}

@Component
export default class DashboardLayoutsMixin extends DashboardMixin {
    get namedLayouts(): NamedLayouts {
        return resolveNamedLayouts(this.$store.state.gui.dashboard.namedLayouts)
    }

    get dashboardLayouts(): DashboardLayoutListItem[] {
        return this.namedLayouts.layouts.map((layout) => ({
            id: layout.id,
            name: layout.name || this.$t('Dashboard.Layouts.DefaultName').toString(),
            active: layout.id === this.namedLayouts.activeId,
        }))
    }

    get activeDashboardLayout(): DashboardLayoutListItem {
        return this.dashboardLayouts.find((layout) => layout.active) ?? this.dashboardLayouts[0]
    }

    get canAddDashboardLayout(): boolean {
        return this.dashboardLayouts.length < MAX_NAMED_LAYOUTS
    }

    get showDashboardLayoutBar(): boolean {
        return this.$store.state.gui.dashboard.showLayoutBar ?? true
    }

    getDashboardColumns(viewport: string): DashboardColumns {
        if (!isDashboardViewport(viewport)) return { count: 1, widths: [] }

        return resolveColumns(viewport, this.$store.state.gui.dashboard.columns?.[viewport])
    }

    getSettingsColumnNumbers(viewport: string): number[] {
        return Array.from({ length: this.getDashboardColumns(viewport).count }, (_, index) => index + 1)
    }

    getSettingsColumnClass(viewport: string): string {
        return `col-12 col-md-${12 / this.getDashboardColumns(viewport).count}`
    }

    getPanelDensity(name: string): PanelDensity {
        return resolvePanelDensity(name, this.$store.state.gui.dashboard.panelDensity)
    }

    async editDashboardLayout(action: string, payload: unknown): Promise<void> {
        const applied = await this.$store.dispatch('gui/editDashboardLayout', { action, payload })
        if (!applied) this.$toast.info(this.$t('Dashboard.Layouts.ChangedElsewhere').toString())
    }

    renameDashboardLayout(payload: { id: string; name: string }): void {
        const otherNames = this.dashboardLayouts
            .filter((layout) => layout.id !== payload.id)
            .map((layout) => layout.name)

        this.$store.dispatch('gui/renameDashboardLayout', {
            id: payload.id,
            name: uniqueLayoutName(payload.name, otherNames),
        })
    }

    cyclePanelDensity(name: string): void {
        this.editDashboardLayout('setDashboardPanelDensity', {
            name,
            density: nextPanelDensity(name, this.getPanelDensity(name)),
        })
    }

    // the first layout has no stored name, so the store cannot tell that its displayed name is taken
    createDashboardLayout(payload: {
        name: string
        snapshot?: DashboardLayoutSnapshot
        sourceId?: string
        activate?: boolean
    }): Promise<string | null> {
        const name = uniqueLayoutName(
            payload.name,
            this.dashboardLayouts.map((layout) => layout.name)
        )

        return this.$store.dispatch('gui/createDashboardLayout', { ...payload, name })
    }

    switchDashboardLayout(id: string): void {
        this.$store.dispatch('gui/switchDashboardLayout', id)
    }

    exportDashboardLayout(layout: DashboardLayoutListItem): void {
        const fallback = getDefaultSnapshot()
        const dashboard = this.$store.state.gui.dashboard
        const snapshot = layout.active
            ? captureSnapshot(dashboard, fallback)
            : getStoredSnapshot(dashboard.namedLayouts, layout.id, fallback)
        const blob = new Blob([serializeLayoutExport(layout.name, snapshot)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = layoutExportFilename(layout.name)
        link.click()
        URL.revokeObjectURL(url)
    }

    async importDashboardLayout(file: File): Promise<boolean> {
        const result = parseLayoutImport(await file.text(), getDefaultSnapshot())
        if (!result.ok) {
            const reason = this.$t(`Dashboard.Layouts.ImportErrors.${result.error}`, { detail: result.detail })
            this.$toast.error(this.$t('Dashboard.Layouts.ImportFailed', { reason }).toString())
            return false
        }

        const id = await this.createDashboardLayout({ name: result.name, snapshot: result.snapshot })
        if (id === null) {
            this.$toast.error(this.$t('Dashboard.Layouts.TooMany', { max: MAX_NAMED_LAYOUTS }).toString())
            return false
        }

        this.$toast.success(this.$t('Dashboard.Layouts.Imported', { name: result.name }).toString())
        return true
    }
}
