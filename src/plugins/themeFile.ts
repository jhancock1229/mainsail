import {
    isAccentColor,
    isRecord,
    isValidThemeToken,
    defaultStoredThemeTokens,
    pickValidTokens,
    ThemeStoredTokens,
    tokenNames,
} from '@/plugins/themeTokens'
import {
    defaultShellStoredTokens,
    isValidShellToken,
    pickValidShellTokens,
    SHELL_DEFAULT_ACCENT,
    ShellStoredTokens,
    shellTokenNames,
} from '@/plugins/shellTheme'
import type { InterfaceShell } from '@/plugins/shellNavigation'

export const MAX_THEME_FILE_SIZE = 4096
export const MAX_THEME_NAME_LENGTH = 60
export const THEME_FILE_FORMAT = 'mainsail-theme'
export const THEME_FILE_VERSION = 1

const MAX_ERROR_VALUE_LENGTH = 40
const FILE_KEYS = ['format', 'version', 'interface', 'name', 'tokens']

export type ThemeFileErrorCode =
    'tooLarge' | 'notJson' | 'notTheme' | 'unsupportedVersion' | 'unknownKey' | 'invalidValue' | 'otherInterface'

export interface ThemeFileError {
    code: ThemeFileErrorCode
    key?: string
    value?: string
}

export type ThemeFileContent =
    | { interface: 'classic'; accent: string | null; tokens: ThemeStoredTokens }
    | { interface: 'new'; tokens: ShellStoredTokens }

export type ThemeFileResult =
    ({ ok: true; name: string | null } & ThemeFileContent) | { ok: false; error: ThemeFileError }

const describeValue = (value: unknown): string =>
    (JSON.stringify(value) ?? 'undefined').slice(0, MAX_ERROR_VALUE_LENGTH)

const fail = (error: ThemeFileError): ThemeFileResult => ({ ok: false, error })

const fileTokenNames = (target: InterfaceShell): string[] => (target === 'new' ? shellTokenNames : tokenNames)

const isValidFileToken = (target: InterfaceShell, name: string, value: unknown): boolean => {
    if (name === 'accent') return isAccentColor(value)

    return target === 'new'
        ? isValidShellToken(name as (typeof shellTokenNames)[number], value)
        : isValidThemeToken(name as (typeof tokenNames)[number], value)
}

export const exportThemeFile = (content: ThemeFileContent, name?: string): string => {
    const file: Record<string, unknown> = {
        format: THEME_FILE_FORMAT,
        version: THEME_FILE_VERSION,
        interface: content.interface,
    }
    if (name) file.name = name.slice(0, MAX_THEME_NAME_LENGTH)

    const accent = content.interface === 'new' ? content.tokens.accent : content.accent
    const values: Record<string, unknown> = { ...content.tokens, accent: accent?.toLowerCase() }
    const customAccent = isAccentColor(accent)

    file.tokens = Object.fromEntries(
        fileTokenNames(content.interface)
            .filter((key) => key !== 'accent' || customAccent)
            .map((key) => [key, values[key]])
    )

    return JSON.stringify(file, null, 4)
}

export const parseThemeFile = (text: string, expected?: InterfaceShell): ThemeFileResult => {
    if (text.length > MAX_THEME_FILE_SIZE) return fail({ code: 'tooLarge' })

    let file: unknown
    try {
        file = JSON.parse(text)
    } catch {
        return fail({ code: 'notJson' })
    }

    if (!isRecord(file) || file.format !== THEME_FILE_FORMAT || !isRecord(file.tokens))
        return fail({ code: 'notTheme' })
    if (file.version !== THEME_FILE_VERSION)
        return fail({ code: 'unsupportedVersion', value: describeValue(file.version) })

    const unknownKey = Object.keys(file).find((key) => !FILE_KEYS.includes(key))
    if (unknownKey !== undefined) return fail({ code: 'unknownKey', key: unknownKey })

    const target = file.interface ?? 'classic'
    if (target !== 'classic' && target !== 'new')
        return fail({ code: 'invalidValue', key: 'interface', value: describeValue(target) })
    if (expected !== undefined && target !== expected) return fail({ code: 'otherInterface' })

    const name = file.name ?? null
    if (name !== null && (typeof name !== 'string' || name.length > MAX_THEME_NAME_LENGTH))
        return fail({ code: 'invalidValue', key: 'name', value: describeValue(name) })

    const fileTokens = file.tokens
    const names = fileTokenNames(target)
    const unknownToken = Object.keys(fileTokens).find((key) => !names.includes(key))
    if (unknownToken !== undefined) return fail({ code: 'unknownKey', key: `tokens.${unknownToken}` })

    const invalidToken = names.find(
        (key) =>
            Object.prototype.hasOwnProperty.call(fileTokens, key) && !isValidFileToken(target, key, fileTokens[key])
    )
    if (invalidToken !== undefined)
        return fail({ code: 'invalidValue', key: invalidToken, value: describeValue(fileTokens[invalidToken]) })

    const accent = isAccentColor(fileTokens.accent) ? fileTokens.accent.toLowerCase() : null

    if (target === 'new')
        return {
            ok: true,
            name,
            interface: 'new',
            tokens: {
                ...defaultShellStoredTokens(),
                ...pickValidShellTokens(fileTokens),
                accent: accent ?? SHELL_DEFAULT_ACCENT,
            },
        }

    return {
        ok: true,
        name,
        interface: 'classic',
        accent,
        tokens: { ...defaultStoredThemeTokens(), ...pickValidTokens(fileTokens) },
    }
}
