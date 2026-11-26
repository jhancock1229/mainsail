import { describe, expect, it } from 'vitest'
import { getDefaultState } from '@/store/gui'
import { mutations } from '@/store/gui/mutations'
import { sanitizePaletteSettings } from '@/plugins/commandPalette'
import type { GuiState } from '@/store/gui/types'

type AnyFn = (...args: unknown[]) => unknown

const commit = (state: GuiState, name: string, payload: unknown) => (mutations[name] as AnyFn)(state, payload)

describe('gui.commandPalette', () => {
    it('is enabled with Ctrl/Cmd+K and nothing pinned by default', () => {
        expect(getDefaultState().commandPalette).toEqual({ enabled: true, shortcut: 'mod+k', pinned: [], recent: [] })
    })

    it('keeps the defaults when the stored settings were saved before the palette existed', () => {
        const state = getDefaultState()
        commit(state, 'setData', { uiSettings: { mode: 'light' }, dashboard: {} })

        expect(sanitizePaletteSettings(state.commandPalette)).toEqual({
            enabled: true,
            shortcut: 'mod+k',
            pinned: [],
            recent: [],
        })
    })

    it('merges partly stored settings with the defaults', () => {
        const state = getDefaultState()
        commit(state, 'setData', { commandPalette: { pinned: ['action:home'] } })

        expect(sanitizePaletteSettings(state.commandPalette)).toEqual({
            enabled: true,
            shortcut: 'mod+k',
            pinned: ['action:home'],
            recent: [],
        })
    })

    it('replaces the pinned list instead of merging it when a command is unpinned', () => {
        const state = getDefaultState()
        commit(state, 'saveSetting', { name: 'commandPalette.pinned', value: ['action:home', 'nav:/console'] })
        commit(state, 'saveSetting', { name: 'commandPalette.pinned', value: ['nav:/console'] })

        expect(state.commandPalette.pinned).toEqual(['nav:/console'])
    })

    it('survives broken stored settings', () => {
        const state = getDefaultState()
        commit(state, 'setData', { commandPalette: { enabled: null, shortcut: 'k', pinned: null, recent: 'x' } })

        expect(sanitizePaletteSettings(state.commandPalette)).toEqual({
            enabled: true,
            shortcut: 'mod+k',
            pinned: [],
            recent: [],
        })
    })
})
