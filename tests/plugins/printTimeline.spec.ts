import { describe, expect, it } from 'vitest'
import {
    advancePrintTimeline,
    createPrintTimelineSnapshot,
    formatPrintTimelineOffset,
    getPrintTimelinePhases,
    type PrintTimeline,
    type PrintTimelineSnapshot,
} from '@/plugins/printTimeline'

const START = 1_700_000_000_000

const snapshot = (overrides: Partial<PrintTimelineSnapshot> = {}): PrintTimelineSnapshot => ({
    state: 'printing',
    filename: 'demo.gcode',
    totalDuration: 0,
    printDuration: 0,
    progress: 0,
    currentLayer: 0,
    message: '',
    metadataLoaded: true,
    now: START,
    ...overrides,
})

// feeds the snapshots one after another, like the status updates of a running print
const run = (snapshots: Partial<PrintTimelineSnapshot>[], initial: PrintTimeline | null = null) =>
    snapshots.reduce<PrintTimeline | null>(
        (timeline, entry) =>
            advancePrintTimeline(timeline, snapshot({ now: START + (entry.totalDuration ?? 0) * 1000, ...entry })),
        initial
    )

const types = (timeline: PrintTimeline | null) => timeline?.events.map((event) => event.type) ?? []

describe('advancePrintTimeline', () => {
    it('has no timeline while the printer is idle', () => {
        expect(advancePrintTimeline(null, snapshot({ state: 'standby', filename: '' }))).toBeNull()
        expect(advancePrintTimeline(null, snapshot({ state: 'printing', filename: '' }))).toBeNull()
    })

    it('starts with the warm-up when a print is started', () => {
        const timeline = run([{ totalDuration: 0 }])

        expect(timeline?.filename).toBe('demo.gcode')
        expect(timeline?.startedAt).toBe(START)
        expect(timeline?.events).toEqual([{ type: 'warmup', elapsed: 0, approximate: false }])
    })

    it('records the start of the print when the first filament is extruded', () => {
        const timeline = run([{ totalDuration: 0 }, { totalDuration: 30 }, { totalDuration: 38.5, printDuration: 0.5 }])

        expect(timeline?.events[1]).toEqual({ type: 'started', elapsed: 38, approximate: false })
    })

    it('records the first layer and the progress milestones once', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 40, printDuration: 2, currentLayer: 1, progress: 0.01 },
            { totalDuration: 50, printDuration: 12, currentLayer: 2, progress: 0.05 },
            { totalDuration: 60, printDuration: 22, currentLayer: 3, progress: 0.1 },
            { totalDuration: 200, printDuration: 162, currentLayer: 30, progress: 0.26 },
            { totalDuration: 210, printDuration: 172, currentLayer: 31, progress: 0.27 },
            { totalDuration: 400, printDuration: 362, currentLayer: 91, progress: 0.76 },
        ])

        expect(types(timeline)).toEqual(['warmup', 'started', 'first-layer', 'milestone', 'milestone', 'milestone'])
        expect(timeline?.events[2]).toEqual({ type: 'first-layer', elapsed: 50, approximate: false })
        expect(timeline?.events[3]).toEqual({
            type: 'milestone',
            elapsed: 200,
            approximate: false,
            percent: 25,
            layer: 30,
        })
        expect(timeline?.events.slice(4).map((event) => event.percent)).toEqual([50, 75])
    })

    it('records pauses and resumes', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 10, printDuration: 5 },
            { totalDuration: 20, printDuration: 15, state: 'paused' },
            { totalDuration: 50, printDuration: 15, state: 'paused' },
            { totalDuration: 55, printDuration: 16 },
            { totalDuration: 70, printDuration: 31, state: 'paused' },
        ])

        expect(types(timeline)).toEqual(['warmup', 'started', 'paused', 'resumed', 'paused'])
        expect(timeline?.events.map((event) => event.elapsed)).toEqual([0, 5, 20, 55, 70])
    })

    it('lists a resume before the progress that was made in the same status update', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 10, printDuration: 5, progress: 0.2 },
            { totalDuration: 20, printDuration: 15, progress: 0.24, state: 'paused' },
            { totalDuration: 30, printDuration: 16, progress: 0.26 },
            { totalDuration: 40, printDuration: 26, progress: 0.51, state: 'paused' },
        ])

        expect(types(timeline)).toEqual(['warmup', 'started', 'paused', 'resumed', 'milestone', 'milestone', 'paused'])
    })

    it('closes the timeline when the print finishes, fails or is cancelled', () => {
        const base = [{ totalDuration: 0 }, { totalDuration: 10, printDuration: 5 }]

        expect(
            run([...base, { totalDuration: 600, printDuration: 590, state: 'complete', progress: 1 }])?.events.at(-1)
        ).toEqual({ type: 'complete', elapsed: 600, approximate: false })
        expect(run([...base, { totalDuration: 90, state: 'cancelled' }])?.events.at(-1)).toEqual({
            type: 'cancelled',
            elapsed: 90,
            approximate: false,
        })
        expect(
            run([...base, { totalDuration: 90, state: 'error', message: 'Heater extruder not heating' }])?.events.at(-1)
        ).toEqual({ type: 'error', elapsed: 90, approximate: false, message: 'Heater extruder not heating' })
    })

    it('records the end only once', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 90, state: 'complete', progress: 1 },
            { totalDuration: 90, state: 'complete', progress: 1 },
        ])

        expect(types(timeline)).toEqual(['warmup', 'complete'])
    })

    it('clears the timeline when the print stats are cleared', () => {
        const timeline = run([{ totalDuration: 0 }, { totalDuration: 90, state: 'complete' }])

        expect(advancePrintTimeline(timeline, snapshot({ state: 'standby', filename: '' }))).toBeNull()
    })

    it('keeps the timeline when a status update tells nothing about the print', () => {
        const timeline = run([{ totalDuration: 0 }, { totalDuration: 10, printDuration: 5, state: 'paused' }])

        // print_stats is empty for a moment while the printer data is loaded again after a reconnect
        expect(advancePrintTimeline(timeline, snapshot({ state: '', filename: '' }))).toBe(timeline)
        expect(advancePrintTimeline(timeline, snapshot({ state: 'printing', filename: '' }))).toBe(timeline)
        // a file that is selected but not started
        expect(advancePrintTimeline(timeline, snapshot({ state: 'standby', filename: 'other.gcode' }))).toBe(timeline)
        expect(advancePrintTimeline(null, snapshot({ state: 'standby', filename: 'other.gcode' }))).toBeNull()
    })

    it('starts a new timeline for another file and for a reprint of the same file', () => {
        const finished = run([{ totalDuration: 0 }, { totalDuration: 90, printDuration: 80, state: 'complete' }])

        const other = run([{ totalDuration: 0, filename: 'other.gcode' }], finished)
        expect(other?.filename).toBe('other.gcode')
        expect(types(other)).toEqual(['warmup'])

        const reprint = run([{ totalDuration: 0 }], finished)
        expect(types(reprint)).toEqual(['warmup'])
    })

    it('does not mutate the previous timeline', () => {
        const before = run([{ totalDuration: 0 }])
        const copy = JSON.parse(JSON.stringify(before))
        run([{ totalDuration: 10, printDuration: 5, state: 'paused' }], before)

        expect(before).toEqual(copy)
    })

    describe('when the page is opened in the middle of a print', () => {
        it('rebuilds what the print stats still tell and marks it as approximate', () => {
            const timeline = run([{ totalDuration: 300, printDuration: 260, currentLayer: 70, progress: 0.58 }])

            expect(timeline?.startedAt).toBe(START)
            expect(timeline?.events).toEqual([
                { type: 'warmup', elapsed: 0, approximate: false },
                { type: 'started', elapsed: 40, approximate: true },
                { type: 'first-layer', elapsed: null, approximate: true },
                { type: 'milestone', elapsed: null, approximate: true, percent: 25 },
                { type: 'milestone', elapsed: null, approximate: true, percent: 50 },
            ])
        })

        it('continues with exact events afterwards', () => {
            const timeline = run([
                { totalDuration: 300, printDuration: 260, currentLayer: 70, progress: 0.58 },
                { totalDuration: 400, printDuration: 360, currentLayer: 91, progress: 0.76 },
            ])

            expect(timeline?.events.at(-1)).toEqual({
                type: 'milestone',
                elapsed: 400,
                approximate: false,
                percent: 75,
                layer: 91,
            })
        })

        // layer and progress are only right once the metadata of the file is loaded, which takes a moment
        it('does not stamp what the metadata of the file reveals with the time the page was opened', () => {
            const timeline = run([
                { totalDuration: 300, printDuration: 260, currentLayer: 0, progress: 0.24, metadataLoaded: false },
                { totalDuration: 300.5, printDuration: 260.5, currentLayer: 70, progress: 0.58 },
            ])

            expect(timeline?.events).toEqual([
                { type: 'warmup', elapsed: 0, approximate: false },
                { type: 'started', elapsed: 40, approximate: true },
                { type: 'first-layer', elapsed: null, approximate: true },
                { type: 'milestone', elapsed: null, approximate: true, percent: 25 },
                { type: 'milestone', elapsed: null, approximate: true, percent: 50 },
            ])
        })

        it('records exact events again after the metadata is loaded', () => {
            const timeline = run([
                { totalDuration: 300, printDuration: 260, currentLayer: 0, progress: 0.24, metadataLoaded: false },
                { totalDuration: 300.5, printDuration: 260.5, currentLayer: 70, progress: 0.58 },
                { totalDuration: 400, printDuration: 360, currentLayer: 91, progress: 0.76 },
            ])

            expect(timeline?.events.at(-1)).toEqual({
                type: 'milestone',
                elapsed: 400,
                approximate: false,
                percent: 75,
                layer: 91,
            })
        })

        it('still records the start of the print exactly when it comes with the metadata', () => {
            const timeline = run([
                { totalDuration: 0, metadataLoaded: false },
                { totalDuration: 0.5, printDuration: 0.5, currentLayer: 2, progress: 0.01 },
            ])

            expect(timeline?.events).toEqual([
                { type: 'warmup', elapsed: 0, approximate: false },
                { type: 'started', elapsed: 0, approximate: false },
                { type: 'first-layer', elapsed: null, approximate: true },
            ])
        })

        it('knows that the print is paused, but not since when', () => {
            const timeline = run([{ totalDuration: 300, printDuration: 100, state: 'paused', progress: 0.1 }])

            expect(timeline?.events.at(-1)).toEqual({ type: 'paused', elapsed: null, approximate: true })
        })

        it('knows how a finished print ended, but not when it was started', () => {
            const timeline = advancePrintTimeline(
                null,
                snapshot({ state: 'complete', totalDuration: 600, printDuration: 560, progress: 1, currentLayer: 120 })
            )

            expect(timeline?.startedAt).toBeNull()
            expect(timeline?.events.at(-1)).toEqual({ type: 'complete', elapsed: 600, approximate: false })
        })
    })
})

