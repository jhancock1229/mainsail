import { describe, expect, it } from 'vitest'
import {
    buildGoToScript,
    describePrintEvents,
    formatFilamentMeters,
    formatShellDuration,
    formatShellTemperature,
    resolveGoToTargets,
    resolveHeatStatus,
    resolveSensorTrend,
    resolveShellHeadline,
    resolveShellHomeState,
} from '@/plugins/shellStatus'

describe('resolveShellHomeState', () => {
    const ready = { klipperState: 'ready', printerState: 'standby', filename: '' }

    it('is idle when nothing is printing', () => {
        expect(resolveShellHomeState(ready)).toBe('idle')
        expect(resolveShellHomeState({ ...ready, printerState: '' })).toBe('idle')
    })

    it('follows a running, paused and ended print', () => {
        const job = { ...ready, filename: 'benchy.gcode' }

        expect(resolveShellHomeState({ ...job, printerState: 'printing' })).toBe('printing')
        expect(resolveShellHomeState({ ...job, printerState: 'paused' })).toBe('paused')
        expect(resolveShellHomeState({ ...job, printerState: 'complete' })).toBe('finished')
        expect(resolveShellHomeState({ ...job, printerState: 'cancelled' })).toBe('finished')
        expect(resolveShellHomeState({ ...job, printerState: 'error' })).toBe('error')
    })

    it('is idle again once the ended print was cleared', () => {
        expect(resolveShellHomeState({ ...ready, printerState: 'complete' })).toBe('idle')
    })

    it('reports an error whenever Klipper is not ready, whatever the stale print state says', () => {
        const stale = { printerState: 'printing', filename: 'benchy.gcode' }

        expect(resolveShellHomeState({ ...stale, klipperState: 'shutdown' })).toBe('error')
        expect(resolveShellHomeState({ ...stale, klipperState: 'error' })).toBe('error')
        expect(resolveShellHomeState({ ...stale, klipperState: 'disconnected' })).toBe('error')
        expect(resolveShellHomeState({ ...stale, klipperState: 'startup' })).toBe('error')
    })
})

describe('resolveShellHeadline', () => {
    const base = { klipperState: 'ready', printerState: 'standby', filename: '', percent: 0, warmingUp: false }

    it('says the printer is ready when idle', () => {
        expect(resolveShellHeadline(base)).toEqual({ key: 'Ready', params: {} })
    })

    it('puts the progress in a sentence while printing', () => {
        const printing = { ...base, printerState: 'printing', filename: 'a.gcode', percent: 42 }

        expect(resolveShellHeadline(printing)).toEqual({ key: 'Printing', params: { percent: 42 } })
        expect(resolveShellHeadline({ ...printing, warmingUp: true })).toEqual({ key: 'WarmingUp', params: {} })
        expect(resolveShellHeadline({ ...printing, printerState: 'paused' })).toEqual({
            key: 'Paused',
            params: { percent: 42 },
        })
    })

    it('names how the print ended', () => {
        const ended = { ...base, filename: 'a.gcode', percent: 100 }

        expect(resolveShellHeadline({ ...ended, printerState: 'complete' }).key).toBe('Complete')
        expect(resolveShellHeadline({ ...ended, printerState: 'cancelled' }).key).toBe('Cancelled')
        expect(resolveShellHeadline({ ...ended, printerState: 'error' }).key).toBe('PrintFailed')
    })

    it('names the Klipper problem', () => {
        expect(resolveShellHeadline({ ...base, klipperState: 'shutdown' }).key).toBe('Shutdown')
        expect(resolveShellHeadline({ ...base, klipperState: 'error' }).key).toBe('KlipperError')
        expect(resolveShellHeadline({ ...base, klipperState: 'startup' }).key).toBe('Startup')
        expect(resolveShellHeadline({ ...base, klipperState: 'disconnected' }).key).toBe('Disconnected')
    })
})

describe('resolveHeatStatus', () => {
    it('is on target within two degrees', () => {
        expect(resolveHeatStatus({ temperature: 209.2, target: 210 })).toBe('onTarget')
        expect(resolveHeatStatus({ temperature: 211.9, target: 210 })).toBe('onTarget')
    })

    it('is heating below and cooling above the target', () => {
        expect(resolveHeatStatus({ temperature: 150, target: 210 })).toBe('heating')
        expect(resolveHeatStatus({ temperature: 230, target: 210 })).toBe('cooling')
    })

    it('is off without a target, or still hot after switching off', () => {
        expect(resolveHeatStatus({ temperature: 24, target: 0 })).toBe('off')
        expect(resolveHeatStatus({ temperature: 120, target: 0 })).toBe('hot')
    })
})

