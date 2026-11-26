import type { PrinterTempHistoryStateSourceEntry } from '@/store/printer/tempHistory/types'

export type TemperatureCardKind = 'heater' | 'fan' | 'sensor'
export type TemperatureCardState = 'heating' | 'atTarget' | 'cooling' | 'off' | 'sensor'
export type TemperatureTrend = 'rising' | 'falling' | 'steady'
export type TemperatureViewMode = 'cards' | 'table'

export interface TemperatureCardSettings {
    viewMode: TemperatureViewMode
    order: string[]
    hidden: string[]
    sparklineWindow: number
    chartExpanded: boolean
}

export interface TemperatureSample {
    time: number
    value: number
}

export interface SparklinePoint {
    // position inside the time window, 0 = oldest, 1 = now
    x: number
    value: number
}

export interface SparklineRange {
    min: number
    max: number
}

// a heater counts as "at target" within this distance (°C) on both sides
export const AT_TARGET_TOLERANCE = 2
// a switched off heater above this temperature (°C) is shown as cooling down instead of off
export const COOLING_MIN_TEMPERATURE = 40
// difference (°C) between the earlier and the recent half of the trend samples to call it rising or falling
export const TREND_THRESHOLD = 0.3
export const TREND_SECONDS = 60
// smallest temperature span (°C) of a sparkline, so sensor noise does not look like a temperature swing
export const SPARKLINE_MIN_SPAN = 10
export const SPARKLINE_PADDING = 2
export const SPARKLINE_MAX_POINTS = 60
export const DEFAULT_SPARKLINE_WINDOW = 300
export const sparklineWindows = [60, 300, 600, 1200]

const round = (value: number): number => Math.round(value * 10) / 10

const shortName = (fullName: string): string => {
    const splits = fullName.split(' ')

    return splits.length === 1 ? splits[0] : splits[1]
}

const sortByShortName = (a: string, b: string): number => {
    const nameA = shortName(a).toUpperCase()
    const nameB = shortName(b).toUpperCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1

    return 0
}

export const getTemperatureCardKind = (objectName: string, availableHeaters: string[]): TemperatureCardKind => {
    if (objectName.startsWith('temperature_fan')) return 'fan'
    if (availableHeaters.includes(objectName)) return 'heater'

    return 'sensor'
}

export const getTemperatureCardState = (input: {
    kind: TemperatureCardKind
    temperature: number | null
    target: number | null
}): TemperatureCardState => {
    const { kind, temperature, target } = input
    if (kind === 'sensor') return 'sensor'

    const hasTarget = target !== null && target > 0
    if (kind === 'fan') {
        if (!hasTarget) return 'off'

        // a temperature fan only cools: below its target there is nothing left to do
        return temperature !== null && temperature > target + AT_TARGET_TOLERANCE ? 'cooling' : 'atTarget'
    }

    if (!hasTarget) return temperature !== null && temperature >= COOLING_MIN_TEMPERATURE ? 'cooling' : 'off'
    if (temperature === null) return 'heating'
    if (Math.abs(temperature - target) <= AT_TARGET_TOLERANCE) return 'atTarget'

    return temperature < target ? 'heating' : 'cooling'
}

// signed distance to the target (negative = below), null without an active target
export const getTemperatureDelta = (temperature: number | null, target: number | null): number | null => {
    if (temperature === null || target === null || target <= 0) return null

    return round(temperature - target)
}

export const getTemperatureTrend = (values: number[]): TemperatureTrend => {
    if (values.length < 2) return 'steady'

    const mean = (list: number[]): number => list.reduce((sum, value) => sum + value, 0) / list.length
    const half = Math.floor(values.length / 2)
    const difference = mean(values.slice(-half)) - mean(values.slice(0, half))
    if (difference > TREND_THRESHOLD) return 'rising'
    if (difference < -TREND_THRESHOLD) return 'falling'

    return 'steady'
}

// readings of one sensor from the temperature history (oldest first) within the last windowSeconds
export const getTemperatureSamples = (
    source: PrinterTempHistoryStateSourceEntry[],
    objectName: string,
    windowSeconds: number,
    now?: number
): TemperatureSample[] => {
    if (!source.length) return []

    const key = `${objectName}-temperature`
    const end = now ?? source[source.length - 1].date.getTime()
    const start = end - windowSeconds * 1000
    const samples: TemperatureSample[] = []

    for (let index = source.length - 1; index >= 0; index--) {
        const time = source[index].date.getTime()
        if (time < start) break

        const value = source[index][key]
        if (typeof value === 'number' && time <= end) samples.push({ time, value })
    }

    return samples.reverse()
}

// averages the samples into at most maxPoints buckets between start and end (times in ms)
export const reduceSamples = (
    samples: TemperatureSample[],
    start: number,
    end: number,
    maxPoints: number = SPARKLINE_MAX_POINTS
): SparklinePoint[] => {
    const span = end - start
    if (span <= 0 || maxPoints <= 0) return []

    const buckets: { time: number; value: number; count: number }[] = []
    samples.forEach((sample) => {
        if (sample.time < start || sample.time > end) return

        const index = Math.min(maxPoints - 1, Math.floor(((sample.time - start) / span) * maxPoints))
        const bucket = (buckets[index] ??= { time: 0, value: 0, count: 0 })
        bucket.time += sample.time
        bucket.value += sample.value
        bucket.count++
    })

    const points: SparklinePoint[] = []
    buckets.forEach((bucket) => {
        points.push({ x: (bucket.time / bucket.count - start) / span, value: bucket.value / bucket.count })
    })

    return points
}

