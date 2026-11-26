import { describe, expect, it } from 'vitest'
import { buildPrinterSnapshot, detectPrinterEvents, dropFollowUpEvents } from '@/plugins/printerEvents'
import type { PrinterSnapshot } from '@/plugins/printerEvents'

const snapshot = (values: Partial<PrinterSnapshot> = {}): PrinterSnapshot => ({
    klipperState: 'ready',
    printState: 'standby',
    filamentSensors: {},
    ...values,
})

const names = (previous: PrinterSnapshot | null, current: PrinterSnapshot) =>
    detectPrinterEvents(previous, current).map((event) => event.name)

describe('detectPrinterEvents', () => {
    it('does not fire on page load for a state that was already there', () => {
        expect(names(null, snapshot({ printState: 'printing' }))).toEqual([])
        expect(names(null, snapshot({ printState: 'error' }))).toEqual([])
        expect(names(null, snapshot({ klipperState: 'shutdown' }))).toEqual([])
    })

    it('does not fire when nothing changed', () => {
        expect(names(snapshot({ printState: 'printing' }), snapshot({ printState: 'printing' }))).toEqual([])
        expect(names(snapshot({ klipperState: 'shutdown' }), snapshot({ klipperState: 'shutdown' }))).toEqual([])
    })

    it('detects a started print', () => {
        expect(names(snapshot(), snapshot({ printState: 'printing' }))).toEqual(['printStarted'])
        expect(names(snapshot({ printState: 'complete' }), snapshot({ printState: 'printing' }))).toEqual([
            'printStarted',
        ])
    })

    it('detects a paused print, and does not report a resumed print as started', () => {
        expect(names(snapshot({ printState: 'printing' }), snapshot({ printState: 'paused' }))).toEqual(['printPaused'])
        expect(names(snapshot({ printState: 'paused' }), snapshot({ printState: 'printing' }))).toEqual([])
    })

    it('detects a finished print', () => {
        expect(names(snapshot({ printState: 'printing' }), snapshot({ printState: 'complete' }))).toEqual([
            'printFinished',
        ])
    })

    it('detects a failed print', () => {
        expect(names(snapshot({ printState: 'printing' }), snapshot({ printState: 'error' }))).toEqual(['printFailed'])
        expect(names(snapshot({ printState: 'paused' }), snapshot({ printState: 'error' }))).toEqual(['printFailed'])
        // a print that fails right at the start can skip the printing state between two updates
        expect(names(snapshot(), snapshot({ printState: 'error' }))).toEqual(['printFailed'])
    })

    it('stays quiet for a cancelled or cleared print', () => {
        expect(names(snapshot({ printState: 'printing' }), snapshot({ printState: 'cancelled' }))).toEqual([])
        expect(names(snapshot({ printState: 'error' }), snapshot({ printState: 'standby' }))).toEqual([])
    })

    it('detects Klipper going into error or shutdown', () => {
        expect(names(snapshot(), snapshot({ klipperState: 'shutdown' }))).toEqual(['klipperError'])
        expect(names(snapshot({ klipperState: 'startup' }), snapshot({ klipperState: 'error' }))).toEqual([
            'klipperError',
        ])
        expect(names(snapshot({ klipperState: 'shutdown' }), snapshot({ klipperState: 'error' }))).toEqual([])
    })

    it('reports a shutdown during a print once, as a Klipper error', () => {
        const before = snapshot({ printState: 'printing' })

        expect(names(before, snapshot({ klipperState: 'shutdown', printState: 'error' }))).toEqual(['klipperError'])
    })

    it('ignores stale print data while Klipper is not ready', () => {
        const shutdown = snapshot({ klipperState: 'shutdown', printState: 'printing' })

        expect(names(shutdown, snapshot({ klipperState: 'shutdown', printState: 'error' }))).toEqual([])
        expect(names(shutdown, snapshot({ klipperState: 'disconnected', printState: 'complete' }))).toEqual([])
        expect(names(shutdown, snapshot({ klipperState: 'startup', printState: 'paused' }))).toEqual([])
    })

    it('takes a new baseline when Klipper becomes ready again', () => {
        const starting = snapshot({ klipperState: 'startup', printState: 'standby' })

        expect(names(starting, snapshot({ printState: 'printing' }))).toEqual([])
        expect(names(starting, snapshot({ printState: 'error' }))).toEqual([])
        expect(names(starting, snapshot({ printState: 'complete' }))).toEqual([])
    })

    it('does not fire while the print state is still unknown', () => {
        expect(names(snapshot({ printState: '' }), snapshot({ printState: 'complete' }))).toEqual([])
        expect(names(snapshot({ printState: '' }), snapshot({ printState: 'printing' }))).toEqual([])
    })

    it('detects a filament runout during a print, with the sensor name', () => {
        const before = snapshot({ printState: 'printing', filamentSensors: { runout_sensor: true } })
        const after = snapshot({ printState: 'printing', filamentSensors: { runout_sensor: false } })

        expect(detectPrinterEvents(before, after)).toEqual([{ name: 'filamentRunout', sensor: 'runout_sensor' }])
    })

    it('reports a runout before the pause it causes', () => {
        const before = snapshot({ printState: 'printing', filamentSensors: { runout_sensor: true } })
        const after = snapshot({ printState: 'paused', filamentSensors: { runout_sensor: false } })

        expect(names(before, after)).toEqual(['filamentRunout', 'printPaused'])
    })

    it('does not report a runout while no print is running', () => {
        const before = snapshot({ filamentSensors: { runout_sensor: true } })
        const after = snapshot({ filamentSensors: { runout_sensor: false } })

        expect(names(before, after)).toEqual([])
    })

    it('does not report a sensor that was already empty, was just added or is back in', () => {
        const printing = (filamentSensors: Record<string, boolean>) =>
            snapshot({ printState: 'printing', filamentSensors })

        expect(names(printing({ a: false }), printing({ a: false }))).toEqual([])
        expect(names(printing({}), printing({ a: false }))).toEqual([])
        expect(names(printing({ a: false }), printing({ a: true }))).toEqual([])
    })
})

