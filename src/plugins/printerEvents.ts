// Detects printer events (print started, finished, failed, ...) from two consecutive printer states.
import { isKlipperFault } from '@/plugins/errorExplainer'

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
    sensor?: string
}

export interface PrinterSnapshot {
    klipperState: string
    // print_stats.state, empty while unknown
    printState: string
    // enabled filament sensors: name -> filament detected
    filamentSensors: Record<string, boolean>
}

const FILAMENT_SENSOR_PREFIXES = ['filament_switch_sensor', 'filament_motion_sensor']
// a filament runout pauses the print, which is not worth a second notification
const FOLLOW_UP_WINDOW_MS = 30000
const followUpEvents: Partial<Record<PrinterEventName, PrinterEventName>> = {
    printPaused: 'filamentRunout',
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

        filamentSensors[nameParts.join(' ')] = sensor.filament_detected === true
    })

    let printState = String(objects.print_stats?.state ?? '')
    // the timelapse plugin pauses the print for every frame
    const timelapsePause = objects['gcode_macro TIMELAPSE_TAKE_FRAME']?.is_paused === true
    if (printState === 'paused' && timelapsePause) printState = 'printing'

    return { klipperState, printState, filamentSensors }
}

const detectRunouts = (previous: PrinterSnapshot, current: PrinterSnapshot): PrinterEvent[] => {
    // without a print, an empty sensor just means the filament was unloaded
    if (!isActivePrint(previous.printState) && !isActivePrint(current.printState)) return []

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
