// Timeline of the current print job, built from the print stats the UI already receives.
//
// Moonraker reports only the current state of a job, so the events are recorded while the status updates
// come in (advancePrintTimeline). When the page is opened in the middle of a print, the events that can still
// be told from the print stats are rebuilt and marked as approximate.
import Vue from 'vue'
import type { Store } from 'vuex'
import type { RootState } from '@/store/types'

export type PrintTimelineEventType =
    'warmup' | 'started' | 'first-layer' | 'milestone' | 'paused' | 'resumed' | 'complete' | 'cancelled' | 'error'

export interface PrintTimelineEvent {
    type: PrintTimelineEventType
    // seconds since the job was started (print_stats.total_duration), null if the moment was not observed
    elapsed: number | null
    approximate: boolean
    percent?: number
    layer?: number
    message?: string
}

export interface PrintTimelineSnapshot {
    state: string
    filename: string
    totalDuration: number
    printDuration: number
    // 0..1
    progress: number
    currentLayer: number
    message: string
    // the metadata of the printed file is loaded; before that, progress and layer are only rough fallbacks
    metadataLoaded: boolean
    // epoch in milliseconds
    now: number
}

export interface PrintTimeline {
    filename: string
    // epoch in milliseconds, null if the job had already ended when the page was opened
    startedAt: number | null
    events: PrintTimelineEvent[]
    last: PrintTimelineSnapshot
}

export type PrintTimelinePhaseType = 'warmup' | 'printing' | 'paused'

export interface PrintTimelinePhase {
    type: PrintTimelinePhaseType
    from: number
    to: number
}

const MILESTONE_PERCENTS = [25, 50, 75]
const SECOND_LAYER = 2
const activeStates = ['printing', 'paused']
const endStates = ['complete', 'cancelled', 'error']

const isActive = (state: string): boolean => activeStates.includes(state)
const isEnded = (state: string): boolean => endStates.includes(state)
const percentOf = (snapshot: PrintTimelineSnapshot): number => snapshot.progress * 100

const endEvent = (snapshot: PrintTimelineSnapshot): PrintTimelineEvent => {
    const event: PrintTimelineEvent = {
        type: snapshot.state as PrintTimelineEventType,
        elapsed: snapshot.totalDuration,
        approximate: false,
    }
    if (snapshot.message) event.message = snapshot.message

    return event
}

const isNewJob = (previous: PrintTimeline, snapshot: PrintTimelineSnapshot): boolean => {
    if (previous.filename !== snapshot.filename) return true
    if (snapshot.totalDuration < previous.last.totalDuration) return true

    return isEnded(previous.last.state) && isActive(snapshot.state)
}

// first snapshot of a job: usually the start of the print, but the page can also be opened later
const createTimeline = (snapshot: PrintTimelineSnapshot): PrintTimeline => {
    const events: PrintTimelineEvent[] = [{ type: 'warmup', elapsed: 0, approximate: false }]
    const unobserved = { elapsed: null, approximate: true }

    if (snapshot.printDuration > 0) {
        // pauses are part of this difference too, so it is only an estimate
        const elapsed = Math.max(0, snapshot.totalDuration - snapshot.printDuration)
        events.push({ type: 'started', elapsed, approximate: true })
    }
    if (snapshot.currentLayer >= SECOND_LAYER) events.push({ type: 'first-layer', ...unobserved })
    MILESTONE_PERCENTS.filter((percent) => percentOf(snapshot) >= percent).forEach((percent) => {
        events.push({ type: 'milestone', ...unobserved, percent })
    })
    // The pause began at some unknown earlier time. It is shown from this first look on, so the phases do
    // not count the ongoing pause as printing.
    if (snapshot.state === 'paused') {
        events.push({ type: 'paused', elapsed: snapshot.totalDuration, approximate: true })
    }
    if (isEnded(snapshot.state)) events.push(endEvent(snapshot))

    return {
        filename: snapshot.filename,
        startedAt: isActive(snapshot.state) ? snapshot.now - snapshot.totalDuration * 1000 : null,
        events,
        last: snapshot,
    }
}

const progressEvents = (previous: PrintTimeline, snapshot: PrintTimelineSnapshot): PrintTimelineEvent[] => {
    const events: PrintTimelineEvent[] = []
    const has = (type: PrintTimelineEventType, percent?: number) =>
        previous.events.some((event) => event.type === type && event.percent === percent)
    // The metadata arrives a moment after the print stats and corrects layer and progress. What shows up with
    // it happened at some earlier time, not now (page opened in the middle of a print).
    const revealed = !previous.last.metadataLoaded && snapshot.metadataLoaded
    const moment = revealed
        ? { elapsed: null, approximate: true }
        : { elapsed: snapshot.totalDuration, approximate: false }

    if (snapshot.printDuration > 0 && !has('started')) {
        const elapsed = Math.max(0, snapshot.totalDuration - snapshot.printDuration)
        events.push({ type: 'started', elapsed, approximate: false })
    }
    if (snapshot.currentLayer >= SECOND_LAYER && !has('first-layer')) events.push({ type: 'first-layer', ...moment })
    MILESTONE_PERCENTS.filter((percent) => percentOf(snapshot) >= percent && !has('milestone', percent)).forEach(
        (percent) => {
            const event: PrintTimelineEvent = { type: 'milestone', ...moment, percent }
            if (!revealed) event.layer = snapshot.currentLayer
            events.push(event)
        }
    )

    return events
}

const stateEvents = (previous: PrintTimeline, snapshot: PrintTimelineSnapshot): PrintTimelineEvent[] => {
    const before = previous.last.state
    if (before === snapshot.state) return []

    const observed = { elapsed: snapshot.totalDuration, approximate: false }
    if (snapshot.state === 'paused') return [{ type: 'paused', ...observed }]
    if (snapshot.state === 'printing' && before === 'paused') return [{ type: 'resumed', ...observed }]
    if (isEnded(snapshot.state) && !isEnded(before)) return [endEvent(snapshot)]

    return []
}

