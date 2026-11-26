import Vue from 'vue'

export interface PaletteSettingsTab {
    name: string
    title: string
    icon: string
}

export const commandPaletteBus = Vue.observable({
    settingsTabs: [] as PaletteSettingsTab[],
    recordingShortcut: false,
})

export const OPEN_SETTINGS_TAB = 'command-palette:open-settings-tab'
