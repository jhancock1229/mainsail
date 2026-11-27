import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    defaultShellStoredTokens,
    matchingShellPreset,
    MIN_SHELL_ACCENT_CONTRAST,
    resolveShellTokens,
    shellAccentColors,
    shellCssVariableNames,
    shellCssVariables,
    shellDefaultAccent,
    shellPalette,
    shellPrimary,
    shellSlatePalette,
    shellThemePresets,
    shellTones,
    type ShellTokens,
} from '@/plugins/shellTheme'
import { chartPalettes, contrastRatio, hexToHsl, themeFonts } from '@/plugins/themeTokens'
import { defaultPrimaryColor } from '@/store/variables'

const defaults: ShellTokens = defaultShellStoredTokens()
const modes = [true, false]
const shellCss = readFileSync(resolve(__dirname, '../../src/assets/styles/shell.css'), 'utf8')

const cssBlock = (selector: string): Record<string, string> => {
    const start = shellCss.indexOf(selector + ' {')
    const body = shellCss.slice(start, shellCss.indexOf('}', start))

    return Object.fromEntries([...body.matchAll(/(--shell-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]))
}

describe('the approved look of the new interface', () => {
    it('is what the default tokens give: no variable is overridden', () => {
        modes.forEach((dark) => expect(shellCssVariables(defaults, dark)).toEqual({}))
    })

    it('uses Manrope, 8px corners and the slate palette', () => {
        expect(defaultShellStoredTokens()).toEqual({
            accent: 'default',
            radius: 8,
            density: 'comfortable',
            font: 'manrope',
            chartPalette: 'classic',
            tone: 'slate',
        })
        expect(cssBlock('html.shell-new')['--shell-font']).toBe(themeFonts.manrope)
    })

    it('is described by the same colours as the stylesheet', () => {
        const stylesheet = { dark: cssBlock('html.shell-new'), light: cssBlock('html.shell-new.theme--light') }

        ;(['dark', 'light'] as const).forEach((mode) => {
            Object.entries(shellSlatePalette[mode]).forEach(([name, color]) =>
                expect(stylesheet[mode][`--shell-${name}`], `${mode} ${name}`).toBe(color)
            )
            expect(stylesheet[mode]['--shell-accent']).toBe(shellDefaultAccent[mode].accent)
            expect(stylesheet[mode]['--shell-on-accent']).toBe(shellDefaultAccent[mode].onAccent)
        })
    })

    it('has a variable name for everything that can be overridden', () => {
        const everything: ShellTokens = {
            accent: '#ff00ff',
            radius: 3,
            density: 'compact',
            font: 'system',
            chartPalette: 'vivid',
            tone: 'plum',
        }

        expect(Object.keys(shellCssVariables(everything, true)).sort()).toEqual([...shellCssVariableNames].sort())
    })
})

describe('resolveShellTokens', () => {
    it('falls back per token', () => {
        const stored = { radius: 99, density: 'compact', font: 'mono', chartPalette: 'soft', tone: 'black' }

        expect(resolveShellTokens(stored)).toEqual({ ...defaults, density: 'compact', chartPalette: 'soft' })
        expect(resolveShellTokens(null)).toEqual(defaults)
    })

    it('keeps the approved accent for settings that were stored before the shell had its own accent', () => {
        expect(resolveShellTokens({ radius: 10, tone: 'ink' }).accent).toBe('default')
        expect(resolveShellTokens({ accent: 'red' }).accent).toBe('default')
        expect(resolveShellTokens({ accent: '#AA33CC' }).accent).toBe('#AA33CC')
    })
})

describe('shellPalette', () => {
    it('returns the approved slate unchanged', () => {
        expect(shellPalette('slate', true)).toEqual(shellSlatePalette.dark)
        expect(shellPalette('slate', false)).toEqual(shellSlatePalette.light)
    })

    it.each(shellTones)('keeps the %s tone as light as the approved slate, never near black', (tone) => {
        const dark = shellPalette(tone, true)
        const light = shellPalette(tone, false)

        expect(hexToHsl(dark.bg)[2]).toBeGreaterThanOrEqual(0.16)
        expect(hexToHsl(dark.bg)[2]).toBeCloseTo(hexToHsl(shellSlatePalette.dark.bg)[2], 1)
        expect(hexToHsl(light.bg)[2]).toBeCloseTo(hexToHsl(shellSlatePalette.light.bg)[2], 1)
    })

    it.each(shellTones)('stays away from warm brown backgrounds in the %s tone', (tone) => {
        modes.forEach((dark) => {
            const [hue, saturation] = hexToHsl(shellPalette(tone, dark).bg)
            const warm = hue < 70 || hue > 320

            expect(warm && saturation > 0.08, `${tone} ${hue}`).toBe(false)
        })
    })

    it.each(shellTones)('keeps text, muted text and buttons readable in the %s tone', (tone) => {
        modes.forEach((dark) => {
            const palette = shellPalette(tone, dark)

            expect(contrastRatio(palette.text, palette.bg)).toBeGreaterThanOrEqual(10)
            expect(contrastRatio(palette['text-2'], palette.bg)).toBeGreaterThanOrEqual(7)
            expect(contrastRatio(palette.muted, palette.bg)).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(palette.muted, palette.raised)).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(palette['strong-text'], palette['strong-bg'])).toBeGreaterThanOrEqual(10)
            expect(contrastRatio(palette.border, palette.bg)).toBeGreaterThanOrEqual(1.4)
        })
    })

    it('gives every tone its own background', () => {
        modes.forEach((dark) => {
            const backgrounds = shellTones.map((tone) => shellPalette(tone, dark).bg)
            expect(new Set(backgrounds).size).toBe(shellTones.length)
        })
    })
})