export const getSparklineRange = (values: number[], target: number | null): SparklineRange => {
    const all = target !== null && target > 0 ? [...values, target] : [...values]
    let min = all.length ? Math.min(...all) : 0
    let max = all.length ? Math.max(...all) : 0

    const missing = SPARKLINE_MIN_SPAN - (max - min)
    if (missing > 0) {
        min -= missing / 2
        max += missing / 2
    }

    return { min, max }
}

export const getSparklineY = (
    value: number,
    range: SparklineRange,
    height: number,
    padding: number = SPARKLINE_PADDING
): number => {
    const span = range.max - range.min
    const ratio = span > 0 ? (value - range.min) / span : 0.5

    return round(padding + (1 - ratio) * (height - 2 * padding))
}

// svg path data of the line and of the area below it
export const buildSparkline = (
    points: SparklinePoint[],
    range: SparklineRange,
    width: number,
    height: number,
    padding: number = SPARKLINE_PADDING
): { line: string; area: string } => {
    if (points.length < 2) return { line: '', area: '' }

    const coordinates = points.map((point) => ({
        x: round(point.x * width),
        y: getSparklineY(point.value, range, height, padding),
    }))
    const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
    const first = coordinates[0]
    const last = coordinates[coordinates.length - 1]

    return { line, area: `${line} L${last.x},${height} L${first.x},${height} Z` }
}

// the objects of the temperature table in its default order: heaters, temperature fans, sensors, monitors
export const getTemperatureCardObjects = (input: {
    heaters: string[]
    sensors: string[]
    monitors: string[]
    settings: Record<string, { sensor_type?: string } | undefined>
    hideMcuHostSensors: boolean
    hideMonitors: boolean
}): string[] => {
    const isVisibleName = (fullName: string): boolean => !shortName(fullName).startsWith('_')
    const isMcuHostSensor = (fullName: string): boolean => {
        const sensorType = input.settings[fullName.toLowerCase()]?.sensor_type ?? ''

        return ['temperature_mcu', 'temperature_host'].includes(sensorType)
    }

    const heaters = input.heaters.filter(isVisibleName).sort(sortByShortName)
    const fans = input.sensors
        .filter((name) => name.startsWith('temperature_fan') && isVisibleName(name))
        .sort(sortByShortName)
    const sensors = input.sensors
        .filter((name) => {
            if (!isVisibleName(name)) return false
            if (input.heaters.includes(name) || name.startsWith('temperature_fan')) return false

            return !(input.hideMcuHostSensors && isMcuHostSensor(name))
        })
        .sort(sortByShortName)
    const monitors = input.hideMonitors ? [] : [...input.monitors].sort(sortByShortName)

    return [...heaters, ...fans, ...sensors, ...monitors]
}

// the stored order first, then every card the stored order does not know yet
export const sortTemperatureCards = (names: string[], order: string[]): string[] => {
    const known = order.filter((name) => names.includes(name))

    return [...known, ...names.filter((name) => !known.includes(name))]
}

// new stored order after moving a card one place up (-1) or down (1)
export const moveTemperatureCard = (names: string[], order: string[], name: string, offset: -1 | 1): string[] => {
    const sorted = sortTemperatureCards(names, order)
    const from = sorted.indexOf(name)
    const to = from + offset
    if (from !== -1 && to >= 0 && to < sorted.length) {
        sorted.splice(from, 1)
        sorted.splice(to, 0, name)
    }

    // cards that are filtered out at the moment (e.g. hidden MCU sensors) stay in the stored order
    return [...sorted, ...order.filter((entry) => !sorted.includes(entry))]
}

export const getSparklineWindowOptions = (storeSize: number): number[] => {
    const options = sparklineWindows.filter((seconds) => seconds <= storeSize)

    return options.length ? options : [sparklineWindows[0]]
}

export const resolveSparklineWindow = (seconds: number, storeSize: number): number => {
    const options = getSparklineWindowOptions(storeSize)

    return options.includes(seconds) ? seconds : options[options.length - 1]
}

const toNameList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []

    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
}

// settings loaded from the database may lack keys or hold values of an older version
export const normalizeTemperatureCardSettings = (raw: unknown): TemperatureCardSettings => {
    const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const sparklineWindow = stored.sparklineWindow

    return {
        viewMode: stored.viewMode === 'table' ? 'table' : 'cards',
        order: toNameList(stored.order),
        hidden: toNameList(stored.hidden),
        sparklineWindow:
            typeof sparklineWindow === 'number' && sparklineWindows.includes(sparklineWindow)
                ? sparklineWindow
                : DEFAULT_SPARKLINE_WINDOW,
        chartExpanded: stored.chartExpanded === true,
    }
}
