import { isRecord } from '@/plugins/helpers'

export interface SpoolTrackerSettings {
    enabled: boolean
    name: string
    material: string
    sizeGrams: number
    loadedAt: number | null
    baselineLength: number
}

export interface SpoolJob {
    startTime: number
    endTime: number
    filamentUsed: number
    status: string
}

export interface SpoolActivePrint {
    startTime: number
    filamentUsed: number
}

export interface SpoolEstimate {
    usedGrams: number
    remainingGrams: number
    remainingFraction: number
    empty: boolean
}

export type SpoolSource = 'spoolman' | 'builtin' | 'none'

export const DEFAULT_SPOOL_SIZE_GRAMS = 1000
export const DEFAULT_SPOOL_MATERIAL = 'PLA'
export const DEFAULT_FILAMENT_DIAMETER = 1.75
export const spoolSizes = [250, 500, 750, 1000, 2000, 3000]

const GRAMS_PER_KILOGRAM = 1000
const CUBIC_MM_PER_CUBIC_CM = 1000

const densities: [string, number][] = [
    ['PETG', 1.27],
    ['PLA', 1.24],
    ['ABS', 1.04],
    ['ASA', 1.07],
    ['TPU', 1.21],
    ['PA', 1.14],
    ['NYLON', 1.14],
    ['PC', 1.2],
    ['HIPS', 1.04],
    ['PVA', 1.23],
]

export const spoolMaterials = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'HIPS', 'PVA']

export const getDefaultSpoolTrackerSettings = (): SpoolTrackerSettings => ({
    enabled: true,
    name: '',
    material: DEFAULT_SPOOL_MATERIAL,
    sizeGrams: DEFAULT_SPOOL_SIZE_GRAMS,
    loadedAt: null,
    baselineLength: 0,
})

const positiveNumber = (value: unknown): number | null => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export const resolveSpoolTrackerSettings = (stored: unknown): SpoolTrackerSettings => {
    const settings = getDefaultSpoolTrackerSettings()
    if (!isRecord(stored)) return settings

    if (typeof stored.enabled === 'boolean') settings.enabled = stored.enabled
    if (typeof stored.name === 'string') settings.name = stored.name
    if (typeof stored.material === 'string' && stored.material !== '') settings.material = stored.material
    settings.sizeGrams = positiveNumber(stored.sizeGrams) ?? DEFAULT_SPOOL_SIZE_GRAMS
    settings.loadedAt = positiveNumber(stored.loadedAt)
    settings.baselineLength = positiveNumber(stored.baselineLength) ?? 0

    return settings
}

export const materialDensity = (material: string | null | undefined): number => {
    const name = (material ?? '').toUpperCase()
    const exact = densities.find(([key]) => key === name)
    if (exact) return exact[1]

    const words = name.split(/[^A-Z]+/)
    const partial = densities.find(([key]) => words.some((word) => word.startsWith(key)))

    return partial?.[1] ?? materialDensity(DEFAULT_SPOOL_MATERIAL)
}

export const filamentLengthToWeight = (lengthMm: number, diameterMm: number, density: number): number => {
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) return 0
    if (!Number.isFinite(diameterMm) || diameterMm <= 0) return 0

    const volume = Math.PI * Math.pow(diameterMm / 2, 2) * lengthMm

    return (volume / CUBIC_MM_PER_CUBIC_CM) * density
}

export const usedLengthSinceLoad = (input: {
    loadedAt: number | null
    baselineLength: number
    jobs: SpoolJob[]
    active: SpoolActivePrint | null
}): number => {
    const loadedAt = input.loadedAt
    if (loadedAt === null) return 0

    const sinceLoad = (startTime: number, filamentUsed: number): number => {
        const baseline = startTime < loadedAt ? input.baselineLength : 0

        return Math.max(0, filamentUsed - baseline)
    }

    const finished = input.jobs
        .filter((job) => job.status !== 'in_progress' && job.endTime >= loadedAt)
        .reduce((sum, job) => sum + sinceLoad(job.startTime, job.filamentUsed), 0)
    const running = input.active === null ? 0 : sinceLoad(input.active.startTime, input.active.filamentUsed)

    return finished + running
}

export const estimateSpool = (input: {
    usedLength: number
    sizeGrams: number
    diameter: number
    density: number
}): SpoolEstimate => {
    const usedGrams = filamentLengthToWeight(input.usedLength, input.diameter, input.density)
    const remainingGrams = Math.max(0, input.sizeGrams - usedGrams)

    return {
        usedGrams,
        remainingGrams,
        remainingFraction: input.sizeGrams > 0 ? remainingGrams / input.sizeGrams : 0,
        empty: remainingGrams <= 0,
    }
}

export const enoughForPrint = (input: {
    fileFilamentTotal: number | null | undefined
    printFilamentUsed: number
    remainingGrams: number
    diameter: number
    density: number
}): { enough: boolean; neededGrams: number } | null => {
    const total = positiveNumber(input.fileFilamentTotal)
    if (total === null) return null

    const lengthToGo = Math.max(0, total - input.printFilamentUsed)
    const neededGrams = filamentLengthToWeight(lengthToGo, input.diameter, input.density)

    return { enough: neededGrams <= input.remainingGrams, neededGrams }
}

export const formatSpoolWeight = (grams: number): string => {
    const rounded = Math.round(Math.max(0, grams))
    if (rounded >= GRAMS_PER_KILOGRAM) return `${Number((rounded / GRAMS_PER_KILOGRAM).toFixed(2))} kg`

    return `${rounded} g`
}

export const resolveSpoolSource = (input: { components: string[]; trackerEnabled: boolean }): SpoolSource => {
    if (input.components.includes('spoolman')) return 'spoolman'

    return input.trackerEnabled ? 'builtin' : 'none'
}
