import { describe, expect, it } from 'vitest'
import {
    AT_TARGET_TOLERANCE,
    COOLING_MIN_TEMPERATURE,
    DEFAULT_SPARKLINE_WINDOW,
    SPARKLINE_MIN_SPAN,
    areAllTemperatureCardsHidden,
    buildSparkline,
    getDefaultTemperatureCardSettings,
    getSparklineRange,
    getSparklineWindowOptions,
    getSparklineY,
    getTemperatureCardKind,
    getTemperatureCardLabels,
    getTemperatureCardObjects,
    getTemperatureCardState,
    getTemperatureDelta,
    getTemperatureSamples,
    getTemperatureTrend,
    moveTemperatureCard,
    normalizeTemperatureCardSettings,
    reduceSamples,
    resolveSparklineWindow,
    sortTemperatureCards,
} from '@/plugins/temperatureCards'
import type { PrinterTempHistoryStateSourceEntry } from '@/store/printer/tempHistory/types'
import { getDefaultState } from '@/store/gui'

describe('getTemperatureCardKind', () => {
    const heaters = ['extruder', 'heater_bed', 'heater_generic chamber_heater']

    it('recognizes heaters, temperature fans and plain sensors', () => {
        expect(getTemperatureCardKind('extruder', heaters)).toBe('heater')
        expect(getTemperatureCardKind('heater_generic chamber_heater', heaters)).toBe('heater')
        expect(getTemperatureCardKind('temperature_fan electronics', heaters)).toBe('fan')
        expect(getTemperatureCardKind('temperature_sensor chamber', heaters)).toBe('sensor')
        expect(getTemperatureCardKind('tmc2240 stepper_x', heaters)).toBe('sensor')
    })
})

describe('getTemperatureCardState', () => {
    const heater = (temperature: number | null, target: number | null) =>
        getTemperatureCardState({ kind: 'heater', temperature, target })
    const fan = (temperature: number | null, target: number | null) =>
        getTemperatureCardState({ kind: 'fan', temperature, target })

    it('reports heating while a heater is below its target', () => {
        expect(heater(22, 210)).toBe('heating')
        expect(heater(210 - AT_TARGET_TOLERANCE - 0.1, 210)).toBe('heating')
    })

    it('reports at target within the tolerance on both sides', () => {
        expect(heater(210, 210)).toBe('atTarget')
        expect(heater(210 - AT_TARGET_TOLERANCE, 210)).toBe('atTarget')
        expect(heater(210 + AT_TARGET_TOLERANCE, 210)).toBe('atTarget')
    })

    it('reports cooling while a heater is above a lowered target', () => {
        expect(heater(240, 210)).toBe('cooling')
    })

    it('reports cooling for a switched off heater that is still hot', () => {
        expect(heater(180, 0)).toBe('cooling')
        expect(heater(COOLING_MIN_TEMPERATURE, 0)).toBe('cooling')
    })

    it('reports off for a switched off heater near room temperature', () => {
        expect(heater(22, 0)).toBe('off')
        expect(heater(COOLING_MIN_TEMPERATURE - 0.1, 0)).toBe('off')
    })

    it('does not guess from missing data', () => {
        expect(heater(null, 0)).toBe('off')
        expect(heater(null, 210)).toBe('heating')
        expect(heater(null, null)).toBe('off')
    })

    it('treats a temperature fan as a cooler: above the target it cools, otherwise it is at target', () => {
        expect(fan(55, 45)).toBe('cooling')
        expect(fan(45, 45)).toBe('atTarget')
        expect(fan(30, 45)).toBe('atTarget')
        expect(fan(60, 0)).toBe('off')
    })

    it('reports sensor for objects without a target', () => {
        expect(getTemperatureCardState({ kind: 'sensor', temperature: 35, target: null })).toBe('sensor')
        expect(getTemperatureCardState({ kind: 'sensor', temperature: null, target: null })).toBe('sensor')
    })
})

describe('getTemperatureDelta', () => {
    it('returns the signed distance to an active target, rounded to one decimal', () => {
        expect(getTemperatureDelta(187.44, 210)).toBe(-22.6)
        expect(getTemperatureDelta(212.06, 210)).toBe(2.1)
        expect(getTemperatureDelta(210, 210)).toBe(0)
    })

    it('returns null without an active target or without a reading', () => {
        expect(getTemperatureDelta(50, 0)).toBeNull()
        expect(getTemperatureDelta(50, null)).toBeNull()
        expect(getTemperatureDelta(null, 210)).toBeNull()
    })
})

