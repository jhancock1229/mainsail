import {
    contrastRatio,
    hexToHsl,
    hslToHex,
    isAccentColor,
    isOneOf,
    isRecord,
    isValidThemeToken,
    ThemeChartPalette,
    ThemeDensity,
    ThemeFont,
    themeFonts,
} from '@/plugins/themeTokens'

export const shellTones = ['slate', 'graphite', 'ink', 'pine', 'plum'] as const
export type ShellTone = (typeof shellTones)[number]

export interface ShellStoredTokens {
    radius: number
    density: ThemeDensity
    font: ThemeFont
    chartPalette: ThemeChartPalette
    tone: ShellTone
}

export interface ShellTokens extends ShellStoredTokens {
    accent: string
}

export type ShellTokenName = keyof ShellTokens

export const MIN_SHELL_RADIUS = 2
export const MAX_SHELL_RADIUS = 16
export const MIN_SHELL_ACCENT_CONTRAST = 4.5

const ACCENT_LIGHTNESS_STEP = 0.01

export const defaultShellStoredTokens = (): ShellStoredTokens => ({
    radius: 8,
    density: 'comfortable',
    font: 'manrope',
    chartPalette: 'classic',
    tone: 'slate',
})

export const shellStoredTokenNames = Object.keys(defaultShellStoredTokens()) as (keyof ShellStoredTokens)[]
export const shellTokenNames: ShellTokenName[] = ['accent', ...shellStoredTokenNames]

export const isValidShellToken = <K extends ShellTokenName>(name: K, value: unknown): value is ShellTokens[K] => {
    if (name === 'tone') return isOneOf(shellTones, value)
    if (name === 'radius')
        return (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= MIN_SHELL_RADIUS &&
            value <= MAX_SHELL_RADIUS
        )
    if (name === 'accent' || name === 'density' || name === 'font' || name === 'chartPalette')
        return isValidThemeToken(name, value)

    return false
}

export const pickValidShellTokens = (source: Record<string, unknown>): Partial<ShellStoredTokens> => {
    const picked: Record<string, unknown> = {}
    shellStoredTokenNames.forEach((name) => {
        if (Object.prototype.hasOwnProperty.call(source, name) && isValidShellToken(name, source[name]))
            picked[name] = source[name]
    })

    return picked as Partial<ShellStoredTokens>
}

export const resolveShellTokens = (
    storedAccent: unknown,
    storedTokens: unknown,
    defaultAccent: string
): ShellTokens => ({
    ...defaultShellStoredTokens(),
    ...(isRecord(storedTokens) ? pickValidShellTokens(storedTokens) : {}),
    accent: isAccentColor(storedAccent) ? storedAccent : defaultAccent,
})

export interface ShellPalette {
    bg: string
    raised: string
    hover: string
    active: string
    line: string
    border: string
    dash: string
    text: string
    'text-2': string
    muted: string
    'strong-bg': string
    'strong-text': string
    track: string
    bar: string
}

export const shellSlatePalette: { dark: ShellPalette; light: ShellPalette } = {
    dark: {
        bg: '#232832',
        raised: '#2b313d',
        hover: '#2b313d',
        active: '#323a48',
        line: '#3a4250',
        border: '#566174',
        dash: '#566174',
        text: '#e6edf3',
        'text-2': '#c9d1d9',
        muted: '#9aa7b4',
        'strong-bg': '#e6edf3',
        'strong-text': '#232832',
        track: '#3a4250',
        bar: '#e6edf3',
    },
    light: {
        bg: '#f6f7f9',
        raised: '#ffffff',
        hover: '#eef0f3',
        active: '#1c2430',
        line: '#d9dde3',
        border: '#c3c9d2',
        dash: '#aab2bd',
        text: '#1c2430',
        'text-2': '#1c2430',
        muted: '#56606e',
        'strong-bg': '#1c2430',
        'strong-text': '#ffffff',
        track: '#d9dde3',
        bar: '#1c2430',
    },
}

export const shellDefaultAccent = {
    dark: { accent: '#5cc8ff', onAccent: '#232832' },
    light: { accent: '#0b6aa2', onAccent: '#ffffff' },
}

const toneShifts: Record<Exclude<ShellTone, 'slate'>, { hue: number; saturation: number }> = {
    graphite: { hue: 220, saturation: 0.2 },
    ink: { hue: 230, saturation: 1.7 },
    pine: { hue: 168, saturation: 1 },
    plum: { hue: 278, saturation: 1 },
}

const MAX_TONE_SATURATION = 0.45

export const shellPalette = (tone: ShellTone, dark: boolean): ShellPalette => {
    const slate = shellSlatePalette[dark ? 'dark' : 'light']
    if (tone === 'slate') return { ...slate }

    const shift = toneShifts[tone]
    const names = Object.keys(slate) as (keyof ShellPalette)[]

    return Object.fromEntries(
        names.map((name) => {
            const [, saturation, lightness] = hexToHsl(slate[name])
            const shifted = Math.min(saturation * shift.saturation, Math.max(saturation, MAX_TONE_SATURATION))

            return [name, hslToHex(shift.hue, shifted, lightness)]
        })
    ) as unknown as ShellPalette
}

