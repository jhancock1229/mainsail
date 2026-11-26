import Vue from 'vue'
import type { Store } from 'vuex'
import type { RootState } from '@/store/types'

export type PrintTimelineEventType =
    'warmup' | 'started' | 'first-layer' | 'milestone' | 'paused' | 'resumed' | 'complete' | 'cancelled' | 'error'

export interface PrintTimelineEvent {
    type: PrintTimelineEventType
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
    progress: number
    currentLayer: number
    message: string
    metadataLoaded: boolean
    now: number
}

export interface PrintTimeline {
    filename: string
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

const createTimeline = (snapshot: PrintTimelineSnapshot): PrintTimeline => {
    const events: PrintTimelineEvent[] = [{ type: 'warmup', elapsed: 0, approximate: false }]
    const unobserved = { elapsed: null, approximate: true }

    if (snapshot.printDuration > 0) {
        const elapsed = Math.max(0, snapshot.totalDuration - snapshot.printDuration)
        events.push({ type: 'started', elapsed, approximate: true })
    }
    if (snapshot.currentLayer >= SECOND_LAYER) events.push({ type: 'first-layer', ...unobserved })
    MILESTONE_PERCENTS.filter((percent) => percentOf(snapshot) >= percent).forEach((percent) => {
        events.push({ type: 'milestone', ...unobserved, percent })
    })
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

export const advancePrintTimeline = (
    previous: PrintTimeline | null,
    snapshot: PrintTimelineSnapshot
): PrintTimeline | null => {
    if (snapshot.state === 'standby' && snapshot.filename === '') return null
    if (snapshot.filename === '' || (!isActive(snapshot.state) && !isEnded(snapshot.state))) return previous
    if (previous === null || isNewJob(previous, snapshot)) return createTimeline(snapshot)

    const changes = stateEvents(previous, snapshot)
    const progress = isActive(snapshot.state) ? progressEvents(previous, snapshot) : []
    const resumed = changes.some((event) => event.type === 'resumed')
    const events = resumed ? [...changes, ...progress] : [...progress, ...changes]

    return { ...previous, events: [...previous.events, ...events], last: snapshot }
}

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

export const formatPrintTimelineOffset = (elapsed: number): string => {
    const seconds = Math.max(0, Math.floor(elapsed))
    const padded = (value: number) => String(value).padStart(2, '0')
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) return `${hours}:${padded(minutes)}:${padded(seconds % 60)}`

    return `${minutes}:${padded(seconds % 60)}`
}

interface PrintTimelineSnapshotInput {
    ready: boolean
    printStats?: {
        state?: string
        filename?: string
        total_duration?: number
        print_duration?: number
        message?: string
    }
    metadataFilename?: string
    timelapsePause: boolean
    progress: () => number
    currentLayer: () => number
    now: number
}

export const createPrintTimelineSnapshot = (input: PrintTimelineSnapshotInput): PrintTimelineSnapshot | null => {
    if (!input.ready) return null
    if (input.printStats === undefined) return null

    const printStats = input.printStats
    const filename = printStats.filename ?? ''
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
