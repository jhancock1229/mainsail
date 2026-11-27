import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import { uniqueLayoutName } from '@/plugins/layoutNames'
import { startShellHomeEdit } from '@/plugins/shellHomeEdit'
import {
    HomeArrangement,
    HomeBlockId,
    HomeLayout,
    HomeLayoutEntry,
    HomeLayoutState,
    HomeLayouts,
    MAX_HOME_LAYOUTS,
    WhileActionId,
    homeLayoutFilename,
    homeLayoutStateFor,
    parseHomeLayoutImport,
    resolveHomeLayouts,
    serializeHomeLayout,
} from '@/plugins/shellHomeLayout'

export interface HomeLayoutListItem {
    id: string
    name: string
    active: boolean
}

const whileActionLabels: Record<WhileActionId, string> = {
    nudge: 'Shell.Print.Nudge',
    speed: 'Shell.Print.SpeedAndFlow',
    filament: 'Shell.Print.ChangeFilament',
    queue: 'Shell.Print.QueueNext',
    temperatures: 'Shell.Home.Actions.temperatures',
    macros: 'Shell.Home.Actions.macros',
    limits: 'Shell.Home.Actions.limits',
    console: 'Shell.Home.Actions.console',
}

@Component
export default class ShellHomeLayoutsMixin extends Mixins(ShellMixin) {
    get homeLayoutStore(): HomeLayouts {
        return resolveHomeLayouts(this.$store.state.gui.shellHome)
    }

    get activeHomeEntry(): HomeLayoutEntry {
        const home = this.homeLayoutStore

        return home.layouts.find((entry) => entry.id === home.activeId) ?? home.layouts[0]
    }

    get activeHomeLayout(): HomeLayout {
        return this.activeHomeEntry.layout
    }

    get homeLayouts(): HomeLayoutListItem[] {
        return this.homeLayoutStore.layouts.map((entry) => ({
            id: entry.id,
            name: this.homeLayoutName(entry),
            active: entry.id === this.homeLayoutStore.activeId,
        }))
    }

    get activeHomeLayoutName(): string {
        return this.homeLayoutName(this.activeHomeEntry)
    }

    get canAddHomeLayout(): boolean {
        return this.homeLayouts.length < MAX_HOME_LAYOUTS
    }

    get currentHomeLayoutState(): HomeLayoutState {
        return homeLayoutStateFor(this.shellHomeState)
    }

    get showHomeLayoutMenu(): boolean {
        return this.$store.state.gui.shellHome?.showMenu ?? true
    }

    homeLayoutName(entry: HomeLayoutEntry): string {
        return entry.name || this.$t('Shell.Home.DefaultName').toString()
    }

    homeBlockLabel(id: HomeBlockId): string {
        return this.$t(`Shell.Home.Blocks.${id}`).toString()
    }

    whileActionLabel(id: WhileActionId): string {
        return this.$t(whileActionLabels[id]).toString()
    }

    async saveHomeChange(action: string, payload: unknown): Promise<void> {
        const result = await this.$store.dispatch(`gui/${action}`, payload)
        if (result === 'stale') this.$toast.info(this.$t('Dashboard.Layouts.ChangedElsewhere').toString())
    }

    saveHomeArrangement(state: HomeLayoutState, columns: HomeArrangement | null): void {
        if (columns !== null) this.saveHomeChange('saveHomeArrangement', { state, columns })
    }

    renameHomeLayout(payload: { id: string; name: string }): void {
        const otherNames = this.homeLayouts.filter((layout) => layout.id !== payload.id).map((layout) => layout.name)

        this.$store.dispatch('gui/renameHomeLayout', {
            id: payload.id,
            name: uniqueLayoutName(payload.name, otherNames),
        })
    }

    switchHomeLayout(id: string): void {
        this.$store.dispatch('gui/switchHomeLayout', id)
    }

    createHomeLayout(payload: {
        name: string
        layout?: HomeLayout
        sourceId?: string
        activate?: boolean
    }): Promise<string | null> {
        const name = uniqueLayoutName(
            payload.name,
            this.homeLayouts.map((layout) => layout.name)
        )

        return this.$store.dispatch('gui/createHomeLayout', { ...payload, name })
    }

    editHome(): void {
        startShellHomeEdit(this.currentHomeLayoutState)
        this.goTo('home')
    }

    exportHomeLayout(id: string): void {
        const entry = this.homeLayoutStore.layouts.find((layout) => layout.id === id)
        if (entry === undefined) return

        const name = this.homeLayoutName(entry)
        const blob = new Blob([serializeHomeLayout(name, entry.layout)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = homeLayoutFilename(name)
        link.click()
        URL.revokeObjectURL(url)
    }

    async importHomeLayout(file: File): Promise<boolean> {
        const result = parseHomeLayoutImport(await file.text())
        if (!result.ok) {
            const reason = this.$t(`Shell.Home.ImportErrors.${result.error}`, { detail: result.detail })
            this.$toast.error(this.$t('Dashboard.Layouts.ImportFailed', { reason }).toString())
            return false
        }

        const id = await this.createHomeLayout({ name: result.name, layout: result.layout })
        if (id === null) {
            this.$toast.error(this.$t('Dashboard.Layouts.TooMany', { max: MAX_HOME_LAYOUTS }).toString())
            return false
        }

        this.$toast.success(this.$t('Dashboard.Layouts.Imported', { name: result.name }).toString())
        return true
    }
}
