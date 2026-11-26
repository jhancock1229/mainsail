export type ThemeMode = 'dark' | 'light' | 'auto'

export const systemPrefersDarkQuery = '(prefers-color-scheme: dark)'

export const resolveDarkMode = (mode: string | undefined, systemPrefersDark: boolean): boolean => {
    if (mode === 'auto') return systemPrefersDark

    return mode !== 'light'
}

export const toggledThemeMode = (mode: string | undefined, systemPrefersDark: boolean): 'dark' | 'light' => {
    return resolveDarkMode(mode, systemPrefersDark) ? 'light' : 'dark'
}
