// Detects printer events (print started, finished, failed, ...) from two consecutive printer states.
import { isKlipperFault } from '@/plugins/errorExplainer'
import type { ErrorExplanation } from '@/plugins/errorExplainer'

export const printerEventNames = [
    'printStarted',
    'printFinished',
    'printFailed',
    'printPaused',
    'klipperError',
    'filamentRunout',
] as const

export type PrinterEventName = (typeof printerEventNames)[number]

export type PrinterEventSeverity = 'info' | 'success' | 'warning' | 'error'

export const printerEventSeverities: Record<PrinterEventName, PrinterEventSeverity> = {
    printStarted: 'info',
    printFinished: 'success',
    printFailed: 'error',
    printPaused: 'warning',
    klipperError: 'error',
    filamentRunout: 'warning',
}

export interface PrinterEvent {
    name: PrinterEventName
    // object name of the filament sensor, see filamentSensorLabel
    sensor?: string
}

export interface PrinterSnapshot {
    klipperState: string
    // print_stats.state, empty while unknown
    printState: string
    // enabled filament sensors: object name (e.g. "filament_switch_sensor runout") -> filament detected
    filamentSensors: Record<string, boolean>
}

const FILAMENT_SENSOR_PREFIXES = ['filament_switch_sensor', 'filament_motion_sensor']
// a filament runout pauses the print and a Klipper error fails it, which is not worth a second notification
const FOLLOW_UP_WINDOW_MS = 30000
const followUpEvents: Partial<Record<PrinterEventName, PrinterEventName>> = {
    printPaused: 'filamentRunout',
    printFailed: 'klipperError',
}

const isActivePrint = (printState: string): boolean => ['printing', 'paused'].includes(printState)

type PrinterObjects = Record<string, Record<string, unknown> | undefined>

export const buildPrinterSnapshot = (klipperState: string, printer: PrinterObjects | undefined): PrinterSnapshot => {
    const objects = printer ?? {}
    const filamentSensors: Record<string, boolean> = {}

    Object.keys(objects).forEach((key) => {
        const [type, ...nameParts] = key.split(' ')
        if (!FILAMENT_SENSOR_PREFIXES.includes(type) || nameParts.length === 0) return

        const sensor = objects[key]
        if (sensor?.enabled !== true) return

        // the full object name: sensors of different types can have the same name
        filamentSensors[key] = sensor.filament_detected === true
    })

    let printState = String(objects.print_stats?.state ?? '')
    // the timelapse plugin pauses the print for every frame
    const timelapsePause = objects['gcode_macro TIMELAPSE_TAKE_FRAME']?.is_paused === true
    if (printState === 'paused' && timelapsePause) printState = 'printing'

    return { klipperState, printState, filamentSensors }
}

// name of a filament sensor without its type, for display
export const filamentSensorLabel = (sensor: string): string => {
    const [type, ...nameParts] = sensor.split(' ')

    return nameParts.length > 0 ? nameParts.join(' ') : type
}

const detectRunouts = (previous: PrinterSnapshot, current: PrinterSnapshot): PrinterEvent[] => {
    // while the print is paused or no print is running, an empty sensor means the filament was unloaded
    if (previous.printState !== 'printing') return []

    return Object.keys(current.filamentSensors)
        .filter((sensor) => previous.filamentSensors[sensor] === true && !current.filamentSensors[sensor])
        .map((sensor) => ({ name: 'filamentRunout', sensor }))
}

const detectPrintStateEvent = (previous: string, current: string): PrinterEventName | null => {
    if (previous === current) return null

    if (current === 'printing' && !isActivePrint(previous)) return 'printStarted'
    if (current === 'paused' && previous === 'printing') return 'printPaused'
    if (current === 'complete') return 'printFinished'
    if (current === 'error') return 'printFailed'

    return null
}

// previous is null for the first state after the page was loaded: whatever is there already is not news
export const detectPrinterEvents = (previous: PrinterSnapshot | null, current: PrinterSnapshot): PrinterEvent[] => {
    if (previous === null) return []

    const events: PrinterEvent[] = []
    if (isKlipperFault(current.klipperState) && !isKlipperFault(previous.klipperState)) {
        events.push({ name: 'klipperError' })
        // the error also ends a running print: whether that is told as well is decided by dropFollowUpEvents
        if (previous.klipperState === 'ready' && isActivePrint(previous.printState)) {
            events.push({ name: 'printFailed' })
        }
    }

    // print data is stale while Klipper is not ready, and the first state after it got ready is a new baseline
    if (current.klipperState !== 'ready' || previous.klipperState !== 'ready') return events
    if (previous.printState === '') return events

    events.push(...detectRunouts(previous, current))

    const printEvent = detectPrintStateEvent(previous.printState, current.printState)
    if (printEvent !== null) events.push({ name: printEvent })

    return events
}

// drops events that are only the consequence of an event that is reported with them or was reported a moment ago
export const dropFollowUpEvents = (
    events: PrinterEvent[],
    lastFired: Partial<Record<PrinterEventName, number>>,
    now: number
): PrinterEvent[] => {
    return events.filter((event) => {
        const cause = followUpEvents[event.name]
        if (cause === undefined) return true
        if (events.some((other) => other.name === cause)) return false

        const firedAt = lastFired[cause]

        return firedAt === undefined || now - firedAt > FOLLOW_UP_WINDOW_MS
    })
}

// Some events are only told after a short delay, when they still hold:
// - the timelapse macro resumes the print and clears its is_paused flag right after, so for a moment the print
//   looks paused by the user,
// - a failed print can be cleared or restarted right away.
export const isEventStillCurrent = (name: PrinterEventName, current: PrinterSnapshot): boolean => {
    if (name === 'printPaused') return current.klipperState === 'ready' && current.printState === 'paused'
    // the print data is stale once Klipper stopped, but the print did fail
    if (name === 'printFailed') return isKlipperFault(current.klipperState) || current.printState === 'error'

    return true
}

// Splits the events that wait for their confirmation: a pending event is cancelled as soon as the state it
// was raised for ends. Otherwise a pause that was resumed and followed by a second pause would be confirmed by
// the second one, and told twice.
export const partitionPendingEvents = <T extends { event: PrinterEvent }>(
    pending: T[],
    current: PrinterSnapshot
): { kept: T[]; cancelled: T[] } => {
    const kept = pending.filter((entry) => isEventStillCurrent(entry.event.name, current))
    const cancelled = pending.filter((entry) => !kept.includes(entry))

    return { kept, cancelled }
}

// explanation for a paused print with an empty filament sensor: a runout, or filament that was pulled out
export const explainMissingFilament = (current: PrinterSnapshot): ErrorExplanation | null => {
    if (current.klipperState !== 'ready' || current.printState !== 'paused') return null

    const sensor = Object.keys(current.filamentSensors).find((name) => !current.filamentSensors[name])
    if (sensor === undefined) return null

    return {
        id: 'filamentMissing',
        known: true,
        raw: '',
        summary: '',
        params: { sensor: filamentSensorLabel(sensor) },
        actions: [],
    }
}