describe('getTemperatureTrend', () => {
    it('reports rising and falling when the recent half differs from the earlier half', () => {
        expect(getTemperatureTrend([30, 30.5, 31, 31.5, 32, 32.5])).toBe('rising')
        expect(getTemperatureTrend([32.5, 32, 31.5, 31, 30.5, 30])).toBe('falling')
    })

    it('reports steady for noise and for too little data', () => {
        expect(getTemperatureTrend([30, 30.1, 29.9, 30, 30.1, 29.9])).toBe('steady')
        expect(getTemperatureTrend([30])).toBe('steady')
        expect(getTemperatureTrend([])).toBe('steady')
    })
})

describe('getTemperatureSamples', () => {
    const now = new Date('2026-01-01T12:00:00Z').getTime()
    const source: PrinterTempHistoryStateSourceEntry[] = Array.from({ length: 100 }, (_, index) => ({
        date: new Date(now - (99 - index) * 1000),
        'extruder-temperature': index < 10 ? null : index,
        'extruder-target': 210,
    }))

    it('returns the samples inside the time window, oldest first', () => {
        const samples = getTemperatureSamples(source, 'extruder', 30)

        expect(samples).toHaveLength(31)
        expect(samples[0]).toEqual({ time: now - 30000, value: 69 })
        expect(samples[samples.length - 1]).toEqual({ time: now, value: 99 })
    })

    it('skips entries without a reading', () => {
        const samples = getTemperatureSamples(source, 'extruder', 1000)

        expect(samples).toHaveLength(90)
        expect(samples[0].value).toBe(10)
    })

    it('measures the window from the given time', () => {
        const samples = getTemperatureSamples(source, 'extruder', 30, now + 20000)

        expect(samples).toHaveLength(11)
        expect(samples[0].value).toBe(89)
    })

    it('returns nothing for an unknown sensor or an empty history', () => {
        expect(getTemperatureSamples(source, 'heater_bed', 30)).toEqual([])
        expect(getTemperatureSamples([], 'extruder', 30)).toEqual([])
    })
})

describe('reduceSamples', () => {
    const samples = Array.from({ length: 300 }, (_, index) => ({ time: 1000 + index * 1000, value: index }))

    it('averages the samples into at most maxPoints buckets across the window', () => {
        const points = reduceSamples(samples, 1000, 301000, 60)

        expect(points).toHaveLength(60)
        expect(points[0]).toEqual({ x: 2000 / 300000, value: 2 })
        expect(points[59].value).toBe(297)
        points.forEach((point) => {
            expect(point.x).toBeGreaterThanOrEqual(0)
            expect(point.x).toBeLessThanOrEqual(1)
        })
    })

    it('keeps the points in time order', () => {
        const xs = reduceSamples(samples, 1000, 301000, 60).map((point) => point.x)

        expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    })

    it('leaves gaps for buckets without samples, so a short history is not stretched', () => {
        const recent = samples.slice(-30)
        const points = reduceSamples(recent, 1000, 301000, 60)

        expect(points).toHaveLength(6)
        expect(points[0].x).toBeGreaterThan(0.89)
    })

    it('returns nothing for no samples or an empty window', () => {
        expect(reduceSamples([], 0, 1000, 60)).toEqual([])
        expect(reduceSamples(samples, 1000, 1000, 60)).toEqual([])
    })
})

describe('getSparklineRange', () => {
    it('covers the values and an active target', () => {
        expect(getSparklineRange([20, 180], 210)).toEqual({ min: 20, max: 210 })
        expect(getSparklineRange([20, 240], 210)).toEqual({ min: 20, max: 240 })
    })

    it('ignores a missing or switched off target', () => {
        expect(getSparklineRange([20, 180], 0)).toEqual({ min: 20, max: 180 })
        expect(getSparklineRange([20, 180], null)).toEqual({ min: 20, max: 180 })
    })

    it('never zooms in further than the minimum span, so sensor noise stays flat', () => {
        const range = getSparklineRange([29.9, 30.1], null)

        expect(range.max - range.min).toBe(SPARKLINE_MIN_SPAN)
        expect((range.max + range.min) / 2).toBeCloseTo(30)
    })

    it('returns a usable range without values', () => {
        const range = getSparklineRange([], null)

        expect(range.max - range.min).toBe(SPARKLINE_MIN_SPAN)
    })
})

describe('buildSparkline', () => {
    const range = { min: 0, max: 100 }

    it('maps points to an svg path, with higher temperatures further up', () => {
        const sparkline = buildSparkline(
            [
                { x: 0, value: 0 },
                { x: 0.5, value: 50 },
                { x: 1, value: 100 },
            ],
            range,
            100,
            40
        )

        expect(sparkline.line).toBe('M0,38 L50,20 L100,2')
        expect(sparkline.area).toBe('M0,38 L50,20 L100,2 L100,40 L0,40 Z')
    })

    it('returns empty paths for fewer than two points', () => {
        expect(buildSparkline([], range, 100, 40)).toEqual({ line: '', area: '' })
        expect(buildSparkline([{ x: 1, value: 50 }], range, 100, 40)).toEqual({ line: '', area: '' })
    })

    it('places a value on the same scale as the path', () => {
        expect(getSparklineY(100, range, 40)).toBe(2)
        expect(getSparklineY(0, range, 40)).toBe(38)
        expect(getSparklineY(50, range, 40)).toBe(20)
    })
})

