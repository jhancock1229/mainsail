import { describe, expect, it } from 'vitest'
import {
    accentContrast,
    assignChartColors,
    chartPalettes,
    contrastRatio,
    defaultThemeTokens,
    matchingPreset,
    onAccentContrast,
    resolveThemeTokens,
    surfaceColors,
    textColorOnAccent,
    themeCssVariables,
    themeFontNames,
    themeFonts,
    themePresets,
    themeRootAttributeNames,
    themeRootAttributes,
    type ThemeTokens,
} from '@/plugins/themeTokens'
import { colorArray, colorChamber, colorHeaterBed, defaultPrimaryColor, panelToolbarHeight } from '@/store/variables'

const defaults = defaultThemeTokens(defaultPrimaryColor)

describe('resolveThemeTokens', () => {
    it('gives the stock look when nothing is stored', () => {
        expect(resolveThemeTokens(undefined, undefined, defaultPrimaryColor)).toEqual({
            accent: defaultPrimaryColor,
            radius: 4,
            density: 'comfortable',
            surface: 'standard',
            tint: 'neutral',
            font: 'roboto',
            chartPalette: 'classic',
        })
    })

    it('keeps the stored primary colour as the accent', () => {
        expect(resolveThemeTokens('#ff0000', {}, defaultPrimaryColor).accent).toBe('#ff0000')
    })

    it('uses valid stored tokens', () => {
        const stored = {
            radius: 12,
            density: 'compact',
            surface: 'outlined',
            tint: 'accent',
            font: 'humanist',
            chartPalette: 'vivid',
        }

        expect(resolveThemeTokens('#123456', stored, defaultPrimaryColor)).toEqual({ accent: '#123456', ...stored })
    })

    it('falls back per token when a stored value is invalid', () => {
        const stored = { radius: 400, density: 'tiny', surface: null, tint: 1, font: 12, chartPalette: 'vivid' }

        expect(resolveThemeTokens('not a colour', stored, defaultPrimaryColor)).toEqual({
            ...defaults,
            chartPalette: 'vivid',
        })
    })

    it('survives stored data of the wrong shape', () => {
        expect(resolveThemeTokens(undefined, 'broken', defaultPrimaryColor)).toEqual(defaults)
        expect(resolveThemeTokens(undefined, [1, 2], defaultPrimaryColor)).toEqual(defaults)
    })
})

describe('themeRootAttributes', () => {
    it('sets nothing for the stock look, so no theme rule applies', () => {
        expect(themeRootAttributes(defaults)).toEqual({})
    })

    it('ignores the accent, which Vuetify applies', () => {
        expect(themeRootAttributes({ ...defaults, accent: '#00ff00' })).toEqual({})
    })

    it('lists every attribute it can set, so that a reset removes them all', () => {
        const tokens: ThemeTokens = {
            accent: defaultPrimaryColor,
            radius: 1,
            density: 'compact',
            surface: 'outlined',
            tint: 'accent',
            font: 'humanist',
            chartPalette: 'vivid',
        }

        expect(Object.keys(themeRootAttributes(tokens)).sort()).toEqual([...themeRootAttributeNames].sort())
    })

    it('marks every token that differs from the stock look', () => {
        const tokens: ThemeTokens = {
            accent: defaultPrimaryColor,
            radius: 0,
            density: 'compact',
            surface: 'flat',
            tint: 'accent',
            font: 'system',
            chartPalette: 'soft',
        }

        expect(themeRootAttributes(tokens)).toEqual({
            'data-theme-radius': '0',
            'data-theme-density': 'compact',
            'data-theme-surface': 'flat',
            'data-theme-tint': 'accent',
            'data-theme-font': 'system',
        })
    })
})

