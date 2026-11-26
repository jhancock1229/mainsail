import { describe, expect, it } from 'vitest'
import SettingsGeneralDatabase from '@/components/mixins/settingsGeneralDatabase'
import { getDefaultState } from '@/store/gui'

const createMixin = () => {
    const mixin = new SettingsGeneralDatabase()
    Object.defineProperty(mixin, '$t', { value: (key: string) => key })

    return mixin
}

describe('SettingsGeneralDatabase', () => {
    it('offers every top-level key of the gui store for backup, restore and reset', () => {
        const values = createMixin().availableKeys.map((entry) => entry.value)

        Object.keys(getDefaultState()).forEach((key) => expect(values).toContain(key))
    })

    it('offers the notification rules with their own label', () => {
        const entry = createMixin().availableKeys.find((entry) => entry.value === 'alerts')

        expect(entry?.label).toBe('Settings.GeneralTab.DbAlerts')
    })
})
