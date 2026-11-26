// pure logic of the print hero dashboard panel (src/components/panels/PrintHeroPanel.vue)
import { isRecord } from '@/plugins/helpers'
import { thumbnailBigMin } from '@/store/variables'

export const printHeroMetrics = [
    'progress',
    'remaining',
    'eta',
    'layer',
    'speed',
    'flow',
    'filament',
    'elapsed',
] as const
export type PrintHeroMetric = (typeof printHeroMetrics)[number]

export const printHeroBackdrops = ['webcam', 'thumbnail', 'none'] as const
export type PrintHeroBackdrop = (typeof printHeroBackdrops)[number]

export interface PrintHeroSettings {
    metrics: PrintHeroMetric[]
    backdrop: PrintHeroBackdrop
    showTimeline: boolean
}

const activePrintStates = ['printing', 'paused']
const endedPrintStates = ['complete', 'cancelled', 'error']
// numbers that still mean something after the print has ended
const endedPrintMetrics: PrintHeroMetric[] = ['progress', 'layer', 'filament', 'elapsed']

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const MM_PER_METER = 1000

export const getDefaultPrintHeroSettings = (): PrintHeroSettings => ({
    metrics: ['progress', 'remaining', 'eta', 'layer', 'speed', 'flow', 'filament'],
    backdrop: 'webcam',
    showTimeline: true,
})

// settings loaded from the database can be missing, incomplete or from another version
export const resolvePrintHeroSettings = (stored: unknown): PrintHeroSettings => {
    const settings = getDefaultPrintHeroSettings()
    if (!isRecord(stored)) return settings

    const storedMetrics = stored.metrics
    if (Array.isArray(storedMetrics)) {
        settings.metrics = printHeroMetrics.filter((metric) => storedMetrics.includes(metric))
    }
    if (printHeroBackdrops.includes(stored.backdrop as PrintHeroBackdrop)) {
        settings.backdrop = stored.backdrop as PrintHeroBackdrop
    }
    if (typeof stored.showTimeline === 'boolean') settings.showTimeline = stored.showTimeline

    return settings
}

export const togglePrintHeroMetric = (
    metrics: readonly PrintHeroMetric[],
    metric: PrintHeroMetric,
    visible: boolean
): PrintHeroMetric[] => {
    return printHeroMetrics.filter((entry) => (entry === metric ? visible : metrics.includes(entry)))
}

export const isPrintEnded = (printerState: string): boolean => endedPrintStates.includes(printerState)

export const getVisiblePrintHeroMetrics = (
    metrics: readonly PrintHeroMetric[],
    printerState: string
): PrintHeroMetric[] => {
    if (!isPrintEnded(printerState)) return [...metrics]

    return metrics.filter((metric) => endedPrintMetrics.includes(metric))
}

export const isPrintHeroVisible = (input: {
    klipperReady: boolean
    printerState: string
    filename: string
}): boolean => {
    // print_stats can be stale while Klipper is not ready
    if (!input.klipperReady || input.filename === '') return false

    return activePrintStates.includes(input.printerState) || isPrintEnded(input.printerState)
}

export const resolvePrintHeroBackdrop = (
    preferred: PrintHeroBackdrop,
    available: { webcam: boolean; thumbnail: boolean }
): PrintHeroBackdrop => {
    if (preferred === 'webcam' && available.webcam) return 'webcam'
    if (preferred !== 'none' && available.thumbnail) return 'thumbnail'

    return 'none'
}

// path of the largest thumbnail below the gcodes root, null if the file has none that is big enough
export const getPrintHeroThumbnailPath = (file: unknown): string | null => {
    if (!isRecord(file) || !Array.isArray(file.thumbnails)) return null

    const usable = file.thumbnails.filter(
        (thumbnail): thumbnail is { width: number; relative_path: string } =>
            isRecord(thumbnail) &&
            typeof thumbnail.relative_path === 'string' &&
            Number(thumbnail.width) >= thumbnailBigMin
    )
    if (usable.length === 0) return null

    const largest = usable.reduce((best, thumbnail) => (thumbnail.width > best.width ? thumbnail : best))
    const filename = typeof file.filename === 'string' ? file.filename : ''
    const directory = filename.slice(0, filename.lastIndexOf('/') + 1)

    return directory + largest.relative_path
}

export const formatPrintHeroDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--'

    const hours = Math.floor(seconds / SECONDS_PER_HOUR)
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
    const rest = Math.floor(seconds % SECONDS_PER_MINUTE)
    const padded = (value: number) => String(value).padStart(2, '0')

    if (hours > 0) return `${hours}h ${padded(minutes)}m`
    if (minutes > 0) return `${minutes}m ${padded(rest)}s`

    return `${rest}s`
}

export const formatFilamentLength = (millimeters: number): string => {
    if (millimeters >= MM_PER_METER) return `${(millimeters / MM_PER_METER).toFixed(2)} m`

    return `${millimeters.toFixed(0)} mm`
}

// mm³/s; retractions (negative velocity) are no flow
export const calcVolumetricFlow = (filamentDiameter: number, extruderVelocity: number | null): number => {
    if (extruderVelocity === null || extruderVelocity <= 0) return 0

    return Math.pow(filamentDiameter / 2, 2) * Math.PI * extruderVelocity
}