describe('shellAccentColors', () => {
    it('keeps the approved accent while the accent is at its default', () => {
        expect(shellAccentColors('default', 'slate', true)).toEqual(shellDefaultAccent.dark)
        expect(shellAccentColors('default', 'slate', false)).toEqual(shellDefaultAccent.light)
        expect(shellAccentColors('rubbish', 'slate', true)).toEqual(shellDefaultAccent.dark)
    })

    it('leaves a readable accent as the user picked it', () => {
        expect(shellAccentColors('#ffd166', 'slate', true).accent).toBe('#ffd166')
        expect(shellAccentColors('#7a1fa2', 'slate', false).accent).toBe('#7a1fa2')
    })

    it.each(['#000000', '#ffffff', '#ffff00', '#0000ff', '#ff0000', '#808080', '#123456', '#fedcba'])(
        'makes the accent %s readable in every tone and mode, with readable text on it',
        (accent) => {
            shellTones.forEach((tone) =>
                modes.forEach((dark) => {
                    const colors = shellAccentColors(accent, tone, dark)
                    const background = shellPalette(tone, dark).bg

                    expect(colors.accent).toMatch(/^#[0-9a-f]{6}$/)
                    expect(contrastRatio(colors.accent, background)).toBeGreaterThanOrEqual(MIN_SHELL_ACCENT_CONTRAST)
                    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5)
                })
            )
        }
    )

    it('keeps the hue of the accent when it has to be adjusted', () => {
        const adjusted = shellAccentColors('#0a3d91', 'slate', true).accent

        expect(adjusted).not.toBe('#0a3d91')
        expect(Math.abs(hexToHsl(adjusted)[0] - hexToHsl('#0a3d91')[0])).toBeLessThan(4)
    })
})

describe('shellPrimary', () => {
    it('keeps the stock primary colour and its text colour while the accent is at its default', () => {
        modes.forEach((dark) =>
            expect(shellPrimary(defaults, defaultPrimaryColor, dark)).toEqual({
                color: defaultPrimaryColor,
                text: '#fff',
            })
        )
    })

    it('uses the adjusted accent as the button colour, never the raw one', () => {
        const tokens = { ...defaults, accent: '#ffe600' }

        expect(shellPrimary(tokens, defaultPrimaryColor, false).color).toBe(
            shellAccentColors('#ffe600', 'slate', false).accent
        )
        expect(shellPrimary(tokens, defaultPrimaryColor, false).color).not.toBe('#ffe600')
    })

    it.each(['#ffe600', '#000000', '#ffffff', '#0a3d91', '#ff0000', '#8ea2ff'])(
        'gives readable text on a primary button for the accent %s in every tone and mode',
        (accent) => {
            shellTones.forEach((tone) =>
                modes.forEach((dark) => {
                    const primary = shellPrimary({ ...defaults, accent, tone }, defaultPrimaryColor, dark)

                    expect(contrastRatio(primary.text, primary.color), `${tone} ${dark}`).toBeGreaterThanOrEqual(4.5)
                })
            )
        }
    )
})