describe('getTemperatureCardObjects', () => {
    const input = {
        heaters: ['heater_bed', 'extruder'],
        sensors: [
            'heater_bed',
            'extruder',
            'temperature_sensor mcu',
            'temperature_fan electronics',
            'temperature_sensor chamber',
            'temperature_sensor _hidden',
            'temperature_fan _hidden_fan',
        ],
        monitors: ['tmc2240 stepper_x'],
        settings: {
            'temperature_sensor mcu': { sensor_type: 'temperature_mcu' },
            'temperature_sensor chamber': { sensor_type: 'Generic 3950' },
        },
        hideMcuHostSensors: false,
        hideMonitors: false,
    }

    it('lists heaters, temperature fans, sensors and monitors like the table does', () => {
        expect(getTemperatureCardObjects(input)).toEqual([
            'extruder',
            'heater_bed',
            'temperature_fan electronics',
            'temperature_sensor chamber',
            'temperature_sensor mcu',
            'tmc2240 stepper_x',
        ])
    })

    it('honours the existing options to hide MCU/host sensors and monitors', () => {
        const names = getTemperatureCardObjects({ ...input, hideMcuHostSensors: true, hideMonitors: true })

        expect(names).not.toContain('temperature_sensor mcu')
        expect(names).not.toContain('tmc2240 stepper_x')
        expect(names).toContain('temperature_sensor chamber')
    })

    it('copes with missing printer data', () => {
        expect(
            getTemperatureCardObjects({
                heaters: [],
                sensors: [],
                monitors: [],
                settings: {},
                hideMcuHostSensors: false,
                hideMonitors: false,
            })
        ).toEqual([])
    })
})

describe('sortTemperatureCards', () => {
    const names = ['extruder', 'heater_bed', 'temperature_sensor chamber', 'temperature_sensor mcu']

    it('keeps the default order without a stored order', () => {
        expect(sortTemperatureCards(names, [])).toEqual(names)
    })

    it('applies the stored order and appends sensors it does not know yet', () => {
        expect(sortTemperatureCards(names, ['temperature_sensor chamber', 'extruder'])).toEqual([
            'temperature_sensor chamber',
            'extruder',
            'heater_bed',
            'temperature_sensor mcu',
        ])
    })

    it('ignores stored sensors that no longer exist', () => {
        expect(sortTemperatureCards(names, ['temperature_sensor gone', 'heater_bed'])).toEqual([
            'heater_bed',
            'extruder',
            'temperature_sensor chamber',
            'temperature_sensor mcu',
        ])
    })
})

describe('moveTemperatureCard', () => {
    const names = ['extruder', 'heater_bed', 'temperature_sensor chamber']

    it('moves a card one place up or down', () => {
        expect(moveTemperatureCard(names, [], 'heater_bed', -1)).toEqual([
            'heater_bed',
            'extruder',
            'temperature_sensor chamber',
        ])
        expect(moveTemperatureCard(names, [], 'heater_bed', 1)).toEqual([
            'extruder',
            'temperature_sensor chamber',
            'heater_bed',
        ])
    })

    it('keeps the order at the ends and for unknown cards', () => {
        expect(moveTemperatureCard(names, [], 'extruder', -1)).toEqual(names)
        expect(moveTemperatureCard(names, [], 'temperature_sensor chamber', 1)).toEqual(names)
        expect(moveTemperatureCard(names, [], 'unknown', 1)).toEqual(names)
    })

    it('keeps the stored place of sensors that are currently filtered out', () => {
        const mcu = 'temperature_sensor mcu'

        expect(moveTemperatureCard(names, [mcu, 'extruder', 'heater_bed', names[2]], 'heater_bed', -1)).toEqual([
            mcu,
            'heater_bed',
            'extruder',
            names[2],
        ])
        expect(moveTemperatureCard(names, ['extruder', mcu, 'heater_bed', names[2]], 'heater_bed', -1)).toEqual([
            'heater_bed',
            mcu,
            'extruder',
            names[2],
        ])
        expect(moveTemperatureCard(names, ['extruder', mcu, 'heater_bed', names[2]], 'extruder', 1)).toEqual([
            'heater_bed',
            mcu,
            'extruder',
            names[2],
        ])
    })

    it('adds cards the stored order does not know yet behind it', () => {
        expect(moveTemperatureCard(names, ['heater_bed'], 'temperature_sensor chamber', -1)).toEqual([
            'heater_bed',
            'temperature_sensor chamber',
            'extruder',
        ])
    })

    it('does not change a stored order at its ends', () => {
        const order = ['temperature_sensor mcu', 'extruder', 'heater_bed', 'temperature_sensor chamber']

        expect(moveTemperatureCard(names, order, 'extruder', -1)).toEqual(order)
        expect(moveTemperatureCard(names, order, 'temperature_sensor chamber', 1)).toEqual(order)
    })
})