describe('getPrintTimelinePhases', () => {
    it('is empty without a timeline', () => {
        expect(getPrintTimelinePhases(null)).toEqual([])
    })

    it('splits the elapsed time into warm-up, printing and paused phases', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 40, printDuration: 2 },
            { totalDuration: 100, printDuration: 62, state: 'paused' },
            { totalDuration: 130, printDuration: 62 },
            { totalDuration: 200, printDuration: 132 },
        ])

        expect(getPrintTimelinePhases(timeline)).toEqual([
            { type: 'warmup', from: 0, to: 38 },
            { type: 'printing', from: 38, to: 100 },
            { type: 'paused', from: 100, to: 130 },
            { type: 'printing', from: 130, to: 200 },
        ])
    })

    it('ends with the print', () => {
        const timeline = run([
            { totalDuration: 0 },
            { totalDuration: 10, printDuration: 10 },
            { totalDuration: 90, printDuration: 90, state: 'complete' },
        ])

        expect(getPrintTimelinePhases(timeline)).toEqual([{ type: 'printing', from: 0, to: 90 }])
    })

    it('stays in the warm-up phase until the print starts', () => {
        const timeline = run([{ totalDuration: 0 }, { totalDuration: 25 }])

        expect(getPrintTimelinePhases(timeline)).toEqual([{ type: 'warmup', from: 0, to: 25 }])
    })

    it('ignores events without a known time', () => {
        const timeline = run([{ totalDuration: 300, printDuration: 100, state: 'paused', progress: 0.3 }])

        expect(getPrintTimelinePhases(timeline)).toEqual([
            { type: 'warmup', from: 0, to: 200 },
            { type: 'printing', from: 200, to: 300 },
        ])
    })
})