describe('dropFollowUpEvents', () => {
    const paused = [{ name: 'printPaused' as const }]

    it('drops the pause that follows a filament runout', () => {
        expect(dropFollowUpEvents(paused, { filamentRunout: 1000 }, 5000)).toEqual([])
    })

    it('drops the pause that comes together with a filament runout', () => {
        const runout = { name: 'filamentRunout' as const, sensor: 'runout_sensor' }

        expect(dropFollowUpEvents([runout, ...paused], {}, 5000)).toEqual([runout])
    })

    it('keeps a pause without a recent runout', () => {
        expect(dropFollowUpEvents(paused, {}, 5000)).toEqual(paused)
        expect(dropFollowUpEvents(paused, { filamentRunout: 1000 }, 120000)).toEqual(paused)
    })

    it('keeps other events', () => {
        const events = [{ name: 'printFailed' as const }, { name: 'klipperError' as const }]

        expect(dropFollowUpEvents(events, { filamentRunout: 1000 }, 2000)).toEqual(events)
    })
})

describe('buildPrinterSnapshot', () => {
    it('reads the print state and the enabled filament sensors', () => {
        const result = buildPrinterSnapshot('ready', {
            print_stats: { state: 'printing' },
            'filament_switch_sensor runout': { enabled: true, filament_detected: true },
            'filament_motion_sensor encoder': { enabled: true, filament_detected: false },
            'filament_switch_sensor off': { enabled: false, filament_detected: false },
            'gcode_macro FILAMENT': { enabled: true, filament_detected: false },
        })

        expect(result).toEqual({
            klipperState: 'ready',
            printState: 'printing',
            filamentSensors: { runout: true, encoder: false },
        })
    })

    it('treats the pause of a timelapse frame as printing', () => {
        const result = buildPrinterSnapshot('ready', {
            print_stats: { state: 'paused' },
            'gcode_macro TIMELAPSE_TAKE_FRAME': { is_paused: true },
        })

        expect(result.printState).toBe('printing')
    })

    it('has safe fallbacks for a printer without data', () => {
        expect(buildPrinterSnapshot('disconnected', {})).toEqual({
            klipperState: 'disconnected',
            printState: '',
            filamentSensors: {},
        })
        expect(buildPrinterSnapshot('ready', undefined).printState).toBe('')
    })
})
