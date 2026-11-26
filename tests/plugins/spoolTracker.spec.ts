import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SPOOL_SIZE_GRAMS,
    enoughForPrint,
    estimateSpool,
    filamentLengthToWeight,
    formatSpoolWeight,
    materialDensity,
    resolveSpoolSource,
    resolveSpoolTrackerSettings,
    usedLengthSinceLoad,
} from '@/plugins/spoolTracker'

const DAY = 86400
const loadedAt = 1_700_000_000

describe('materialDensity', () => {
    it('knows common materials whatever the letter case', () => {
        expect(materialDensity('PLA')).toBe(1.24)
        expect(materialDensity('petg')).toBe(1.27)
        expect(materialDensity('ABS')).toBe(1.04)
    })

    it('recognises a material inside a longer name', () => {
        expect(materialDensity('Black PLA+')).toBe(1.24)
        expect(materialDensity('PETG-CF')).toBe(1.27)
    })

    it('falls back to PLA for unknown or missing materials', () => {
        expect(materialDensity('mystery')).toBe(1.24)
        expect(materialDensity(undefined)).toBe(1.24)
    })
})

describe('filamentLengthToWeight', () => {
    it('converts a length of 1.75 mm PLA to grams', () => {
        expect(filamentLengthToWeight(1000, 1.75, 1.24)).toBeCloseTo(2.98, 2)
        expect(filamentLengthToWeight(335_000, 1.75, 1.24)).toBeCloseTo(999.2, 0)
    })

    it('scales with the diameter', () => {
        expect(filamentLengthToWeight(1000, 2.85, 1.24)).toBeCloseTo(7.91, 2)
    })

    it('returns zero for nonsense input', () => {
        expect(filamentLengthToWeight(-5, 1.75, 1.24)).toBe(0)
        expect(filamentLengthToWeight(Number.NaN, 1.75, 1.24)).toBe(0)
        expect(filamentLengthToWeight(1000, 0, 1.24)).toBe(0)
    })
})

describe('usedLengthSinceLoad', () => {
    const job = (start: number, end: number, used: number, status = 'completed') => ({
        startTime: loadedAt + start,
        endTime: loadedAt + end,
        filamentUsed: used,
        status,
    })

    it('adds up the jobs that finished after the spool was loaded', () => {
        const jobs = [job(-3 * DAY, -3 * DAY + 600, 9000), job(DAY, DAY + 600, 4000), job(2 * DAY, 2 * DAY + 60, 500)]

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 0, jobs, active: null })).toBe(4500)
    })

    it('counts cancelled and failed jobs, which also used filament', () => {
        const jobs = [job(DAY, DAY + 60, 700, 'cancelled'), job(2 * DAY, 2 * DAY + 60, 300, 'error')]

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 0, jobs, active: null })).toBe(1000)
    })

    it('adds the running print instead of its unfinished history entry', () => {
        const jobs = [job(DAY, DAY + 600, 4000), job(2 * DAY, 0, 0, 'in_progress')]
        const active = { startTime: loadedAt + 2 * DAY, filamentUsed: 1200 }

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 0, jobs, active })).toBe(5200)
    })

    it('only counts what a print used after a spool change in the middle of it', () => {
        const active = { startTime: loadedAt - 600, filamentUsed: 5000 }

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 3000, jobs: [], active })).toBe(2000)
    })

    it('applies the same baseline once that print has finished', () => {
        const jobs = [job(-600, 900, 8000)]

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 3000, jobs, active: null })).toBe(5000)
    })

    it('never goes below zero', () => {
        const jobs = [job(-600, 900, 1000)]

        expect(usedLengthSinceLoad({ loadedAt, baselineLength: 3000, jobs, active: null })).toBe(0)
    })

    it('is zero when no spool was loaded', () => {
        expect(usedLengthSinceLoad({ loadedAt: null, baselineLength: 0, jobs: [job(1, 2, 500)], active: null })).toBe(0)
    })
})