describe('formatPrintTimelineOffset', () => {
    it('formats the time since the start of the job', () => {
        expect(formatPrintTimelineOffset(0)).toBe('0:00')
        expect(formatPrintTimelineOffset(38.6)).toBe('0:38')
        expect(formatPrintTimelineOffset(605)).toBe('10:05')
        expect(formatPrintTimelineOffset(3725)).toBe('1:02:05')
    })
})

describe('createPrintTimelineSnapshot', () => {
    const input = (overrides: Partial<Parameters<typeof createPrintTimelineSnapshot>[0]> = {}) => ({
        ready: true,
        printStats: {
            state: 'printing',
            filename: 'demo.gcode',
            total_duration: 120,
            print_duration: 80,
            message: '',
        },
        metadataFilename: 'demo.gcode',
        timelapsePause: false,
        progress: () => 0.4,
        currentLayer: () => 12,
        now: START,
        ...overrides,
    })

    it('reads the print stats', () => {
        expect(createPrintTimelineSnapshot(input())).toEqual({
            state: 'printing',
            filename: 'demo.gcode',
            totalDuration: 120,
            printDuration: 80,
            progress: 0.4,
            currentLayer: 12,
            message: '',
            metadataLoaded: true,
            now: START,
        })
    })

    it('tells nothing while Klipper is not ready, because the print stats can be stale', () => {
        expect(createPrintTimelineSnapshot(input({ ready: false }))).toBeNull()
    })

    it('tells nothing while the print stats are missing, like after a reconnect of the websocket', () => {
        expect(createPrintTimelineSnapshot(input({ printStats: undefined }))).toBeNull()
    })

    it('does not read progress and layer while there are no print stats', () => {
        const progress = () => {
            throw new Error('not available')
        }

        expect(createPrintTimelineSnapshot(input({ printStats: undefined, progress }))).toBeNull()
    })

    it('knows whether the metadata belongs to the file that is printed', () => {
        expect(createPrintTimelineSnapshot(input({ metadataFilename: undefined }))?.metadataLoaded).toBe(false)
        expect(createPrintTimelineSnapshot(input({ metadataFilename: 'last.gcode' }))?.metadataLoaded).toBe(false)
    })

    it('does not take the pause for a timelapse frame for a pause of the print', () => {
        const printStats = { ...input().printStats, state: 'paused' }

        expect(createPrintTimelineSnapshot(input({ printStats, timelapsePause: true }))?.state).toBe('printing')
        expect(createPrintTimelineSnapshot(input({ printStats }))?.state).toBe('paused')
    })

    it('falls back to empty values for missing fields', () => {
        expect(createPrintTimelineSnapshot(input({ printStats: {} }))).toMatchObject({
            state: '',
            filename: '',
            totalDuration: 0,
            printDuration: 0,
            message: '',
            metadataLoaded: false,
        })
    })
})