describe('resolveSensorTrend', () => {
    it('compares with an earlier reading', () => {
        expect(resolveSensorTrend(36, 34)).toBe('rising')
        expect(resolveSensorTrend(30, 34)).toBe('falling')
        expect(resolveSensorTrend(34.2, 34)).toBe('steady')
        expect(resolveSensorTrend(34.2, null)).toBe('steady')
    })
})

describe('formatShellDuration', () => {
    it('writes minutes and hours in words', () => {
        expect(formatShellDuration(51 * 60)).toBe('51 min')
        expect(formatShellDuration(72 * 60)).toBe('1 h 12 min')
        expect(formatShellDuration(3 * 3600 + 5 * 60)).toBe('3 h 05 min')
        expect(formatShellDuration(2 * 3600)).toBe('2 h 00 min')
    })

    it('handles short and missing durations', () => {
        expect(formatShellDuration(40)).toBe('< 1 min')
        expect(formatShellDuration(0)).toBe('--')
        expect(formatShellDuration(Number.NaN)).toBe('--')
    })
})

describe('formatShellTemperature', () => {
    it('rounds to whole degrees', () => {
        expect(formatShellTemperature(209.6)).toBe('210°')
        expect(formatShellTemperature(undefined)).toBe('--')
    })
})

describe('describePrintEvents', () => {
    const startedAt = 1_700_000_000_000

    it('lists the newest event first with its clock time', () => {
        const lines = describePrintEvents({
            startedAt,
            events: [
                { type: 'warmup', elapsed: 0 },
                { type: 'started', elapsed: 60 },
                { type: 'first-layer', elapsed: 360 },
            ],
        })

        expect(lines.map((line) => line.key)).toEqual(['FirstLayer', 'Started', 'Warmup'])
        expect(lines[0].at).toBe(startedAt + 360_000)
    })

    it('says how long a finished pause took', () => {
        const lines = describePrintEvents({
            startedAt,
            events: [
                { type: 'paused', elapsed: 1200 },
                { type: 'resumed', elapsed: 1320 },
                { type: 'paused', elapsed: 2000 },
            ],
        })

        expect(lines.map((line) => line.key)).toEqual(['Paused', 'Resumed', 'PausedFor'])
        expect(lines[2].params).toEqual({ duration: '2 min' })
    })

    it('carries the percent of a milestone and leaves unobserved times empty', () => {
        const lines = describePrintEvents({ startedAt, events: [{ type: 'milestone', elapsed: null, percent: 50 }] })

        expect(lines).toEqual([{ at: null, key: 'Milestone', params: { percent: 50 } }])
    })

    it('has nothing to say without a print', () => {
        expect(describePrintEvents(null)).toEqual([])
    })
})

describe('formatFilamentMeters', () => {
    it('writes metres with two decimals', () => {
        expect(formatFilamentMeters(4210)).toBe('4.21 m')
        expect(formatFilamentMeters(0)).toBe('0 m')
    })
})

describe('resolveGoToTargets', () => {
    it('finds the centre, front and back of the bed', () => {
        expect(resolveGoToTargets([-15, -15, -2, 0], [235, 235, 250, 0])).toEqual({
            centre: { x: 117.5, y: 117.5 },
            front: { x: 117.5, y: 5 },
            back: { x: 117.5, y: 230 },
        })
    })

    it('has no targets without usable axis limits', () => {
        expect(resolveGoToTargets([], [])).toBeNull()
        expect(resolveGoToTargets([0, 0], [0, 0])).toBeNull()
    })
})

describe('buildGoToScript', () => {
    const target = { x: 117.5, y: 5 }

    it('moves in absolute coordinates and restores the G-code state', () => {
        expect(buildGoToScript({ target, currentZ: 40, feedrateXY: 100, feedrateZ: 25 })).toBe(
            'SAVE_GCODE_STATE NAME=_ui_movement\nG90\nG1 X117.5 Y5 F6000\nRESTORE_GCODE_STATE NAME=_ui_movement'
        )
    })

    it('lifts a low nozzle before moving across the bed', () => {
        const script = buildGoToScript({ target, currentZ: 0.2, feedrateXY: 100, feedrateZ: 25 })

        expect(script.split('\n')).toEqual([
            'SAVE_GCODE_STATE NAME=_ui_movement',
            'G90',
            'G1 Z10 F1500',
            'G1 X117.5 Y5 F6000',
            'RESTORE_GCODE_STATE NAME=_ui_movement',
        ])
    })
})
