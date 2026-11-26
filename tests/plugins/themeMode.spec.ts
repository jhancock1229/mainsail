import { describe, expect, it } from 'vitest'
import { resolveDarkMode, toggledThemeMode } from '@/plugins/themeMode'

describe('resolveDarkMode', () => {
    it('follows an explicit mode whatever the system prefers', () => {
        expect(resolveDarkMode('dark', false)).toBe(true)
        expect(resolveDarkMode('dark', true)).toBe(true)
        expect(resolveDarkMode('light', true)).toBe(false)
        expect(resolveDarkMode('light', false)).toBe(false)
    })

    it('follows the system in auto mode', () => {
        expect(resolveDarkMode('auto', true)).toBe(true)
        expect(resolveDarkMode('auto', false)).toBe(false)
    })

    it('falls back to dark for a missing or unknown mode', () => {
        expect(resolveDarkMode(undefined, false)).toBe(true)
        expect(resolveDarkMode('sepia', false)).toBe(true)
    })
})

describe('toggledThemeMode', () => {
    it('switches between dark and light', () => {
        expect(toggledThemeMode('dark', false)).toBe('light')
        expect(toggledThemeMode('light', true)).toBe('dark')
    })

    it('switches away from what auto currently shows', () => {
        expect(toggledThemeMode('auto', true)).toBe('light')
        expect(toggledThemeMode('auto', false)).toBe('dark')
    })
})
