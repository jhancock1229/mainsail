export type ThemeMode = 'dark' | 'light' | 'auto'

export const systemPrefersDarkQuery = '(prefers-color-scheme: dark)'

// auto follows the system; anything else but light is dark
export const resolveDarkMode = (mode: string | undefined, systemPrefersDark: boolean): boolean => {
    if (mode === 'auto') return systemPrefersDark

    return mode !== 'light'
}

// the explicit mode to store when the user flips what is currently shown
export const toggledThemeMode = (mode: string | undefined, systemPrefersDark: boolean): 'dark' | 'light' => {
    return resolveDarkMode(mode, systemPrefersDark) ? 'light' : 'dark'
}
