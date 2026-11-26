export type ShellHomeState = 'idle' | 'printing' | 'paused' | 'finished' | 'error'
export type HeatStatus = 'onTarget' | 'heating' | 'cooling' | 'hot' | 'off'
export type SensorTrend = 'rising' | 'falling' | 'steady'

export interface ShellHeadline {
    key: string
    params: Record<string, number | string>
}

const ON_TARGET_TOLERANCE = 2
const HOT_WITHOUT_TARGET = 45
const TREND_TOLERANCE = 0.5
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

interface PrinterStates {
    klipperState: string
    printerState: string
    filename: string
}

export const resolveShellHomeState = (input: PrinterStates): ShellHomeState => {
    if (input.klipperState !== 'ready') return 'error'

    if (input.printerState === 'printing') return 'printing'
    if (input.printerState === 'paused') return 'paused'
    if (input.filename === '') return 'idle'
    if (input.printerState === 'error') return 'error'
    if (['complete', 'cancelled'].includes(input.printerState)) return 'finished'

    return 'idle'
}

const klipperHeadlines: Record<string, string> = {
    shutdown: 'Shutdown',
    error: 'KlipperError',
    startup: 'Startup',
    disconnected: 'Disconnected',
}

export const resolveShellHeadline = (input: PrinterStates & { percent: number; warmingUp: boolean }): ShellHeadline => {
    if (input.klipperState !== 'ready') {
        return { key: klipperHeadlines[input.klipperState] ?? 'Disconnected', params: {} }
    }

    const state = resolveShellHomeState(input)
    if (state === 'printing') {
        return input.warmingUp
            ? { key: 'WarmingUp', params: {} }
            : { key: 'Printing', params: { percent: input.percent } }
    }
    if (state === 'paused') return { key: 'Paused', params: { percent: input.percent } }
    if (state === 'error') return { key: 'PrintFailed', params: {} }
    if (state === 'finished') return { key: input.printerState === 'cancelled' ? 'Cancelled' : 'Complete', params: {} }

    return { key: 'Ready', params: {} }
}

export const resolveHeatStatus = (input: { temperature: number; target: number }): HeatStatus => {
    if (input.target <= 0) return input.temperature >= HOT_WITHOUT_TARGET ? 'hot' : 'off'
    if (Math.abs(input.temperature - input.target) <= ON_TARGET_TOLERANCE) return 'onTarget'

    return input.temperature < input.target ? 'heating' : 'cooling'
}

export const resolveSensorTrend = (current: number, earlier: number | null): SensorTrend => {
    if (earlier === null) return 'steady'
    if (current - earlier > TREND_TOLERANCE) return 'rising'
    if (earlier - current > TREND_TOLERANCE) return 'falling'

    return 'steady'
}

export type ShellTranslate = (key: string, values?: Record<string, unknown>) => string

export const formatShellDuration = (seconds: number, t: ShellTranslate): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--'
    if (seconds < SECONDS_PER_MINUTE) return t('Shell.Duration.LessThanMinute')

    const totalMinutes = Math.floor(seconds / SECONDS_PER_MINUTE)
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
    const minutes = totalMinutes % MINUTES_PER_HOUR
    if (hours === 0) return t('Shell.Duration.Minutes', { minutes })

    return t('Shell.Duration.Hours', { hours, minutes: String(minutes).padStart(2, '0') })
}

export const formatShellTemperature = (temperature: number | null | undefined): string => {
    if (temperature === null || temperature === undefined || !Number.isFinite(temperature)) return '--'

    return `${Math.round(temperature)}°`
}

export interface ShellEventLine {
    at: number | null
    key: string
    params: Record<string, number | string>
    duration: number | null
}

interface TimelineLike {
    startedAt: number | null
    events: { type: string; elapsed: number | null; percent?: number }[]
}

const eventKeys: Record<string, string> = {
    warmup: 'Warmup',
    started: 'Started',
    'first-layer': 'FirstLayer',
    milestone: 'Milestone',
    paused: 'Paused',
    resumed: 'Resumed',
    complete: 'Complete',
    cancelled: 'Cancelled',
    error: 'Error',
}

