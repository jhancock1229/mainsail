import { afterEach, describe, expect, it, vi } from 'vitest'
import { actions } from '@/store/printer/tempHistory/actions'
import { chartPalettes } from '@/plugins/themeTokens'
import { colorArray, colorHeaterBed } from '@/store/variables'
import { mutations } from '@/store/printer/tempHistory/mutations'
import { getDefaultState } from '@/store/printer/tempHistory'
import type { PrinterTempHistoryState } from '@/store/printer/tempHistory/types'

type AnyFn = (...args: unknown[]) => unknown

const apply = (seriesNames: string[], stored: Record<string, string>, palette: string, dark: boolean) => {
    const commits: { name: string; value: string }[] = []
    const context = {
        state: { series: seriesNames.map((name) => ({ name })) },
        rootGetters: {
            'gui/getDatasetValue': ({ name, type }: { name: string; type: string }) =>
                type === 'color' ? (stored[name] ?? false) : true,
        },
        commit: (mutation: string, payload: { name: string; value: string }) => {
            if (mutation === 'setColor') commits.push(payload)
        },
    }
    ;(actions.applyChartPalette as AnyFn)(context, { palette, dark })

    return Object.fromEntries(commits.map((commit) => [commit.name, commit.value]))
}

const series = [
    'heater_bed-temperature',
    'heater_bed-target',
    'heater_bed-power',
    'extruder-temperature',
    'extruder-target',
    'temperature_sensor mcu-temperature',
]

describe('printer/tempHistory applyChartPalette', () => {
    it('gives every sensor the colour the chart had before palettes existed', () => {
        expect(apply(series, {}, 'classic', true)).toEqual({
            extruder: colorArray[0],
            heater_bed: colorHeaterBed,
            'temperature_sensor mcu': colorArray[1],
        })
    })

    it('recolours the sensors from the chosen palette and mode', () => {
        const palette = chartPalettes.vivid.light

        expect(apply(series, {}, 'vivid', false)).toEqual({
            extruder: palette.series[0],
            heater_bed: palette.bed,
            'temperature_sensor mcu': palette.series[1],
        })
    })

    it('leaves a colour alone that the user picked for a sensor', () => {
        expect(apply(series, { extruder: '#123456' }, 'soft', true).extruder).toBe('#123456')
    })
})

describe('printer/tempHistory init', () => {
    const createStore = () => {
        const state = getDefaultState()
        const context = {
            state,
            rootGetters: {
                'printer/getAvailableHeaters': ['extruder', 'heater_bed'],
                'printer/getAvailableSensors': ['extruder', 'heater_bed'],
                'printer/getAvailableMonitors': [],
                'printer/tempHistory/getTemperatureStoreSize': 3,
                'gui/getDatasetValue': ({ type }: { type: string }) => type !== 'color',
            },
            commit: (name: string, payload: unknown) => (mutations[name] as AnyFn)(state, payload),
            dispatch: (name: string, payload: unknown) =>
                name.includes('/') ? undefined : (actions[name] as AnyFn)(context, payload),
        }

        return context
    }
    const history = () => ({
        extruder: { temperatures: [20, 21, 22], targets: [0, 0, 0] },
        heater_bed: { temperatures: [20, 21, 22], targets: [0, 0, 0] },
    })
    const colorOf = (state: PrinterTempHistoryState, name: string) =>
        state.series.find((serie) => serie.name === `${name}-temperature`)?.lineStyle.color

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps the chosen palette when the temperature history is loaded again', () => {
        vi.stubGlobal('window', { console: { debug: () => undefined } })
        const store = createStore()

        store.dispatch('init', history())
        expect(colorOf(store.state, 'heater_bed')).toBe(colorHeaterBed)

        store.dispatch('applyChartPalette', { palette: 'vivid', dark: true })
        expect(colorOf(store.state, 'heater_bed')).toBe(chartPalettes.vivid.dark.bed)

        store.dispatch('init', history())
        expect(colorOf(store.state, 'heater_bed')).toBe(chartPalettes.vivid.dark.bed)
        expect(colorOf(store.state, 'extruder')).toBe(chartPalettes.vivid.dark.series[0])
        expect(store.state.chartPalette).toEqual({ palette: 'vivid', dark: true })

        store.dispatch('reset', undefined)
    })
})
