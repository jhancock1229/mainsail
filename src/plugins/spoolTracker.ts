import { isRecord } from '@/plugins/helpers'

export interface SpoolTrackerSettings {
    enabled: boolean
    name: string
    material: string
    sizeGrams: number
    loadedAt: number | null
    usedLength: number
    lastJobId: string | null
    baselineLength: number
}

export interface SpoolJob {
    id: string
    filamentUsed: number
    status: string
}

export type SpoolUsage = Pick<SpoolTrackerSettings, 'usedLength' | 'lastJobId' | 'baselineLength'>

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
    usedLength: 0,
    lastJobId: null,
    baselineLength: 0,
})

const JOB_ID_RADIX = 16
const isJobId = (id: string): boolean => /^[0-9a-f]+$/i.test(id)
const jobNumber = (id: string | null): number => (id !== null && isJobId(id) ? parseInt(id, JOB_ID_RADIX) : -1)
const isFinished = (job: SpoolJob): boolean => job.status !== 'in_progress' && isJobId(job.id)

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
    settings.usedLength = positiveNumber(stored.usedLength) ?? 0
    if (typeof stored.lastJobId === 'string' && isJobId(stored.lastJobId)) settings.lastJobId = stored.lastJobId
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

export const latestFinishedJobId = (jobs: SpoolJob[]): string | null => {
    const finished = jobs.filter(isFinished)
    if (finished.length === 0) return null

    return finished.reduce((latest, job) => (jobNumber(job.id) > jobNumber(latest.id) ? job : latest)).id
}

export const settleSpoolUsage = (usage: SpoolUsage, jobs: SpoolJob[], historyLoaded: boolean): SpoolUsage => {
    const last = jobNumber(usage.lastJobId)
    const reachesBack = jobs.some((job) => isJobId(job.id) && jobNumber(job.id) <= last)
    if (!historyLoaded && !reachesBack) return usage

    const newJobs = jobs
        .filter((job) => isJobId(job.id) && jobNumber(job.id) > last)
        .sort((a, b) => jobNumber(a.id) - jobNumber(b.id))
    const baselineJob = newJobs[0]
    const settled = { ...usage }

    for (const job of newJobs) {
        if (!isFinished(job)) break

        const baseline = job === baselineJob ? settled.baselineLength : 0
        settled.usedLength += Math.max(0, job.filamentUsed - baseline)
        settled.lastJobId = job.id
        settled.baselineLength = 0
    }

    return settled
}

export const spoolUsedLength = (usage: SpoolUsage, activeFilamentUsed: number | null): number => {
    if (activeFilamentUsed === null) return usage.usedLength

    return usage.usedLength + Math.max(0, activeFilamentUsed - usage.baselineLength)
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
    if (!input.components.includes('history')) return 'none'

    return input.trackerEnabled ? 'builtin' : 'none'
}