describe('themeCssVariables', () => {
    it('keeps the stock panel toolbar size by default', () => {
        const vars = themeCssVariables(defaults, true)

        expect(vars['--panel-toolbar-icon-btn-width']).toBe(panelToolbarHeight + 'px')
        expect(vars['--panel-toolbar-text-btn-height']).toBe(panelToolbarHeight + 'px')
        expect(vars['--theme-panel-toolbar-height']).toBe(panelToolbarHeight + 'px')
        expect(vars['--theme-radius']).toBe('4px')
        expect(vars['--theme-font']).toBe(themeFonts.roboto)
    })

    it('shrinks the panel toolbar and the gaps in compact density', () => {
        const comfortable = themeCssVariables(defaults, true)
        const compact = themeCssVariables({ ...defaults, density: 'compact' }, true)

        expect(parseInt(compact['--theme-panel-toolbar-height'])).toBeLessThan(panelToolbarHeight)
        expect(compact['--panel-toolbar-icon-btn-width']).toBe(compact['--theme-panel-toolbar-height'])
        expect(parseInt(compact['--theme-gap'])).toBeLessThan(parseInt(comfortable['--theme-gap']))
    })

    it('limits the radius of small controls so that buttons stay recognisable', () => {
        const vars = themeCssVariables({ ...defaults, radius: 24 }, true)

        expect(vars['--theme-radius']).toBe('24px')
        expect(parseInt(vars['--theme-radius-control'])).toBeLessThanOrEqual(12)
        expect(themeCssVariables({ ...defaults, radius: 2 }, true)['--theme-radius-control']).toBe('2px')
    })

    it('only ever emits values built from validated tokens', () => {
        const vars = themeCssVariables({ ...defaults, font: 'humanist', radius: 10, tint: 'accent' }, false)

        Object.values(vars).forEach((value) => expect(value).not.toMatch(/[;{}]|url\(|expression/i))
        expect(vars['--theme-font']).toBe(themeFonts.humanist)
    })
})

describe('contrast', () => {
    it('computes WCAG contrast ratios', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
        expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
        expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    })

    it('keeps the text colour the stock primary button has', () => {
        expect(textColorOnAccent(defaultPrimaryColor)).toBe('#fff')
        expect(textColorOnAccent('#F6CF3D')).toBe('#222')
        expect(textColorOnAccent('rubbish')).toBe('#ffffff')
        expect(onAccentContrast('#000000')).toBeCloseTo(21, 5)
        expect(onAccentContrast('#ffffff')).toBeGreaterThan(10)
    })

    it('reports an accent that is hard to see on the current surface', () => {
        const readable = (accent: string, dark: boolean) => accentContrast({ ...defaults, accent }, dark).readable

        expect(readable('#101010', true)).toBe(false)
        expect(readable('#101010', false)).toBe(true)
        expect(readable('#fff59d', false)).toBe(false)
        expect(readable(defaultPrimaryColor, true)).toBe(true)
        expect(readable(defaultPrimaryColor, false)).toBe(true)
    })
})