describe('shellCssVariables', () => {
    it('overrides only what differs from the approved look', () => {
        expect(shellCssVariables({ ...defaults, radius: 12 }, true)).toEqual({
            '--shell-radius': '12px',
        })
        expect(shellCssVariables({ ...defaults, font: 'system' }, true)).toEqual({
            '--shell-font': themeFonts.system,
        })
        expect(Object.keys(shellCssVariables({ ...defaults, accent: '#ff00ff' }, true))).toEqual([
            '--shell-accent',
            '--shell-on-accent',
        ])
    })

    it('tightens the spacing in compact density', () => {
        const compact = shellCssVariables({ ...defaults, density: 'compact' }, true)

        expect(parseInt(compact['--shell-pad-x'])).toBeLessThan(28)
        expect(parseInt(compact['--shell-pad-y'])).toBeLessThan(22)
        expect(parseInt(compact['--shell-gap'])).toBeLessThan(14)
        expect(parseInt(compact['--shell-control'])).toBeGreaterThanOrEqual(44)
    })

    it('sets the whole palette and a matching accent for another tone', () => {
        const variables = shellCssVariables({ ...defaults, tone: 'pine' }, false)

        expect(variables['--shell-bg']).toBe(shellPalette('pine', false).bg)
        expect(variables['--shell-accent']).toBeDefined()
        Object.values(variables).forEach((value) => expect(value).toMatch(/^#[0-9a-f]{6}$/))
    })

    it('never emits anything but colours, pixel sizes and known font stacks', () => {
        const variables = shellCssVariables(
            { accent: '#aa33cc', radius: 16, density: 'compact', font: 'rounded', chartPalette: 'soft', tone: 'ink' },
            true
        )

        Object.entries(variables).forEach(([name, value]) => {
            if (name === '--shell-font') expect(Object.values(themeFonts)).toContain(value)
            else expect(value).toMatch(/^(#[0-9a-f]{6}|\d+px)$/)
        })
    })
})

describe('shellThemePresets', () => {
    it('starts with the approved look', () => {
        expect(shellThemePresets[0]).toEqual({ id: 'slate', tokens: defaultShellStoredTokens() })
    })

    it('offers four to six presets that differ in tone and accent', () => {
        expect(shellThemePresets.length).toBeGreaterThanOrEqual(4)
        expect(shellThemePresets.length).toBeLessThanOrEqual(6)
        expect(new Set(shellThemePresets.map((preset) => preset.tokens.tone)).size).toBe(shellThemePresets.length)
        expect(new Set(shellThemePresets.map((preset) => preset.tokens.accent)).size).toBe(shellThemePresets.length)
    })

    it('stays within the tastes of the owner', () => {
        shellThemePresets.forEach((preset) => {
            expect(preset.tokens.radius, preset.id).toBeGreaterThanOrEqual(4)
            expect(preset.tokens.radius, preset.id).toBeLessThanOrEqual(12)
            expect(themeFonts[preset.tokens.font]).not.toMatch(/mono|plex/i)
        })
    })

    it('only uses valid token values and is recognised from them', () => {
        shellThemePresets.forEach((preset) => {
            const tokens = resolveShellTokens(preset.tokens)

            expect(tokens).toEqual(preset.tokens)
            expect(matchingShellPreset(tokens)).toBe(preset.id)
            expect(matchingShellPreset({ ...tokens, accent: tokens.accent.toUpperCase() })).toBe(preset.id)
        })
        expect(matchingShellPreset({ ...defaults, radius: 9 })).toBeNull()
        expect(matchingShellPreset({ ...defaults, accent: '#123456' })).toBeNull()
    })

    it.each(modes)('has a readable accent and readable chart colours in every preset (dark: %s)', (dark) => {
        shellThemePresets.forEach((preset) => {
            const palette = shellPalette(preset.tokens.tone, dark)
            const colors = shellAccentColors(preset.tokens.accent, preset.tokens.tone, dark)

            expect(contrastRatio(colors.accent, palette.bg), `${preset.id} accent`).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(colors.onAccent, colors.accent), `${preset.id} on accent`).toBeGreaterThanOrEqual(4.5)

            if (preset.tokens.chartPalette === 'classic') return
            const chart = chartPalettes[preset.tokens.chartPalette][dark ? 'dark' : 'light']
            ;[chart.bed, chart.chamber, ...chart.series].forEach((color) =>
                expect(contrastRatio(color, palette.bg), `${preset.id} chart ${color}`).toBeGreaterThanOrEqual(3)
            )
        })
    })
})
