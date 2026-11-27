import {
    mdiBellOutline,
    mdiCodeTags,
    mdiCog,
    mdiConsoleLine,
    mdiDipSwitch,
    mdiFileDocumentEditOutline,
    mdiFire,
    mdiGestureTap,
    mdiGrid,
    mdiKeyboardOutline,
    mdiMenu,
    mdiMonitorDashboard,
    mdiPalette,
    mdiPrinter3d,
    mdiTimelapse,
    mdiTune,
    mdiVideo3d,
    mdiWebcam,
} from '@mdi/js'
import { PaletteSettingsTab } from '@/plugins/commandPaletteBus'
import { settingsTabNames } from '@/plugins/shellNavigation'

const tabs: Record<string, { icon: string; titleKey: string }> = {
    general: { icon: mdiCog, titleKey: 'Settings.GeneralTab.General' },
    'ui-settings': { icon: mdiPalette, titleKey: 'Settings.UiSettingsTab.UiSettings' },
    dashboard: { icon: mdiMonitorDashboard, titleKey: 'Settings.DashboardTab.Dashboard' },
    webcams: { icon: mdiWebcam, titleKey: 'Settings.WebcamsTab.Webcams' },
    macros: { icon: mdiCodeTags, titleKey: 'Settings.MacrosTab.Macros' },
    control: { icon: mdiTune, titleKey: 'Settings.ControlTab.Control' },
    console: { icon: mdiConsoleLine, titleKey: 'Settings.ConsoleTab.Console' },
    presets: { icon: mdiFire, titleKey: 'Settings.PresetsTab.PreheatPresets' },
    'remote-printers': { icon: mdiPrinter3d, titleKey: 'Settings.RemotePrintersTab.RemotePrinters' },
    'g-code-viewer': { icon: mdiVideo3d, titleKey: 'Settings.GCodeViewerTab.GCodeViewer' },
    editor: { icon: mdiFileDocumentEditOutline, titleKey: 'Settings.EditorTab.Editor' },
    miscellaneous: { icon: mdiDipSwitch, titleKey: 'Settings.MiscellaneousTab.Miscellaneous' },
    navigation: { icon: mdiMenu, titleKey: 'Settings.NavigationTab.Navigation' },
    heightmap: { icon: mdiGrid, titleKey: 'Settings.HeightmapTab.Heightmap' },
    notifications: { icon: mdiBellOutline, titleKey: 'Settings.NotificationsTab.Notifications' },
    'command-palette': { icon: mdiKeyboardOutline, titleKey: 'Settings.CommandPaletteTab.CommandPalette' },
    kiosk: { icon: mdiGestureTap, titleKey: 'Settings.KioskTab.Kiosk' },
    timelapse: { icon: mdiTimelapse, titleKey: 'Settings.TimelapseTab.Timelapse' },
}

export const buildShellSettingsTabs = (t: (key: string) => string): PaletteSettingsTab[] => {
    return settingsTabNames
        .map((name) => ({ name, icon: tabs[name]?.icon ?? mdiCog, title: t(tabs[name]?.titleKey ?? name) }))
        .sort((a, b) => {
            if (a.name === 'general') return -1
            if (b.name === 'general') return 1

            return a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        })
}
