import { describe, expect, it } from 'vitest'
import {
    calcVolumetricFlow,
    formatFilamentLength,
    formatPrintHeroDuration,
    getDefaultPrintHeroSettings,
    getPrintHeroThumbnailPath,
    getVisiblePrintHeroMetrics,
    isPrintHeroVisible,
    printHeroMetrics,
    resolvePrintHeroBackdrop,
    resolvePrintHeroSettings,
    togglePrintHeroMetric,
} from '@/plugins/printHero'

describe('isPrintHeroVisible', () => {
    const visible = (printerState: string, klipperReady = true, filename = 'demo.gcode') =>
        isPrintHeroVisible({ klipperReady, printerState, filename })

    it('shows while a print is active', () => {
        expect(visible('printing')).toBe(true)
        expect(visible('paused')).toBe(true)
    })

    it('shows after a print finished, failed or was cancelled', () => {
        expect(visible('complete')).toBe(true)
        expect(visible('error')).toBe(true)
        expect(visible('cancelled')).toBe(true)
    })

    it('renders nothing while the printer is idle', () => {
        expect(visible('standby')).toBe(false)
        expect(visible('')).toBe(false)
        expect(visible('Ready')).toBe(false)
    })

    it('does not show stale print data while Klipper is not ready', () => {
        expect(visible('printing', false)).toBe(false)
        expect(visible('error', false)).toBe(false)
    })

    it('does not show without a file', () => {
        expect(visible('printing', true, '')).toBe(false)
    })
})

describe('resolvePrintHeroSettings', () => {
    it('returns the defaults for settings saved before the panel existed', () => {
        expect(resolvePrintHeroSettings(undefined)).toEqual(getDefaultPrintHeroSettings())
        expect(resolvePrintHeroSettings(null)).toEqual(getDefaultPrintHeroSettings())
        expect(resolvePrintHeroSettings('broken')).toEqual(getDefaultPrintHeroSettings())
    })

    it('shows the key numbers, the webcam and the timeline by default', () => {
        const defaults = getDefaultPrintHeroSettings()

        expect(defaults.backdrop).toBe('webcam')
        expect(defaults.showTimeline).toBe(true)
        expect(defaults.metrics).toEqual(['progress', 'remaining', 'eta', 'layer', 'speed', 'flow', 'filament'])
    })

    it('fills in missing keys of partly stored settings', () => {
        expect(resolvePrintHeroSettings({ backdrop: 'none' })).toEqual({
            ...getDefaultPrintHeroSettings(),
            backdrop: 'none',
        })
        expect(resolvePrintHeroSettings({ showTimeline: false }).showTimeline).toBe(false)
    })

    it('keeps the stored metrics in the canonical order and drops unknown ones', () => {
        const settings = resolvePrintHeroSettings({ metrics: ['flow', 'bogus', 'progress', 'flow', 7] })

        expect(settings.metrics).toEqual(['progress', 'flow'])
    })

    it('accepts an empty metric list, so every number can be switched off', () => {
        expect(resolvePrintHeroSettings({ metrics: [] }).metrics).toEqual([])
    })

    it('falls back to the defaults for invalid values', () => {
        const settings = resolvePrintHeroSettings({ backdrop: 'hologram', showTimeline: 'yes', metrics: 'all' })

        expect(settings).toEqual(getDefaultPrintHeroSettings())
    })

    it('returns a fresh object, so the defaults cannot be mutated', () => {
        resolvePrintHeroSettings(undefined).metrics.push('elapsed')

        expect(getDefaultPrintHeroSettings().metrics).not.toContain('elapsed')
    })
})

describe('togglePrintHeroMetric', () => {
    it('adds a metric at its canonical position', () => {
        expect(togglePrintHeroMetric(['progress', 'filament'], 'layer', true)).toEqual([
            'progress',
            'layer',
            'filament',
        ])
    })

    it('removes a metric', () => {
        expect(togglePrintHeroMetric(['progress', 'layer'], 'progress', false)).toEqual(['layer'])
    })

    it('does not duplicate or mutate', () => {
        const metrics = [...printHeroMetrics]

        expect(togglePrintHeroMetric(metrics, 'eta', true)).toEqual(printHeroMetrics)
        togglePrintHeroMetric(metrics, 'eta', false)
        expect(metrics).toEqual(printHeroMetrics)
    })
})

