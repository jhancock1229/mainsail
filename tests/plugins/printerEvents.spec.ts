import { describe, expect, it } from 'vitest'
import {
    buildPrinterSnapshot,
    detectPrinterEvents,
    dropFollowUpEvents,
    explainMissingFilament,
    filamentSensorLabel,
    isEventStillCurrent,
    partitionPendingEvents,
} from '@/plugins/printerEvents'
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

    it('reports a shutdown during a print as a Klipper error and a failed print', () => {
        const both = ['klipperError', 'printFailed']

        expect(names(snapshot({ printState: 'printing' }), snapshot({ klipperState: 'shutdown' }))).toEqual(both)
        expect(
            names(snapshot({ printState: 'paused' }), snapshot({ klipperState: 'shutdown', printState: 'error' }))
        ).toEqual(both)
    })

    it('does not report a failed print for a shutdown without a running print', () => {
        expect(names(snapshot(), snapshot({ klipperState: 'shutdown' }))).toEqual(['klipperError'])
        expect(names(snapshot({ printState: 'complete' }), snapshot({ klipperState: 'error' }))).toEqual([
            'klipperError',
        ])
        expect(names(snapshot({ printState: 'error' }), snapshot({ klipperState: 'shutdown' }))).toEqual([
            'klipperError',
        ])
        expect(
            names(snapshot({ klipperState: 'startup', printState: 'printing' }), snapshot({ klipperState: 'error' }))
        ).toEqual(['klipperError'])
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

    it('detects a filament runout during a print, with the sensor', () => {
        const sensor = 'filament_switch_sensor runout_sensor'
        const before = snapshot({ printState: 'printing', filamentSensors: { [sensor]: true } })
        const after = snapshot({ printState: 'printing', filamentSensors: { [sensor]: false } })

        expect(detectPrinterEvents(before, after)).toEqual([{ name: 'filamentRunout', sensor }])
    })

    it('does not report filament that is pulled out while the print is paused', () => {
        const before = snapshot({ printState: 'paused', filamentSensors: { runout_sensor: true } })

        expect(names(before, snapshot({ printState: 'paused', filamentSensors: { runout_sensor: false } }))).toEqual([])
        expect(names(before, snapshot({ printState: 'printing', filamentSensors: { runout_sensor: false } }))).toEqual(
            []
        )
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
        const events = [{ name: 'printFinished' as const }, { name: 'klipperError' as const }]

        expect(dropFollowUpEvents(events, { filamentRunout: 1000 }, 2000)).toEqual(events)
    })

    const failed = [{ name: 'printFailed' as const }]
    const klipperError = { name: 'klipperError' as const }

    it('drops the failed print that comes with or right after a Klipper error', () => {
        expect(dropFollowUpEvents([klipperError, ...failed], {}, 5000)).toEqual([klipperError])
        expect(dropFollowUpEvents(failed, { klipperError: 4000 }, 5000)).toEqual([])
    })

    it('keeps the failed print when no Klipper error was told', () => {
        expect(dropFollowUpEvents(failed, {}, 5000)).toEqual(failed)
        expect(dropFollowUpEvents(failed, { klipperError: 1000 }, 120000)).toEqual(failed)
    })
})

describe('isEventStillCurrent', () => {
    it('confirms a pause that lasts', () => {
        expect(isEventStillCurrent('printPaused', snapshot({ printState: 'paused' }))).toBe(true)
    })

    it('rejects a pause that was over a moment later', () => {
        expect(isEventStillCurrent('printPaused', snapshot({ printState: 'printing' }))).toBe(false)
        expect(isEventStillCurrent('printPaused', snapshot({ printState: 'cancelled' }))).toBe(false)
        expect(isEventStillCurrent('printPaused', snapshot({ klipperState: 'shutdown', printState: 'paused' }))).toBe(
            false
        )
    })

    it('rejects the pause of a timelapse frame whose flag and print state arrive in different updates', () => {
        const frame = (state: string, isPaused: boolean) =>
            buildPrinterSnapshot('ready', {
                print_stats: { state },
                'gcode_macro TIMELAPSE_TAKE_FRAME': { is_paused: isPaused },
            })
        const takingFrame = frame('paused', true)
        const flagCleared = frame('paused', false)
        const resumed = frame('printing', false)

        expect(detectPrinterEvents(frame('printing', false), takingFrame)).toEqual([])
        expect(detectPrinterEvents(takingFrame, flagCleared)).toEqual([{ name: 'printPaused' }])
        expect(isEventStillCurrent('printPaused', resumed)).toBe(false)
        expect(detectPrinterEvents(flagCleared, resumed)).toEqual([])
    })

    it('confirms a failed print, also when Klipper stopped in the meantime', () => {
        expect(isEventStillCurrent('printFailed', snapshot({ printState: 'error' }))).toBe(true)
        expect(isEventStillCurrent('printFailed', snapshot({ klipperState: 'shutdown', printState: 'printing' }))).toBe(
            true
        )
    })

    it('rejects a failed print that was cleared or restarted already', () => {
        expect(isEventStillCurrent('printFailed', snapshot({ printState: 'standby' }))).toBe(false)
        expect(isEventStillCurrent('printFailed', snapshot({ printState: 'printing' }))).toBe(false)
    })

    it('confirms all other events', () => {
        expect(isEventStillCurrent('printFinished', snapshot())).toBe(true)
        expect(isEventStillCurrent('klipperError', snapshot())).toBe(true)
    })
})