describe('surfaceColors', () => {
    it('keeps the stock colours for the stock look', () => {
        expect(surfaceColors(defaults, true)).toEqual({
            page: '#121212',
            panel: '#1e1e1e',
            toolbar: '#272727',
            bar: '#272727',
        })
        expect(surfaceColors(defaults, false)).toEqual({
            page: '#ffffff',
            panel: '#ffffff',
            toolbar: '#ffffff',
            bar: '#f5f5f5',
        })
    })

    it('separates white panels from the page in light mode when they have no outline', () => {
        expect(surfaceColors({ ...defaults, surface: 'flat' }, false).page).not.toBe('#ffffff')
        expect(surfaceColors({ ...defaults, surface: 'elevated' }, false).page).not.toBe('#ffffff')
    })

    it('draws outlined panels in the page colour', () => {
        ;[true, false].forEach((dark) => {
            const colors = surfaceColors({ ...defaults, surface: 'outlined', tint: 'accent' }, dark)
            expect(colors.panel).toBe(colors.page)
            expect(colors.toolbar).toBe(colors.page)
        })
    })

    it('shifts the backgrounds towards the accent when tinted, without changing how light they are much', () => {
        const accent = '#e2622a'
        ;[true, false].forEach((dark) => {
            const neutral = surfaceColors({ ...defaults, accent }, dark)
            const tinted = surfaceColors({ ...defaults, accent, tint: 'accent' }, dark)

            expect(tinted.page).not.toBe(neutral.page)
            expect(tinted.page).toMatch(/^#[0-9a-f]{6}$/)
            expect(contrastRatio(tinted.page, neutral.page)).toBeLessThan(1.25)
            expect(contrastRatio(tinted.panel, neutral.panel)).toBeLessThan(1.25)
        })
    })

    it('keeps text readable on tinted backgrounds for any accent', () => {
        ;['#ffffff', '#000000', '#ffff00', '#ff00ff', '#00ffff'].forEach((accent) => {
            const dark = surfaceColors({ ...defaults, accent, tint: 'accent' }, true)
            const light = surfaceColors({ ...defaults, accent, tint: 'accent', surface: 'flat' }, false)

            Object.values(dark).forEach((color) => expect(contrastRatio('#ffffff', color)).toBeGreaterThanOrEqual(10))
            Object.values(light).forEach((color) => expect(contrastRatio('#000000', color)).toBeGreaterThanOrEqual(15))
        })
    })
})

describe('themePresets', () => {
    it('starts with the stock look', () => {
        expect(themePresets[0].id).toBe('classic')
        expect(themePresets[0].tokens).toEqual({
            radius: 4,
            density: 'comfortable',
            surface: 'standard',
            tint: 'neutral',
            font: 'roboto',
            chartPalette: 'classic',
        })
        expect(themePresets[0].accent).toBeNull()
    })

    it('offers several presets that all differ from each other', () => {
        expect(themePresets.length).toBeGreaterThanOrEqual(5)

        const signatures = themePresets.map((preset) => JSON.stringify([preset.accent, preset.tokens]))
        expect(new Set(signatures).size).toBe(themePresets.length)
        expect(new Set(themePresets.map((preset) => preset.id)).size).toBe(themePresets.length)
    })

    it('only uses valid token values', () => {
        themePresets.forEach((preset) => {
            const accent = preset.accent ?? defaultPrimaryColor
            expect(resolveThemeTokens(accent, preset.tokens, defaultPrimaryColor)).toEqual({
                accent,
                ...preset.tokens,
            })
        })
    })

    it.each([true, false])('has a readable accent in every preset (dark: %s)', (dark) => {
        themePresets.forEach((preset) => {
            const accent = preset.accent ?? defaultPrimaryColor
            const surface = surfaceColors({ ...preset.tokens, accent }, dark).panel

            expect(contrastRatio(accent, surface), `${preset.id} accent on panel`).toBeGreaterThanOrEqual(3)
            expect(onAccentContrast(accent), `${preset.id} text on accent`).toBeGreaterThanOrEqual(3)
        })
    })

    it('is recognised from its tokens', () => {
        themePresets.forEach((preset) => {
            const tokens = { accent: preset.accent ?? '#ABCDEF', ...preset.tokens }
            expect(matchingPreset(tokens, '#abcdef')).toBe(preset.id)
        })
    })

    it('reports a custom theme when a token was edited', () => {
        expect(matchingPreset({ ...defaults, radius: 5 }, defaultPrimaryColor)).toBeNull()
        expect(matchingPreset({ ...defaults, accent: '#ff00ff' }, defaultPrimaryColor)).toBeNull()
    })
})

describe('chart palettes', () => {
    it('keeps the stock chart colours in the classic palette', () => {
        ;[true, false].forEach((dark) => {
            const palette = chartPalettes.classic[dark ? 'dark' : 'light']
            expect(palette.series).toEqual(colorArray)
            expect(palette.bed).toBe(colorHeaterBed)
            expect(palette.chamber).toBe(colorChamber)
        })
    })

    it.each([true, false])('has visible, distinct colours in every new palette (dark: %s)', (dark) => {
        const backgrounds = themePresets.map(
            (preset) => surfaceColors({ ...preset.tokens, accent: preset.accent ?? defaultPrimaryColor }, dark).panel
        )

        Object.entries(chartPalettes)
            .filter(([name]) => name !== 'classic')
            .forEach(([name, modes]) => {
                const palette = modes[dark ? 'dark' : 'light']
                const colors = [palette.bed, palette.chamber, ...palette.series]

                expect(palette.series.length).toBeGreaterThanOrEqual(6)
                expect(new Set(colors.map((color) => color.toLowerCase())).size).toBe(colors.length)
                colors.forEach((color) => {
                    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
                    backgrounds.forEach((background) =>
                        expect(contrastRatio(color, background), `${name} ${color}`).toBeGreaterThanOrEqual(3)
                    )
                })
            })
    })

    it('assigns the colours the way the temperature chart always did', () => {
        const names = ['extruder', 'extruder1', 'heater_bed', 'temperature_sensor chamber', 'temperature_sensor mcu']

        expect(assignChartColors(names, {}, 'classic', true)).toEqual({
            extruder: colorArray[0],
            extruder1: colorArray[1],
            heater_bed: colorHeaterBed,
            'temperature_sensor chamber': colorChamber,
            'temperature_sensor mcu': colorArray[2],
        })
    })

    it('keeps colours the user chose for a sensor', () => {
        const colors = assignChartColors(['extruder', 'heater_bed'], { heater_bed: '#010203' }, 'vivid', true)

        expect(colors.heater_bed).toBe('#010203')
        expect(colors.extruder).toBe(chartPalettes.vivid.dark.series[0])
    })

    it('follows the mode and starts over when the palette runs out', () => {
        const names = Array.from({ length: 12 }, (_, index) => `temperature_sensor s${index}`)
        const light = assignChartColors(names, {}, 'vivid', false)
        const series = chartPalettes.vivid.light.series

        expect(light[names[0]]).toBe(series[0])
        expect(light[names[series.length]]).toBe(series[0])
    })
})

describe('fonts', () => {
    it('offers Manrope and no monospaced interface font', () => {
        expect(themeFontNames).toContain('manrope')
        expect(themeFontNames).not.toContain('mono')
        Object.values(themeFonts).forEach((stack) => expect(stack).not.toMatch(/mono|plex|serif(?<!sans-serif)/i))
    })

    it('falls back to the default when a removed font is still stored', () => {
        expect(resolveThemeTokens(undefined, { font: 'mono' }, defaultPrimaryColor).font).toBe('roboto')
    })
})
