import { describe, expect, it } from 'vitest'
import { exportThemeFile, MAX_THEME_FILE_SIZE, parseThemeFile } from '@/plugins/themeFile'
import { defaultStoredThemeTokens, type ThemeStoredTokens } from '@/plugins/themeTokens'
import { defaultShellStoredTokens, type ShellStoredTokens } from '@/plugins/shellTheme'

const classicTokens: ThemeStoredTokens = {
    radius: 12,
    density: 'compact',
    surface: 'outlined',
    tint: 'accent',
    font: 'humanist',
    chartPalette: 'accessible',
}
const shellTokens: ShellStoredTokens = {
    accent: '#8855ee',
    radius: 10,
    density: 'compact',
    font: 'system',
    chartPalette: 'soft',
    tone: 'pine',
}
const classicFile = { format: 'mainsail-theme', version: 1, tokens: { accent: '#8855ee', ...classicTokens } }
const shellFile = {
    format: 'mainsail-theme',
    version: 1,
    interface: 'new',
    tokens: { ...shellTokens },
}

const errorOf = (file: unknown, expected?: 'new' | 'classic') => {
    const result = parseThemeFile(typeof file === 'string' ? file : JSON.stringify(file), expected)
    if (result.ok) throw new Error('file was accepted')

    return result.error
}

