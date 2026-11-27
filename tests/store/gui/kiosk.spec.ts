import { describe, expect, it } from 'vitest'
import { getDefaultState } from '@/store/gui'
import { getters } from '@/store/gui/getters'
import { mutations } from '@/store/gui/mutations'
import { createPinRecord, getDefaultKioskSettings, KioskSettings, verifyPin } from '@/plugins/kiosk'
import type { GuiState } from '@/store/gui/types'

type AnyFn = (...args: unknown[]) => unknown

const commit = (state: GuiState, name: string, payload: unknown) => (mutations[name] as AnyFn)(state, payload)
const kioskSettings = (state: GuiState) => (getters.getKioskSettings as AnyFn)(state) as KioskSettings

describe('gui.kiosk', () => {
    it('exposes everything, has no pin and only suggests the mode by default', () => {
        expect(kioskSettings(getDefaultState())).toEqual(getDefaultKioskSettings())
    })

    it('keeps the defaults when the stored settings were saved before the mode existed', () => {
        const state = getDefaultState()
        commit(state, 'setData', { uiSettings: { mode: 'light' }, dashboard: {} })

        expect(kioskSettings(state)).toEqual(getDefaultKioskSettings())
    })

    it('survives a stored value of the wrong type', () => {
        const state = getDefaultState()
        commit(state, 'setData', { kiosk: 'on' })

        expect(kioskSettings(state)).toEqual(getDefaultKioskSettings())
    })

    it('merges a single stored rule with the defaults', () => {
        const state = getDefaultState()
        commit(state, 'saveSetting', { name: 'kiosk.actions.cancelPrint', value: 'pin' })

        expect(kioskSettings(state).actions).toEqual({ ...getDefaultKioskSettings().actions, cancelPrint: 'pin' })
    })

    it('replaces the lists instead of merging them', () => {
        const state = getDefaultState()
        commit(state, 'saveSetting', { name: 'kiosk.hiddenPanels', value: ['webcam', 'miniconsole'] })
        commit(state, 'saveSetting', { name: 'kiosk.hiddenPanels', value: ['webcam'] })
        commit(state, 'saveSetting', { name: 'kiosk.bottomBar', value: ['dashboard', 'history'] })

        expect(kioskSettings(state).hiddenPanels).toEqual(['webcam'])
        expect(kioskSettings(state).bottomBar).toEqual(['dashboard', 'history'])
    })

    it('stores, replaces and removes the pin record', () => {
        const state = getDefaultState()
        commit(state, 'saveSetting', { name: 'kiosk.pin', value: createPinRecord('4821', 'aa') })
        expect(verifyPin('4821', kioskSettings(state).pin)).toBe(true)

        commit(state, 'saveSetting', { name: 'kiosk.pin', value: createPinRecord('9999', 'bb') })
        expect(verifyPin('4821', kioskSettings(state).pin)).toBe(false)
        expect(verifyPin('9999', kioskSettings(state).pin)).toBe(true)

        commit(state, 'saveSetting', { name: 'kiosk.pin', value: null })
        expect(kioskSettings(state).pin).toBe(null)
    })
})