const readableOn = (color: string, background: string, lighten: boolean): string => {
    const [hue, saturation, start] = hexToHsl(color)
    const limit = lighten ? 1 : 0
    let lightness = start
    let result = color.toLowerCase()

    while (contrastRatio(result, background) < MIN_SHELL_ACCENT_CONTRAST && lightness !== limit) {
        lightness = Math.min(1, Math.max(0, lightness + (lighten ? ACCENT_LIGHTNESS_STEP : -ACCENT_LIGHTNESS_STEP)))
        result = hslToHex(hue, saturation, lightness)
    }

    return result
}

export const isDefaultShellAccent = (accent: string, defaultAccent: string): boolean =>
    !isAccentColor(accent) || accent.toLowerCase() === defaultAccent.toLowerCase()

const textOnAccent = (accent: string, preferred: string): string => {
    if (contrastRatio(preferred, accent) >= MIN_SHELL_ACCENT_CONTRAST) return preferred

    return contrastRatio('#ffffff', accent) > contrastRatio('#000000', accent) ? '#ffffff' : '#000000'
}

export const shellAccentColors = (
    accent: string,
    defaultAccent: string,
    tone: ShellTone,
    dark: boolean
): { accent: string; onAccent: string } => {
    const palette = shellPalette(tone, dark)
    const base = isDefaultShellAccent(accent, defaultAccent)
        ? shellDefaultAccent[dark ? 'dark' : 'light'].accent
        : accent
    const readable = readableOn(base, palette.bg, dark)

    return { accent: readable, onAccent: textOnAccent(readable, dark ? palette.bg : '#ffffff') }
}

const compactSpacing: Record<string, string> = {
    '--shell-pad-x': '20px',
    '--shell-pad-y': '14px',
    '--shell-gap': '10px',
    '--shell-control': '44px',
    '--shell-control-large': '48px',
}

export const shellCssVariableNames: string[] = [
    ...Object.keys(shellSlatePalette.dark).map((name) => `--shell-${name}`),
    '--shell-accent',
    '--shell-on-accent',
    '--shell-radius',
    '--shell-font',
    ...Object.keys(compactSpacing),
]

export const shellCssVariables = (
    tokens: ShellTokens,
    defaultAccent: string,
    dark: boolean
): Record<string, string> => {
    const defaults = defaultShellStoredTokens()
    const variables: Record<string, string> = {}

    if (tokens.tone !== defaults.tone) {
        const palette = shellPalette(tokens.tone, dark)
        const names = Object.keys(palette) as (keyof ShellPalette)[]
        names.forEach((name) => (variables[`--shell-${name}`] = palette[name]))
    }

    if (tokens.tone !== defaults.tone || !isDefaultShellAccent(tokens.accent, defaultAccent)) {
        const colors = shellAccentColors(tokens.accent, defaultAccent, tokens.tone, dark)
        variables['--shell-accent'] = colors.accent
        variables['--shell-on-accent'] = colors.onAccent
    }

    if (tokens.radius !== defaults.radius) variables['--shell-radius'] = tokens.radius + 'px'
    if (tokens.font !== defaults.font) variables['--shell-font'] = themeFonts[tokens.font]
    if (tokens.density === 'compact') Object.assign(variables, compactSpacing)

    return variables
}

export interface ShellThemePreset {
    id: string
    accent: string | null
    tokens: ShellStoredTokens
}

export const shellThemePresets: ShellThemePreset[] = [
    { id: 'slate', accent: null, tokens: defaultShellStoredTokens() },
    {
        id: 'ink',
        accent: '#8ea2ff',
        tokens: { radius: 10, density: 'comfortable', font: 'manrope', chartPalette: 'soft', tone: 'ink' },
    },
    {
        id: 'pine',
        accent: '#3fcfa4',
        tokens: { radius: 6, density: 'comfortable', font: 'system', chartPalette: 'accessible', tone: 'pine' },
    },
    {
        id: 'plum',
        accent: '#c39bff',
        tokens: { radius: 12, density: 'comfortable', font: 'manrope', chartPalette: 'soft', tone: 'plum' },
    },
    {
        id: 'graphite',
        accent: '#58d68d',
        tokens: { radius: 4, density: 'compact', font: 'roboto', chartPalette: 'vivid', tone: 'graphite' },
    },
]

export const matchingShellPreset = (tokens: ShellTokens, defaultAccent: string): string | null => {
    const preset = shellThemePresets.find(
        (candidate) =>
            (candidate.accent ?? defaultAccent).toLowerCase() === tokens.accent.toLowerCase() &&
            shellStoredTokenNames.every((name) => candidate.tokens[name] === tokens[name])
    )

    return preset?.id ?? null
}