export const describePrintEvents = (timeline: TimelineLike | null): ShellEventLine[] => {
    if (timeline === null) return []

    const lines = timeline.events.map((event, index): ShellEventLine => {
        const at =
            timeline.startedAt === null || event.elapsed === null ? null : timeline.startedAt + event.elapsed * 1000
        const line: ShellEventLine = { at, key: eventKeys[event.type] ?? 'Started', params: {}, duration: null }
        if (event.type === 'milestone') line.params.percent = event.percent ?? 0

        const resumed = timeline.events.slice(index + 1).find((later) => later.type === 'resumed')
        if (event.type === 'paused' && resumed && resumed.elapsed !== null && event.elapsed !== null) {
            line.key = 'PausedFor'
            line.duration = resumed.elapsed - event.elapsed
        }

        return line
    })

    return lines.reverse()
}

export const formatFilamentMeters = (millimeters: number): string => {
    if (!Number.isFinite(millimeters) || millimeters <= 0) return '0 m'

    return `${(millimeters / 1000).toFixed(2)} m`
}

export interface GoToTarget {
    x: number
    y: number
}

const GO_TO_EDGE_MARGIN = 5
const GO_TO_SAFE_Z = 10

const rectangularKinematics = /^(limited_)?(generic_)?(hybrid_)?(cartesian|corexy|corexz)$/

export const resolveGoToTargets = (input: {
    axisMinimum: number[]
    axisMaximum: number[]
    kinematics: string
    printRadius: number | null
}): Record<string, GoToTarget> | null => {
    if (input.axisMinimum.length < 2 || input.axisMaximum.length < 2) return null

    const [minX, minY] = input.axisMinimum
    const [maxX, maxY] = input.axisMaximum
    if (!(maxX > minX) || !(maxY > minY)) return null

    const round = (value: number): number => Math.round(value * 10) / 10
    const centre = { x: round((minX + maxX) / 2), y: round((minY + maxY) / 2) }

    if (input.kinematics === 'delta') {
        const limit = Math.min(maxX - centre.x, maxY - centre.y)
        const radius = input.printRadius !== null && input.printRadius > 0 ? Math.min(input.printRadius, limit) : limit
        if (!(radius > GO_TO_EDGE_MARGIN)) return null

        return {
            centre,
            front: { x: centre.x, y: round(centre.y - radius + GO_TO_EDGE_MARGIN) },
            back: { x: centre.x, y: round(centre.y + radius - GO_TO_EDGE_MARGIN) },
        }
    }
    if (!rectangularKinematics.test(input.kinematics)) return null

    return {
        centre,
        front: { x: centre.x, y: round(minY + GO_TO_EDGE_MARGIN) },
        back: { x: centre.x, y: round(maxY - GO_TO_EDGE_MARGIN) },
    }
}

export const buildGoToScript = (input: {
    target: GoToTarget
    currentZ: number
    feedrateXY: number
    feedrateZ: number
}): string => {
    const lines = ['SAVE_GCODE_STATE NAME=_ui_movement', 'G90']
    if (input.currentZ < GO_TO_SAFE_Z) lines.push(`G1 Z${GO_TO_SAFE_Z} F${input.feedrateZ * 60}`)
    lines.push(`G1 X${input.target.x} Y${input.target.y} F${input.feedrateXY * 60}`)
    lines.push('RESTORE_GCODE_STATE NAME=_ui_movement')

    return lines.join('\n')
}

export const resolvePidTarget = (value: unknown, maxTemperature: number): number | null => {
    if (value === '' || value === null || value === undefined) return null

    const target = Number(value)
    if (!Number.isFinite(target) || target <= 0 || target > maxTemperature) return null

    return target
}

export interface PhaseSegment {
    type: string
    percent: number
    seconds: number
}

export const buildPhaseSegments = (
    phases: { type: string; from: number; to: number }[],
    remainingSeconds: number
): PhaseSegment[] => {
    const remaining = Math.max(0, remainingSeconds)
    const elapsed = phases.reduce((sum, phase) => sum + (phase.to - phase.from), 0)
    const total = elapsed + remaining
    if (total <= 0) return []

    const segments = phases.map((phase) => ({
        type: phase.type,
        percent: ((phase.to - phase.from) / total) * 100,
        seconds: phase.to - phase.from,
    }))
    if (remaining > 0) segments.push({ type: 'remaining', percent: (remaining / total) * 100, seconds: remaining })

    return segments
}