describe('filamentSensorLabel', () => {
    it('strips the type of the sensor', () => {
        expect(filamentSensorLabel('filament_switch_sensor runout_sensor')).toBe('runout_sensor')
        expect(filamentSensorLabel('filament_motion_sensor my encoder')).toBe('my encoder')
        expect(filamentSensorLabel('odd')).toBe('odd')
    })
})

describe('explainMissingFilament', () => {
    const sensor = 'filament_switch_sensor runout_sensor'

    it('explains a paused print with an empty filament sensor', () => {
        const result = explainMissingFilament(snapshot({ printState: 'paused', filamentSensors: { [sensor]: false } }))

        expect(result?.id).toBe('filamentMissing')
        expect(result?.known).toBe(true)
        expect(result?.params.sensor).toBe('runout_sensor')
        expect(result?.raw).toBe('')
        expect(result?.actions).toEqual([])
    })

    it('returns null when the filament is there, the print is not paused or Klipper is not ready', () => {
        expect(
            explainMissingFilament(snapshot({ printState: 'paused', filamentSensors: { [sensor]: true } }))
        ).toBeNull()
        expect(explainMissingFilament(snapshot({ printState: 'paused' }))).toBeNull()
        expect(
            explainMissingFilament(snapshot({ printState: 'printing', filamentSensors: { [sensor]: false } }))
        ).toBeNull()
        expect(
            explainMissingFilament(snapshot({ printState: 'standby', filamentSensors: { [sensor]: false } }))
        ).toBeNull()
        expect(
            explainMissingFilament(
                snapshot({ klipperState: 'shutdown', printState: 'paused', filamentSensors: { [sensor]: false } })
            )
        ).toBeNull()
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
            filamentSensors: { 'filament_switch_sensor runout': true, 'filament_motion_sensor encoder': false },
        })
    })

    it('keeps sensors of different types with the same name apart', () => {
        const result = buildPrinterSnapshot('ready', {
            'filament_switch_sensor toolhead': { enabled: true, filament_detected: true },
            'filament_motion_sensor toolhead': { enabled: true, filament_detected: false },
        })

        expect(result.filamentSensors).toEqual({
            'filament_switch_sensor toolhead': true,
            'filament_motion_sensor toolhead': false,
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

describe('partitionPendingEvents', () => {
    const pending = (name: 'printPaused' | 'printFailed', id: number) => ({ event: { name }, id })

    it('keeps a pending event while its transition still holds', () => {
        const paused = pending('printPaused', 1)
        const failed = pending('printFailed', 2)

        expect(partitionPendingEvents([paused], snapshot({ printState: 'paused' }))).toEqual({
            kept: [paused],
            cancelled: [],
        })
        expect(partitionPendingEvents([failed], snapshot({ printState: 'error' }))).toEqual({
            kept: [failed],
            cancelled: [],
        })
    })

    it('cancels a pending pause as soon as the print is not paused anymore', () => {
        const paused = pending('printPaused', 1)

        expect(partitionPendingEvents([paused], snapshot({ printState: 'printing' }))).toEqual({
            kept: [],
            cancelled: [paused],
        })
    })

    it('cancels a pending failed print as soon as the print is cleared or restarted', () => {
        const failed = pending('printFailed', 1)

        expect(partitionPendingEvents([failed], snapshot({ printState: 'standby' })).cancelled).toEqual([failed])
        expect(partitionPendingEvents([failed], snapshot({ printState: 'printing' })).cancelled).toEqual([failed])
        expect(partitionPendingEvents([failed], snapshot({ klipperState: 'shutdown' })).kept).toEqual([failed])
    })

    it('lets only the second pause through when a print pauses, resumes and pauses again', () => {
        const first = pending('printPaused', 1)
        const second = pending('printPaused', 2)

        const afterResume = partitionPendingEvents([first], snapshot({ printState: 'printing' }))
        expect(afterResume.kept).toEqual([])

        const afterSecondPause = partitionPendingEvents(
            [...afterResume.kept, second],
            snapshot({ printState: 'paused' })
        )
        expect(afterSecondPause.kept).toEqual([second])
    })
})
