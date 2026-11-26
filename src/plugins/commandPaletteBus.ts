import Vue from 'vue'

export interface PaletteSettingsTab {
    name: string
    title: string
    icon: string
}

// State shared between the command palette and the settings dialog. The settings dialog publishes its tabs
// here, so the palette lists exactly the tabs that exist (including conditional ones).
export const commandPaletteBus = Vue.observable({
    settingsTabs: [] as PaletteSettingsTab[],
    // true while the settings record a new shortcut, the palette must not open then
    recordingShortcut: false,
})

// EventBus event to open the settings dialog on a tab, payload: name of the tab
export const OPEN_SETTINGS_TAB = 'command-palette:open-settings-tab'
