import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SPOOL_SIZE_GRAMS,
    enoughForPrint,
    estimateSpool,
    filamentLengthToWeight,
    formatSpoolWeight,
    materialDensity,
    resolveSpoolSource,
    latestFinishedJobId,
    resolveSpoolTrackerSettings,
    settleSpoolUsage,
    spoolUsedLength,
} from '@/plugins/spoolTracker'

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

describe('settleSpoolUsage', () => {
    const job = (id: string, filamentUsed: number, status = 'completed') => ({ id, filamentUsed, status })
    const fresh = { usedLength: 0, lastJobId: '000005', baselineLength: 0 }

    it('adds the finished jobs that came after the last counted one', () => {
        const jobs = [job('000007', 500), job('000006', 4000), job('000005', 9000), job('000004', 100)]

        expect(settleSpoolUsage(fresh, jobs, true)).toEqual({
            usedLength: 4500,
            lastJobId: '000007',
            baselineLength: 0,
        })
    })

    it('counts cancelled and failed jobs, which also used filament', () => {
        const jobs = [job('000006', 700, 'cancelled'), job('000007', 300, 'error')]

        expect(settleSpoolUsage(fresh, jobs, true).usedLength).toBe(1000)
    })

    it('leaves the running print for later', () => {
        const jobs = [job('000006', 4000), job('000007', 0, 'in_progress')]

        expect(settleSpoolUsage(fresh, jobs, true)).toEqual({
            usedLength: 4000,
            lastJobId: '000006',
            baselineLength: 0,
        })
    })

    it('does not count a job twice', () => {
        const jobs = [job('000006', 4000)]
        const once = settleSpoolUsage(fresh, jobs, true)

        expect(settleSpoolUsage(once, jobs, true)).toEqual(once)
    })

    it('compares job ids as the hexadecimal numbers Moonraker uses', () => {
        const usage = { usedLength: 0, lastJobId: '000009', baselineLength: 0 }

        expect(settleSpoolUsage(usage, [job('00000A', 100), job('000010', 200)], true)).toEqual({
            usedLength: 300,
            lastJobId: '000010',
            baselineLength: 0,
        })
    })

    it('subtracts what a print had used before the spool was changed in the middle of it', () => {
        const usage = { usedLength: 0, lastJobId: '000005', baselineLength: 3000 }
        const jobs = [job('000006', 8000), job('000007', 1000)]

        expect(settleSpoolUsage(usage, jobs, true)).toEqual({
            usedLength: 6000,
            lastJobId: '000007',
            baselineLength: 0,
        })
    })

    it('waits while the history is still loading and does not reach back to the last counted job', () => {
        const newestPage = [job('000030', 100), job('000029', 100)]

        expect(settleSpoolUsage(fresh, newestPage, false)).toEqual(fresh)
        expect(settleSpoolUsage(fresh, [...newestPage, job('000005', 1)], false).lastJobId).toBe('000030')
        expect(settleSpoolUsage(fresh, newestPage, true).lastJobId).toBe('000030')
    })

    it('counts every job when none was counted before', () => {
        const usage = { usedLength: 0, lastJobId: null, baselineLength: 0 }

        expect(settleSpoolUsage(usage, [job('000001', 250)], true)).toEqual({
            usedLength: 250,
            lastJobId: '000001',
            baselineLength: 0,
        })
    })
})

describe('latestFinishedJobId', () => {
    it('finds the newest finished job whatever the order', () => {
        const jobs = [
            { id: '000002', filamentUsed: 1, status: 'completed' },
            { id: '00000B', filamentUsed: 1, status: 'in_progress' },
            { id: '00000A', filamentUsed: 1, status: 'cancelled' },
        ]

        expect(latestFinishedJobId(jobs)).toBe('00000A')
        expect(latestFinishedJobId([])).toBeNull()
    })
})

describe('spoolUsedLength', () => {
    it('adds the running print to what finished prints used', () => {
        const usage = { usedLength: 4000, lastJobId: '000006', baselineLength: 0 }

        expect(spoolUsedLength(usage, 1200)).toBe(5200)
        expect(spoolUsedLength(usage, null)).toBe(4000)
    })

    it('only counts what the running print used after a spool change', () => {
        const usage = { usedLength: 0, lastJobId: '000006', baselineLength: 3000 }

        expect(spoolUsedLength(usage, 5000)).toBe(2000)
        expect(spoolUsedLength(usage, 1000)).toBe(0)
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
            usedLength: 0,
            lastJobId: null,
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
            usedLength: 5200,
            lastJobId: '00001F',
            baselineLength: 120,
        })

        expect(settings).toEqual({
            enabled: false,
            name: 'Black PLA',
            material: 'PETG',
            sizeGrams: DEFAULT_SPOOL_SIZE_GRAMS,
            loadedAt: null,
            usedLength: 5200,
            lastJobId: '00001F',
            baselineLength: 120,
        })
    })

    it('drops a job id that is not one', () => {
        expect(resolveSpoolTrackerSettings({ lastJobId: 'latest' }).lastJobId).toBeNull()
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

    it('has nothing to count from without the print history', () => {
        expect(resolveSpoolSource({ components: [], trackerEnabled: true })).toBe('none')
    })
})
