import { describe, expect, it } from 'vitest'
import { actions } from '@/store/printer/tempHistory/actions'
import { chartPalettes } from '@/plugins/themeTokens'
import { colorArray, colorHeaterBed } from '@/store/variables'

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