// returns the timeline after a status update; null while there is no print job
export const advancePrintTimeline = (
    previous: PrintTimeline | null,
    snapshot: PrintTimelineSnapshot
): PrintTimeline | null => {
    // only cleared print stats end a timeline
    if (snapshot.state === 'standby' && snapshot.filename === '') return null
    // anything else that is not a print job tells nothing, e.g. a selected file or incomplete data
    if (snapshot.filename === '' || (!isActive(snapshot.state) && !isEnded(snapshot.state))) return previous
    if (previous === null || isNewJob(previous, snapshot)) return createTimeline(snapshot)

    const changes = stateEvents(previous, snapshot)
    const progress = isActive(snapshot.state) ? progressEvents(previous, snapshot) : []
    // a resumed print can make progress in the same status update; a pause or the end comes after it
    const resumed = changes.some((event) => event.type === 'resumed')
    const events = resumed ? [...changes, ...progress] : [...progress, ...changes]

    return { ...previous, events: [...previous.events, ...events], last: snapshot }
}

// the elapsed time of the job, split into its phases (for the timeline bar)
export const getPrintTimelinePhases = (timeline: PrintTimeline | null): PrintTimelinePhase[] => {
    if (timeline === null) return []

    const phases: PrintTimelinePhase[] = []
    let type: PrintTimelinePhaseType = 'warmup'
    let from = 0
    let started = false
    let end = timeline.last.totalDuration
    const next = (nextType: PrintTimelinePhaseType, at: number) => {
        if (at > from) phases.push({ type, from, to: at })
        type = nextType
        from = Math.max(from, at)
    }

    for (const event of timeline.events) {
        if (event.elapsed === null) continue

        if (event.type === 'started') {
            started = true
            next('printing', event.elapsed)
        }
        if (event.type === 'paused') next('paused', event.elapsed)
        if (event.type === 'resumed') next(started ? 'printing' : 'warmup', event.elapsed)
        if (isEnded(event.type)) end = event.elapsed
    }
    if (end > from) phases.push({ type, from, to: end })

    return phases
}

// time since the start of the job as m:ss or h:mm:ss
export const formatPrintTimelineOffset = (elapsed: number): string => {
    const seconds = Math.max(0, Math.floor(elapsed))
    const padded = (value: number) => String(value).padStart(2, '0')
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) return `${hours}:${padded(minutes)}:${padded(seconds % 60)}`

    return `${minutes}:${padded(seconds % 60)}`
}

// ---------------------------------------------------------------------------------------------------------
// recording
// ---------------------------------------------------------------------------------------------------------

interface PrintTimelineSnapshotInput {
    // socket connected and Klipper ready
    ready: boolean
    printStats?: {
        state?: string
        filename?: string
        total_duration?: number
        print_duration?: number
        message?: string
    }
    // filename of the loaded metadata (printer.current_file)
    metadataFilename?: string
    timelapsePause: boolean
    progress: () => number
    currentLayer: () => number
    now: number
}

// null if the printer data tells nothing about a print job at the moment
export const createPrintTimelineSnapshot = (input: PrintTimelineSnapshotInput): PrintTimelineSnapshot | null => {
    // print_stats can be stale while Klipper is not ready
    if (!input.ready) return null
    // The printer data is emptied and loaded again when the websocket reconnects or Klipper reports ready.
    // That gap must not end the timeline of a running print.
    if (input.printStats === undefined) return null

    const printStats = input.printStats
    const filename = printStats.filename ?? ''
    // a pause for a timelapse frame is not a pause of the print (see printer_state in the base mixin)
    const state = printStats.state === 'paused' && input.timelapsePause ? 'printing' : (printStats.state ?? '')

    return {
        state,
        filename,
        totalDuration: printStats.total_duration ?? 0,
        printDuration: printStats.print_duration ?? 0,
        progress: input.progress(),
        currentLayer: input.currentLayer(),
        message: printStats.message ?? '',
        metadataLoaded: filename !== '' && input.metadataFilename === filename,
        now: input.now,
    }
}

// reactive, for the print hero panel
export const recordedPrintTimeline = Vue.observable<{ timeline: PrintTimeline | null }>({ timeline: null })
let recordedStore: Store<RootState> | null = null

const readSnapshot = (store: Store<RootState>): PrintTimelineSnapshot | null => {
    const state = store.state

    return createPrintTimelineSnapshot({
        ready:
            (state.socket?.isConnected ?? false) &&
            (state.server?.klippy_connected ?? false) &&
            state.server?.klippy_state === 'ready',
        printStats: state.printer?.print_stats,
        metadataFilename: state.printer?.current_file?.filename,
        timelapsePause: state.printer?.['gcode_macro TIMELAPSE_TAKE_FRAME']?.is_paused ?? false,
        progress: () => store.getters['printer/getPrintPercent'] ?? 0,
        currentLayer: () => store.getters['printer/getPrintCurrentLayer'] ?? 0,
        now: Date.now(),
    })
}

// Called once when the app starts (src/main.ts) and records for the lifetime of the store, so that no event is
// lost while the dashboard is not open or the print hero panel is hidden.
export const startPrintTimelineRecording = (store: Store<RootState>): void => {
    if (recordedStore === store) return

    recordedStore = store
    store.watch(
        () => readSnapshot(store),
        (snapshot) => {
            if (snapshot === null) return

            recordedPrintTimeline.timeline = advancePrintTimeline(recordedPrintTimeline.timeline, snapshot)
        },
        { immediate: true }
    )
}