describe('areAllTemperatureCardsHidden', () => {
    const names = ['extruder', 'heater_bed']

    it('is true when the user has hidden every card', () => {
        expect(areAllTemperatureCardsHidden(names, ['heater_bed', 'extruder'])).toBe(true)
        expect(areAllTemperatureCardsHidden(names, ['heater_bed', 'extruder', 'temperature_sensor gone'])).toBe(true)
    })

    it('is false while a card is shown', () => {
        expect(areAllTemperatureCardsHidden(names, [])).toBe(false)
        expect(areAllTemperatureCardsHidden(names, ['extruder'])).toBe(false)
    })

    it('is false when there is nothing the user could have hidden', () => {
        expect(areAllTemperatureCardsHidden([], [])).toBe(false)
        expect(areAllTemperatureCardsHidden([], ['extruder'])).toBe(false)
    })
})

describe('getTemperatureCardLabels', () => {
    it('names a card like the table does', () => {
        expect(getTemperatureCardLabels(['extruder', 'heater_bed', 'temperature_sensor mcu_temp'])).toEqual([
            { objectName: 'extruder', name: 'extruder', type: null },
            { objectName: 'heater_bed', name: 'heater_bed', type: null },
            { objectName: 'temperature_sensor mcu_temp', name: 'mcu_temp', type: null },
        ])
    })

    it('adds the type to cards that would otherwise have the same name', () => {
        expect(getTemperatureCardLabels(['heater_generic chamber', 'temperature_sensor Chamber', 'extruder'])).toEqual([
            { objectName: 'heater_generic chamber', name: 'chamber', type: 'heater_generic' },
            { objectName: 'temperature_sensor Chamber', name: 'Chamber', type: 'temperature_sensor' },
            { objectName: 'extruder', name: 'extruder', type: null },
        ])
    })
})

describe('sparkline window', () => {
    it('offers the windows that fit into the temperature store', () => {
        expect(getSparklineWindowOptions(1200)).toEqual([60, 300, 600, 1200])
        expect(getSparklineWindowOptions(600)).toEqual([60, 300, 600])
        expect(getSparklineWindowOptions(10)).toEqual([60])
    })

    it('falls back to the largest window the temperature store can serve', () => {
        expect(resolveSparklineWindow(300, 1200)).toBe(300)
        expect(resolveSparklineWindow(1200, 600)).toBe(600)
        expect(resolveSparklineWindow(1200, 10)).toBe(60)
    })
})

describe('normalizeTemperatureCardSettings', () => {
    const defaults = {
        viewMode: 'cards',
        order: [],
        hidden: [],
        sparklineWindow: DEFAULT_SPARKLINE_WINDOW,
        chartExpanded: true,
    }

    it('provides the defaults', () => {
        expect(getDefaultTemperatureCardSettings()).toEqual(defaults)
        expect(getDefaultTemperatureCardSettings()).not.toBe(getDefaultTemperatureCardSettings())
    })

    it('returns the defaults for settings stored before the cards existed', () => {
        expect(normalizeTemperatureCardSettings(undefined)).toEqual(defaults)
        expect(normalizeTemperatureCardSettings(null)).toEqual(defaults)
        expect(normalizeTemperatureCardSettings({})).toEqual(defaults)
    })

    it('keeps valid stored values', () => {
        const stored = {
            viewMode: 'table',
            order: ['heater_bed', 'extruder'],
            hidden: ['temperature_sensor mcu'],
            sparklineWindow: 600,
            chartExpanded: false,
        }

        expect(normalizeTemperatureCardSettings(stored)).toEqual(stored)
    })

    it('replaces invalid stored values with the defaults', () => {
        expect(
            normalizeTemperatureCardSettings({
                viewMode: 'grid',
                order: 'extruder',
                hidden: [1, 'heater_bed', null, 'heater_bed'],
                sparklineWindow: 42,
                chartExpanded: 'yes',
            })
        ).toEqual({ ...defaults, hidden: ['heater_bed'] })
    })

    it('is the default state of the gui store', () => {
        expect(getDefaultState().view.temperatureCards).toEqual(defaults)
    })
})
