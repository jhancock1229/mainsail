import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import NavigationMixin from '@/components/mixins/navigation'
import {
    buildPaletteCommands,
    collectGcodeFiles,
    formatShortcut,
    PaletteCommand,
    PaletteSettings,
    sanitizePaletteSettings,
    togglePinnedCommand,
} from '@/plugins/commandPalette'
import { resolveNamedLayouts } from '@/plugins/dashboardNamedLayouts'
import { resolveHomeLayouts } from '@/plugins/shellHomeLayout'
import { commandPaletteBus } from '@/plugins/commandPaletteBus'
import { validGcodeExtensions } from '@/store/variables'
import { PrinterStateMacro } from '@/store/printer/types'

@Component
export default class CommandPaletteMixin extends Mixins(NavigationMixin) {
    get paletteSettings(): PaletteSettings {
        return sanitizePaletteSettings(this.$store.state.gui.commandPalette)
    }

    get isMac(): boolean {
        return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    }

    get paletteShortcutKeys(): string[] {
        return this.paletteKeyLabels(this.paletteSettings.shortcut)
    }

    get paletteCommands(): PaletteCommand[] {
        const macros: PrinterStateMacro[] = this.$store.getters['printer/getMacros'] ?? []

        return buildPaletteCommands({
            socketConnected: this.socketIsConnected,
            klipperState: this.klipperState,
            printerState: this.printer_state,
            naviPoints: this.naviPoints.map((point) => ({ ...point, title: point.title.toString() })),
            macros: macros.map((macro) => ({ name: macro.name, description: macro.description })),
            hiddenMacros: this.$store.state.gui.macros?.hiddenMacros ?? [],
            files: collectGcodeFiles(this.$store.getters['files/getDirectory']('gcodes'), validGcodeExtensions),
            presets: this.$store.getters['gui/presets/getPresets'] ?? [],
            cooldownGcode: this.$store.getters['gui/presets/getCooldownGcode'],
            confirmOnCoolDown: this.$store.state.gui.uiSettings.confirmOnCoolDown ?? false,
            settingsTabs: commandPaletteBus.settingsTabs,
            dashboardLayouts: this.paletteShell === 'classic' ? this.paletteDashboardLayouts : [],
            homeLayouts: this.paletteShell === 'new' ? this.paletteHomeLayouts : [],
            interfaceShell: commandPaletteBus.switchableShell ?? undefined,
            t: (key, values) => this.$t(key, values).toString(),
        })
    }

    get paletteShell(): 'new' | 'classic' {
        return commandPaletteBus.switchableShell ?? 'classic'
    }

    get paletteHomeLayouts(): { id: string; name: string; active: boolean }[] {
        const home = resolveHomeLayouts(this.$store.state.gui.shellHome)

        return home.layouts.map((layout) => ({
            id: layout.id,
            name: layout.name || this.$t('Shell.Home.DefaultName').toString(),
            active: layout.id === home.activeId,
        }))
    }

    get paletteDashboardLayouts(): { id: string; name: string; active: boolean }[] {
        const named = resolveNamedLayouts(this.$store.state.gui.dashboard.namedLayouts)

        return named.layouts.map((layout) => ({
            id: layout.id,
            name: layout.name || this.$t('Dashboard.Layouts.DefaultName').toString(),
            active: layout.id === named.activeId,
        }))
    }

    paletteKeyLabels(shortcut: string): string[] {
        return formatShortcut(shortcut, this.isMac, (key) => this.$t(key).toString())
    }

    savePaletteSetting(name: keyof PaletteSettings, value: PaletteSettings[keyof PaletteSettings]): void {
        this.$store.dispatch('gui/saveSetting', { name: `commandPalette.${name}`, value })
    }

    togglePalettePin(id: string): void {
        this.savePaletteSetting('pinned', togglePinnedCommand(this.paletteSettings.pinned, id))
    }
}
