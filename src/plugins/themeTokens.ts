import { colorArray, colorChamber, colorHeaterBed, panelToolbarHeight } from '@/store/variables'

export const themeDensities = ['comfortable', 'compact'] as const
export const themeSurfaces = ['standard', 'flat', 'elevated', 'outlined'] as const
export const themeTints = ['neutral', 'accent'] as const
export const themeFontNames = ['roboto', 'manrope', 'system', 'humanist', 'rounded'] as const
export const themeChartPaletteNames = ['classic', 'vivid', 'soft', 'accessible'] as const

export type ThemeDensity = (typeof themeDensities)[number]
export type ThemeSurface = (typeof themeSurfaces)[number]
export type ThemeTint = (typeof themeTints)[number]
export type ThemeFont = (typeof themeFontNames)[number]
export type ThemeChartPalette = (typeof themeChartPaletteNames)[number]

export interface ThemeStoredTokens {
    radius: number
    density: ThemeDensity
    surface: ThemeSurface
    tint: ThemeTint
    font: ThemeFont
    chartPalette: ThemeChartPalette
}

export interface ThemeTokens extends ThemeStoredTokens {
    accent: string
}

export type ThemeTokenName = keyof ThemeTokens

export const MIN_THEME_RADIUS = 0
export const MAX_THEME_RADIUS = 24
export const MIN_ACCENT_CONTRAST = 3

const MAX_CONTROL_RADIUS = 12
const COMPACT_PANEL_TOOLBAR_HEIGHT = 40
const GAP_COMFORTABLE = 24
const GAP_COMPACT = 12

export const defaultStoredThemeTokens = (): ThemeStoredTokens => ({
    radius: 4,
    density: 'comfortable',
    surface: 'standard',
    tint: 'neutral',
    font: 'roboto',
    chartPalette: 'classic',
})

export const defaultThemeTokens = (defaultAccent: string): ThemeTokens => ({
    accent: defaultAccent,
    ...defaultStoredThemeTokens(),
})