describe('exportThemeFile and parseThemeFile', () => {
    it('round-trips a theme of the classic interface', () => {
        const text = exportThemeFile({ interface: 'classic', accent: '#8855EE', tokens: classicTokens }, 'My theme')

        expect(parseThemeFile(text)).toEqual({
            ok: true,
            name: 'My theme',
            interface: 'classic',
            accent: '#8855ee',
            tokens: classicTokens,
        })
    })

    it('round-trips a theme of the new interface', () => {
        const text = exportThemeFile({ interface: 'new', tokens: { ...shellTokens, accent: '#8855EE' } })

        expect(JSON.parse(text)).toEqual(shellFile)
        expect(parseThemeFile(text, 'new')).toEqual({ ok: true, name: null, interface: 'new', tokens: shellTokens })
    })

    it('leaves a default accent out of the file, so the theme looks the same on any instance', () => {
        const shell = exportThemeFile({ interface: 'new', tokens: { ...shellTokens, accent: 'default' } })
        const classic = exportThemeFile({ interface: 'classic', accent: null, tokens: classicTokens })

        expect(JSON.parse(shell).tokens).not.toHaveProperty('accent')
        expect(JSON.parse(classic).tokens).not.toHaveProperty('accent')
        expect(parseThemeFile(shell)).toEqual({
            ok: true,
            name: null,
            interface: 'new',
            tokens: { ...shellTokens, accent: 'default' },
        })
        expect(parseThemeFile(classic)).toMatchObject({ ok: true, interface: 'classic', accent: null })
    })

    it('does not accept the word for the default accent in a file', () => {
        expect(errorOf({ ...shellFile, tokens: { ...shellFile.tokens, accent: 'default' } })).toEqual({
            code: 'invalidValue',
            key: 'accent',
            value: '"default"',
        })
    })

    it('exports nothing but the tokens of the chosen interface', () => {
        const mixed = { ...classicTokens, ...shellTokens, extra: 'body{}' } as unknown as ShellStoredTokens
        const file = JSON.parse(exportThemeFile({ interface: 'new', tokens: mixed }))

        expect(Object.keys(file.tokens).sort()).toEqual(['accent', 'chartPalette', 'density', 'font', 'radius', 'tone'])
    })

    it('reads a file without an interface as a classic theme', () => {
        const result = parseThemeFile(JSON.stringify(classicFile))

        expect(result.ok && result.interface).toBe('classic')
    })

    it('fills missing tokens with the default of that interface and leaves the accent open', () => {
        expect(parseThemeFile(JSON.stringify({ ...classicFile, tokens: { radius: 8 } }))).toEqual({
            ok: true,
            name: null,
            interface: 'classic',
            accent: null,
            tokens: { ...defaultStoredThemeTokens(), radius: 8 },
        })
        expect(parseThemeFile(JSON.stringify({ ...shellFile, tokens: { tone: 'ink' } }))).toEqual({
            ok: true,
            name: null,
            interface: 'new',
            tokens: { ...defaultShellStoredTokens(), tone: 'ink' },
        })
    })

    it('rejects a theme that was made for the other interface', () => {
        expect(errorOf(classicFile, 'new')).toEqual({ code: 'otherInterface' })
        expect(errorOf(shellFile, 'classic')).toEqual({ code: 'otherInterface' })
        expect(errorOf({ ...shellFile, interface: 'kiosk' })).toEqual({
            code: 'invalidValue',
            key: 'interface',
            value: '"kiosk"',
        })
    })

    it('rejects files that are not a theme', () => {
        expect(errorOf('body { color: red }')).toEqual({ code: 'notJson' })
        expect(errorOf('')).toEqual({ code: 'notJson' })
        expect(errorOf([classicFile])).toEqual({ code: 'notTheme' })
        expect(errorOf('null')).toEqual({ code: 'notTheme' })
        expect(errorOf({ tokens: classicFile.tokens })).toEqual({ code: 'notTheme' })
        expect(errorOf({ ...classicFile, format: 'other' })).toEqual({ code: 'notTheme' })
        expect(errorOf({ ...classicFile, tokens: 'x' })).toEqual({ code: 'notTheme' })
    })

    it('rejects other versions', () => {
        expect(errorOf({ ...classicFile, version: 2 })).toEqual({ code: 'unsupportedVersion', value: '2' })
        expect(errorOf({ ...classicFile, version: '1' })).toEqual({ code: 'unsupportedVersion', value: '"1"' })
    })

    it('rejects oversized files before parsing them', () => {
        expect(errorOf(' '.repeat(MAX_THEME_FILE_SIZE + 1))).toEqual({ code: 'tooLarge' })
    })

    it('rejects unknown keys instead of ignoring them', () => {
        expect(errorOf({ ...classicFile, css: 'body{display:none}' })).toEqual({ code: 'unknownKey', key: 'css' })
        expect(errorOf({ ...classicFile, tokens: { ...classicFile.tokens, customCss: 'x' } })).toEqual({
            code: 'unknownKey',
            key: 'tokens.customCss',
        })
    })

    it('rejects tokens that belong to the other interface', () => {
        expect(errorOf({ ...shellFile, tokens: { ...shellFile.tokens, surface: 'flat' } })).toEqual({
            code: 'unknownKey',
            key: 'tokens.surface',
        })
        expect(errorOf({ ...classicFile, tokens: { ...classicFile.tokens, tone: 'ink' } })).toEqual({
            code: 'unknownKey',
            key: 'tokens.tone',
        })
    })

    it.each([
        ['accent', 'red'],
        ['accent', '#12345'],
        ['accent', '#12345g'],
        ['accent', 'url(javascript:alert(1))'],
        ['accent', '#123456; background: url(x)'],
        ['accent', 123456],
        ['radius', -1],
        ['radius', 25],
        ['radius', 4.5],
        ['radius', '4'],
        ['radius', '4px; position: fixed'],
        ['density', 'cozy'],
        ['density', null],
        ['surface', 'glass'],
        ['surface', ['flat']],
        ['tint', '#ff0000'],
        ['tint', true],
        ['font', 'Comic Sans MS'],
        ['font', 'mono'],
        ['font', 'x; } body { display: none'],
        ['font', 'https://example.com/font.woff2'],
        ['chartPalette', ['#ff0000']],
        ['chartPalette', 'toString'],
    ])('rejects an invalid classic %s: %j', (key, value) => {
        const error = errorOf({ ...classicFile, tokens: { ...classicFile.tokens, [key]: value } })

        expect(error).toEqual({ code: 'invalidValue', key, value: JSON.stringify(value).slice(0, 40) })
    })

    it.each([
        ['accent', 'rgb(1,2,3)'],
        ['radius', 1],
        ['radius', 17],
        ['radius', 8.5],
        ['density', 'tiny'],
        ['font', 'mono'],
        ['font', 'IBM Plex Mono'],
        ['chartPalette', 'neon'],
        ['tone', 'black'],
        ['tone', '#000000'],
        ['tone', 'constructor'],
    ])('rejects an invalid new-interface %s: %j', (key, value) => {
        const error = errorOf({ ...shellFile, tokens: { ...shellFile.tokens, [key]: value } })

        expect(error).toEqual({ code: 'invalidValue', key, value: JSON.stringify(value).slice(0, 40) })
    })

    it('rejects names that are not short text', () => {
        expect(errorOf({ ...classicFile, name: 5 }).code).toBe('invalidValue')
        expect(errorOf({ ...classicFile, name: 'x'.repeat(61) }).code).toBe('invalidValue')
    })

    it('does not accept inherited object keys as token values', () => {
        expect(errorOf({ ...classicFile, tokens: { ...classicFile.tokens, font: 'constructor' } }).code).toBe(
            'invalidValue'
        )
        expect(errorOf({ ...classicFile, tokens: { ...classicFile.tokens, density: '__proto__' } }).code).toBe(
            'invalidValue'
        )
    })
})