describe('getVisiblePrintHeroMetrics', () => {
    const all = [...printHeroMetrics]

    it('shows every selected metric while printing or paused', () => {
        expect(getVisiblePrintHeroMetrics(all, 'printing')).toEqual(all)
        expect(getVisiblePrintHeroMetrics(['layer', 'flow'], 'paused')).toEqual(['layer', 'flow'])
    })

    it('drops the live numbers once the print has ended', () => {
        for (const state of ['complete', 'cancelled', 'error']) {
            expect(getVisiblePrintHeroMetrics(all, state)).toEqual(['progress', 'layer', 'filament', 'elapsed'])
        }
    })
})

describe('resolvePrintHeroBackdrop', () => {
    it('uses the preferred backdrop when it is available', () => {
        expect(resolvePrintHeroBackdrop('webcam', { webcam: true, thumbnail: true })).toBe('webcam')
        expect(resolvePrintHeroBackdrop('thumbnail', { webcam: true, thumbnail: true })).toBe('thumbnail')
        expect(resolvePrintHeroBackdrop('none', { webcam: true, thumbnail: true })).toBe('none')
    })

    it('falls back from the webcam to the thumbnail and then to the gradient', () => {
        expect(resolvePrintHeroBackdrop('webcam', { webcam: false, thumbnail: true })).toBe('thumbnail')
        expect(resolvePrintHeroBackdrop('webcam', { webcam: false, thumbnail: false })).toBe('none')
    })

    it('falls back from a missing thumbnail to the gradient, not to a webcam the user did not choose', () => {
        expect(resolvePrintHeroBackdrop('thumbnail', { webcam: true, thumbnail: false })).toBe('none')
    })
})

describe('formatPrintHeroDuration', () => {
    it('formats seconds, minutes and hours compactly', () => {
        expect(formatPrintHeroDuration(42)).toBe('42s')
        expect(formatPrintHeroDuration(348)).toBe('5m 48s')
        expect(formatPrintHeroDuration(3600)).toBe('1h 00m')
        expect(formatPrintHeroDuration(3 * 3600 + 5 * 60 + 59)).toBe('3h 05m')
    })

    it('returns a placeholder for unknown durations', () => {
        expect(formatPrintHeroDuration(0)).toBe('--')
        expect(formatPrintHeroDuration(-5)).toBe('--')
        expect(formatPrintHeroDuration(Number.NaN)).toBe('--')
    })
})

describe('formatFilamentLength', () => {
    it('uses millimetres below one metre and metres above', () => {
        expect(formatFilamentLength(0)).toBe('0 mm')
        expect(formatFilamentLength(612.4)).toBe('612 mm')
        expect(formatFilamentLength(1500)).toBe('1.50 m')
    })
})

describe('calcVolumetricFlow', () => {
    it('multiplies the filament cross section with the extruder velocity', () => {
        expect(calcVolumetricFlow(1.75, 2.5)).toBeCloseTo(6.013, 2)
    })

    it('ignores retractions and missing data', () => {
        expect(calcVolumetricFlow(1.75, -30)).toBe(0)
        expect(calcVolumetricFlow(1.75, null)).toBe(0)
    })
})

describe('getPrintHeroThumbnailPath', () => {
    const thumbnails = [
        { width: 32, height: 32, size: 1, relative_path: '.thumbs/part-32x32.png' },
        { width: 300, height: 300, size: 2, relative_path: '.thumbs/part-300x300.png' },
        { width: 160, height: 160, size: 3, relative_path: '.thumbs/part-160x160.png' },
    ]

    it('picks the largest thumbnail of the file', () => {
        expect(getPrintHeroThumbnailPath({ filename: 'part.gcode', thumbnails })).toBe('.thumbs/part-300x300.png')
    })

    it('is relative to the directory of the file', () => {
        expect(getPrintHeroThumbnailPath({ filename: 'batch/a/part.gcode', thumbnails })).toBe(
            'batch/a/.thumbs/part-300x300.png'
        )
    })

    it('ignores thumbnails that are too small for a backdrop', () => {
        expect(getPrintHeroThumbnailPath({ filename: 'part.gcode', thumbnails: thumbnails.slice(0, 1) })).toBeNull()
    })

    it('returns null for files without thumbnails or metadata', () => {
        expect(getPrintHeroThumbnailPath({ filename: 'part.gcode' })).toBeNull()
        expect(getPrintHeroThumbnailPath({ filename: 'part.gcode', thumbnails: [] })).toBeNull()
        expect(getPrintHeroThumbnailPath({})).toBeNull()
        expect(getPrintHeroThumbnailPath(null)).toBeNull()
    })
})