describe('estimateSpool', () => {
    it('reports used and remaining weight and the share that is left', () => {
        const estimate = estimateSpool({ usedLength: 231_500, sizeGrams: 1000, diameter: 1.75, density: 1.24 })

        expect(Math.round(estimate.usedGrams)).toBe(690)
        expect(Math.round(estimate.remainingGrams)).toBe(310)
        expect(estimate.remainingFraction).toBeCloseTo(0.31, 2)
        expect(estimate.empty).toBe(false)
    })

    it('stops at an empty spool', () => {
        const estimate = estimateSpool({ usedLength: 900_000, sizeGrams: 1000, diameter: 1.75, density: 1.24 })

        expect(estimate.remainingGrams).toBe(0)
        expect(estimate.remainingFraction).toBe(0)
        expect(estimate.empty).toBe(true)
    })
})

describe('enoughForPrint', () => {
    const base = { diameter: 1.75, density: 1.24, remainingGrams: 310 }

    it('says there is enough and how much the print still needs', () => {
        const result = enoughForPrint({ ...base, fileFilamentTotal: 4000, printFilamentUsed: 1650 })

        expect(result).toEqual({ enough: true, neededGrams: expect.closeTo(7.0, 1) })
    })

    it('says when the spool will run out', () => {
        const result = enoughForPrint({ ...base, remainingGrams: 5, fileFilamentTotal: 4000, printFilamentUsed: 0 })

        expect(result?.enough).toBe(false)
        expect(result?.neededGrams).toBeCloseTo(11.9, 1)
    })

    it('has no answer when the file does not say how much filament it needs', () => {
        expect(enoughForPrint({ ...base, fileFilamentTotal: undefined, printFilamentUsed: 100 })).toBeNull()
        expect(enoughForPrint({ ...base, fileFilamentTotal: 0, printFilamentUsed: 100 })).toBeNull()
    })

    it('needs nothing more once the print has used all the file asked for', () => {
        const result = enoughForPrint({ ...base, fileFilamentTotal: 4000, printFilamentUsed: 4100 })

        expect(result).toEqual({ enough: true, neededGrams: 0 })
    })
})

describe('formatSpoolWeight', () => {
    it('shows grams below a kilogram and kilograms above', () => {
        expect(formatSpoolWeight(309.6)).toBe('310 g')
        expect(formatSpoolWeight(1000)).toBe('1 kg')
        expect(formatSpoolWeight(1250)).toBe('1.25 kg')
        expect(formatSpoolWeight(0)).toBe('0 g')
        expect(formatSpoolWeight(999.8)).toBe('1 kg')
    })
})

describe('resolveSpoolTrackerSettings', () => {
    it('starts enabled with no spool loaded and a one kilogram default', () => {
        expect(resolveSpoolTrackerSettings(undefined)).toEqual({
            enabled: true,
            name: '',
            material: 'PLA',
            sizeGrams: DEFAULT_SPOOL_SIZE_GRAMS,
            loadedAt: null,
            baselineLength: 0,
        })
        expect(DEFAULT_SPOOL_SIZE_GRAMS).toBe(1000)
    })

    it('keeps valid stored values and repairs broken ones', () => {
        const settings = resolveSpoolTrackerSettings({
            enabled: false,
            name: 'Black PLA',
            material: 'PETG',
            sizeGrams: -4,
            loadedAt: 'yesterday',
            baselineLength: 120,
        })

        expect(settings).toEqual({
            enabled: false,
            name: 'Black PLA',
            material: 'PETG',
            sizeGrams: DEFAULT_SPOOL_SIZE_GRAMS,
            loadedAt: null,
            baselineLength: 120,
        })
    })
})

describe('resolveSpoolSource', () => {
    it('lets Spoolman win over the built-in tracker', () => {
        expect(resolveSpoolSource({ components: ['history', 'spoolman'], trackerEnabled: true })).toBe('spoolman')
    })

    it('uses the built-in tracker otherwise, unless it is switched off', () => {
        expect(resolveSpoolSource({ components: ['history'], trackerEnabled: true })).toBe('builtin')
        expect(resolveSpoolSource({ components: ['history'], trackerEnabled: false })).toBe('none')
    })
})