export const themeFonts: Record<ThemeFont, string> = {
    roboto: 'Roboto, sans-serif',
    manrope: "'Manrope', system-ui, sans-serif",
    system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif",
    humanist: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
    rounded:
        "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT Bold', Calibri, sans-serif",
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

export const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
    typeof value === 'string' && (options as readonly string[]).includes(value)

export const isAccentColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

const tokenValidators: { [K in ThemeTokenName]: (value: unknown) => value is ThemeTokens[K] } = {
    accent: isAccentColor,
    radius: (value): value is number =>
        typeof value === 'number' && Number.isInteger(value) && value >= MIN_THEME_RADIUS && value <= MAX_THEME_RADIUS,
    density: (value): value is ThemeDensity => isOneOf(themeDensities, value),
    surface: (value): value is ThemeSurface => isOneOf(themeSurfaces, value),
    tint: (value): value is ThemeTint => isOneOf(themeTints, value),
    font: (value): value is ThemeFont => isOneOf(themeFontNames, value),
    chartPalette: (value): value is ThemeChartPalette => isOneOf(themeChartPaletteNames, value),
}

export const storedTokenNames = Object.keys(defaultStoredThemeTokens()) as (keyof ThemeStoredTokens)[]
export const tokenNames: ThemeTokenName[] = ['accent', ...storedTokenNames]

export const isValidThemeToken = <K extends ThemeTokenName>(name: K, value: unknown): value is ThemeTokens[K] =>
    tokenValidators[name](value)

export const pickValidTokens = (source: Record<string, unknown>): Partial<ThemeStoredTokens> => {
    const picked: Record<string, unknown> = {}
    storedTokenNames.forEach((name) => {
        if (Object.prototype.hasOwnProperty.call(source, name) && tokenValidators[name](source[name]))
            picked[name] = source[name]
    })

    return picked as Partial<ThemeStoredTokens>
}

export const resolveThemeTokens = (
    storedAccent: unknown,
    storedTokens: unknown,
    defaultAccent: string
): ThemeTokens => ({
    ...defaultStoredThemeTokens(),
    ...(isRecord(storedTokens) ? pickValidTokens(storedTokens) : {}),
    accent: isAccentColor(storedAccent) ? storedAccent : defaultAccent,
})

export const themeRootAttributes = (tokens: ThemeTokens): Record<string, string> => {
    const defaults = defaultStoredThemeTokens()
    const attributes: Record<string, string> = {}

    if (tokens.radius !== defaults.radius) attributes['data-theme-radius'] = String(tokens.radius)
    if (tokens.density !== defaults.density) attributes['data-theme-density'] = tokens.density
    if (tokens.surface !== defaults.surface) attributes['data-theme-surface'] = tokens.surface
    if (tokens.tint !== defaults.tint) attributes['data-theme-tint'] = tokens.tint
    if (tokens.font !== defaults.font) attributes['data-theme-font'] = tokens.font

    return attributes
}

export const themeRootAttributeNames = [
    'data-theme-radius',
    'data-theme-density',
    'data-theme-surface',
    'data-theme-tint',
    'data-theme-font',
]

export const themeCssVariables = (tokens: ThemeTokens, dark: boolean): Record<string, string> => {
    const compact = tokens.density === 'compact'
    const toolbarHeight = (compact ? COMPACT_PANEL_TOOLBAR_HEIGHT : panelToolbarHeight) + 'px'
    const colors = surfaceColors(tokens, dark)

    return {
        '--panel-toolbar-icon-btn-width': toolbarHeight,
        '--panel-toolbar-text-btn-height': toolbarHeight,
        '--theme-panel-toolbar-height': toolbarHeight,
        '--theme-gap': (compact ? GAP_COMPACT : GAP_COMFORTABLE) + 'px',
        '--theme-radius': tokens.radius + 'px',
        '--theme-radius-control': Math.min(tokens.radius, MAX_CONTROL_RADIUS) + 'px',
        '--theme-font': themeFonts[tokens.font],
        '--theme-page': colors.page,
        '--theme-panel': colors.panel,
        '--theme-panel-toolbar': colors.toolbar,
        '--theme-bar': colors.bar,
    }
}

export const parseHex = (color: string): [number, number, number] | null => {
    const splits = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
    if (!splits) return null

    return [parseInt(splits[1], 16), parseInt(splits[2], 16), parseInt(splits[3], 16)]
}

export const relativeLuminance = (color: string): number => {
    const rgb = parseHex(color)
    if (!rgb) return 0

    const [r, g, b] = rgb.map((channel) => {
        const value = channel / 255
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    })

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (colorA: string, colorB: string): number => {
    const luminanceA = relativeLuminance(colorA)
    const luminanceB = relativeLuminance(colorB)

    return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05)
}

export const textColorOnAccent = (accent: string): string => {
    const rgb = parseHex(accent)
    if (!rgb) return '#ffffff'

    const perceivedLightness = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255

    return perceivedLightness > 0.7 ? '#222' : '#fff'
}

const expandHex = (color: string): string =>
    color.length === 4 ? '#' + [...color.slice(1)].map((char) => char + char).join('') : color

export interface ThemeSurfaceColors {
    page: string
    panel: string
    toolbar: string
    bar: string
}

type ThemeSurfaceInput = Pick<ThemeTokens, 'surface' | 'tint' | 'accent'>

const mixColors = (base: string, color: string, weight: number): string => {
    const baseRgb = parseHex(base)
    const colorRgb = parseHex(color)
    if (!baseRgb || !colorRgb) return base

    return (
        '#' +
        baseRgb
            .map((channel, index) => Math.round(channel + (colorRgb[index] - channel) * weight))
            .map((channel) => channel.toString(16).padStart(2, '0'))
            .join('')
    )
}

const neutralSurfaceColors = (surface: ThemeSurface, dark: boolean): ThemeSurfaceColors => {
    if (dark) {
        const raised = surface === 'elevated'

        return {
            page: '#121212',
            panel: raised ? '#242424' : '#1e1e1e',
            toolbar: raised ? '#2e2e2e' : '#272727',
            bar: '#272727',
        }
    }

    const greyPage = surface === 'flat' || surface === 'elevated'

    return { page: greyPage ? '#f0f2f5' : '#ffffff', panel: '#ffffff', toolbar: '#ffffff', bar: '#f5f5f5' }
}

const tintWeights = (dark: boolean): Record<keyof ThemeSurfaceColors, number> =>
    dark ? { page: 0.07, panel: 0.09, toolbar: 0.12, bar: 0.12 } : { page: 0.06, panel: 0, toolbar: 0, bar: 0.08 }

export const surfaceColors = (theme: ThemeSurfaceInput, dark: boolean): ThemeSurfaceColors => {
    const colors = neutralSurfaceColors(theme.surface, dark)

    if (theme.tint === 'accent') {
        const weights = tintWeights(dark)
        const names = Object.keys(colors) as (keyof ThemeSurfaceColors)[]
        names.forEach((name) => (colors[name] = mixColors(colors[name], theme.accent, weights[name])))
    }

    if (theme.surface === 'outlined') return { ...colors, panel: colors.page, toolbar: colors.page }

    return colors
}

export const accentContrast = (theme: ThemeSurfaceInput, dark: boolean): { ratio: number; readable: boolean } => {
    const ratio = contrastRatio(theme.accent, surfaceColors(theme, dark).panel)

    return { ratio, readable: ratio >= MIN_ACCENT_CONTRAST }
}

export const onAccentContrast = (accent: string): number => contrastRatio(expandHex(textColorOnAccent(accent)), accent)

export interface ChartPaletteColors {
    bed: string
    chamber: string
    series: string[]
}

const classicChartPalette: ChartPaletteColors = { bed: colorHeaterBed, chamber: colorChamber, series: colorArray }

export const chartPalettes: Record<ThemeChartPalette, { dark: ChartPaletteColors; light: ChartPaletteColors }> = {
    classic: { dark: classicChartPalette, light: classicChartPalette },
    vivid: {
        dark: {
            bed: '#38bdf8',
            chamber: '#3ddc84',
            series: ['#ff5d5d', '#ffb020', '#c084fc', '#2dd4bf', '#ff7ab6', '#f5e663', '#818cf8', '#fb923c'],
        },
        light: {
            bed: '#0369a1',
            chamber: '#15803d',
            series: ['#dc2626', '#b45309', '#7e22ce', '#0f766e', '#be185d', '#857a00', '#4338ca', '#c2410c'],
        },
    },
    soft: {
        dark: {
            bed: '#9cc9e8',
            chamber: '#a3d9a5',
            series: ['#e8a0a0', '#e6c08a', '#c5b3e6', '#8fd3c8', '#e6a8cc', '#d9d48f', '#a9b4f0', '#f0b392'],
        },
        light: {
            bed: '#4a7fa5',
            chamber: '#4f8a5b',
            series: ['#b0565a', '#a0703a', '#7a66ad', '#3f8a80', '#a85a8a', '#827c32', '#5b68b0', '#b56a45'],
        },
    },
    accessible: {
        dark: {
            bed: '#56b4e9',
            chamber: '#009e73',
            series: ['#d55e00', '#e69f00', '#cc79a7', '#f0e442', '#2a7fd0', '#999999'],
        },
        light: {
            bed: '#2a84ba',
            chamber: '#008561',
            series: ['#c25600', '#b07900', '#b85c90', '#8a8200', '#0072b2', '#666666'],
        },
    },
}

export const chartPaletteColors = (palette: ThemeChartPalette, dark: boolean): ChartPaletteColors =>
    chartPalettes[palette][dark ? 'dark' : 'light']

export const assignChartColors = (
    names: string[],
    userColors: Record<string, string | undefined>,
    palette: ThemeChartPalette,
    dark: boolean
): Record<string, string> => {
    const colors = chartPaletteColors(palette, dark)
    const assigned: Record<string, string> = {}
    let seriesIndex = 0

    names.forEach((name) => {
        const userColor = userColors[name]
        if (userColor) assigned[name] = userColor
        else if (name === 'heater_bed') assigned[name] = colors.bed
        else if (name.endsWith(' chamber')) assigned[name] = colors.chamber
        else assigned[name] = colors.series[seriesIndex++ % colors.series.length]
    })

    return assigned
}

export interface ThemePreset {
    id: string
    accent: string | null
    tokens: ThemeStoredTokens
}

export const themePresets: ThemePreset[] = [
    { id: 'classic', accent: null, tokens: defaultStoredThemeTokens() },
    {
        id: 'lagoon',
        accent: '#0e9f8e',
        tokens: {
            radius: 10,
            density: 'comfortable',
            surface: 'flat',
            tint: 'accent',
            font: 'system',
            chartPalette: 'soft',
        },
    },
    {
        id: 'blueprint',
        accent: '#1a9bbd',
        tokens: {
            radius: 0,
            density: 'compact',
            surface: 'outlined',
            tint: 'neutral',
            font: 'system',
            chartPalette: 'accessible',
        },
    },
    {
        id: 'ember',
        accent: '#e2622a',
        tokens: {
            radius: 14,
            density: 'comfortable',
            surface: 'elevated',
            tint: 'accent',
            font: 'humanist',
            chartPalette: 'vivid',
        },
    },
    {
        id: 'orchid',
        accent: '#8b5cf6',
        tokens: {
            radius: 20,
            density: 'comfortable',
            surface: 'outlined',
            tint: 'accent',
            font: 'rounded',
            chartPalette: 'soft',
        },
    },
    {
        id: 'workshop',
        accent: '#2e9e5b',
        tokens: {
            radius: 2,
            density: 'compact',
            surface: 'flat',
            tint: 'neutral',
            font: 'roboto',
            chartPalette: 'vivid',
        },
    },
]

export const matchingPreset = (tokens: ThemeTokens, defaultAccent: string): string | null => {
    const preset = themePresets.find(
        (candidate) =>
            (candidate.accent ?? defaultAccent).toLowerCase() === tokens.accent.toLowerCase() &&
            storedTokenNames.every((name) => candidate.tokens[name] === tokens[name])
    )

    return preset?.id ?? null
}

export const hexToHsl = (color: string): [number, number, number] => {
    const [r, g, b] = (parseHex(color) ?? [0, 0, 0]).map((channel) => channel / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const delta = max - min
    if (delta === 0) return [0, 0, lightness]

    const saturation = delta / (1 - Math.abs(2 * lightness - 1))
    const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4

    return [(sector * 60 + 360) % 360, saturation, lightness]
}

export const hslToHex = (hue: number, saturation: number, lightness: number): string => {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const sector = (((hue % 360) + 360) % 360) / 60
    const second = chroma * (1 - Math.abs((sector % 2) - 1))
    const match = lightness - chroma / 2
    const [r, g, b] = [
        [chroma, second, 0],
        [second, chroma, 0],
        [0, chroma, second],
        [0, second, chroma],
        [second, 0, chroma],
        [chroma, 0, second],
    ][Math.min(Math.floor(sector), 5)]

    return (
        '#' +
        [r, g, b]
            .map((channel) => Math.round((channel + match) * 255))
            .map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0'))
            .join('')
    )
}
