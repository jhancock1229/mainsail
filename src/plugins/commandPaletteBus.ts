import Vue from 'vue'

export interface PaletteSettingsTab {
    name: string
    title: string
    icon: string
}

export const commandPaletteBus = Vue.observable({
    settingsTabs: [] as PaletteSettingsTab[],
    recordingShortcut: false,
    switchableShell: null as 'new' | 'classic' | null,
})

export const OPEN_SETTINGS_TAB = 'command-palette:open-settings-tab'
