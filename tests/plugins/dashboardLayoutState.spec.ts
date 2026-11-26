import { describe, expect, it } from 'vitest'
import { deriveStateLayout, getViewportLayoutKeys, resolveDashboardLayoutState } from '@/plugins/dashboardLayoutState'
import type { GuiStateLayoutoption } from '@/store/gui/types'

describe('resolveDashboardLayoutState', () => {
    const resolve = (klipperState: string, printerState: string, enabled = true) =>
        resolveDashboardLayoutState({ enabled, klipperState, printerState })

    it('returns idle for a ready printer in standby', () => {
        expect(resolve('ready', 'standby')).toBe('idle')
        expect(resolve('ready', 'complete')).toBe('idle')
        expect(resolve('ready', 'cancelled')).toBe('idle')
        expect(resolve('ready', '')).toBe('idle')
    })

    it('returns printing while printing or paused', () => {
        expect(resolve('ready', 'printing')).toBe('printing')
        expect(resolve('ready', 'paused')).toBe('printing')
    })

    it('returns error when Klipper is in error or shutdown', () => {
        expect(resolve('error', 'standby')).toBe('error')
        expect(resolve('shutdown', 'printing')).toBe('error')
    })

    it('returns error when the print job failed', () => {
        expect(resolve('ready', 'error')).toBe('error')
    })

    it('does not report a failed print from stale data while Klipper is not ready', () => {
        expect(resolve('disconnected', 'error')).toBe('idle')
        expect(resolve('startup', 'error')).toBe('idle')
    })

    it('does not report printing from stale data while Klipper is not ready', () => {
        expect(resolve('disconnected', 'printing')).toBe('idle')
        expect(resolve('startup', 'paused')).toBe('idle')
    })

    it('always returns idle when the feature is disabled', () => {
        expect(resolve('ready', 'printing', false)).toBe('idle')
        expect(resolve('error', 'error', false)).toBe('idle')
    })
})

describe('deriveStateLayout', () => {
    const idle: GuiStateLayoutoption[] = [
        { name: 'webcam', visible: false },
        { name: 'toolhead-control', visible: true },
        { name: 'extruder-control', visible: true },
        { name: 'macros', visible: true },
        { name: 'print-hero', visible: true },
        { name: 'temperature', visible: true },
        { name: 'miniconsole', visible: false },
    ]

    it('returns the idle layout unchanged for idle', () => {
        expect(deriveStateLayout('idle', idle)).toEqual(idle)
    })

    it('puts the print hero, webcam and temperature first and the toolhead controls last while printing', () => {
        const result = deriveStateLayout('printing', idle)

        expect(result.map((panel) => panel.name)).toEqual([
            'print-hero',
            'webcam',
            'temperature',
            'extruder-control',
            'macros',
            'miniconsole',
            'toolhead-control',
        ])
        expect(result.find((panel) => panel.name === 'webcam')?.visible).toBe(true)
    })

    it('puts the console first on error', () => {
        const result = deriveStateLayout('error', idle)

        expect(result[0]).toEqual({ name: 'miniconsole', visible: true })
        expect(result.slice(1).map((panel) => panel.name)).toEqual([
            'print-hero',
            'webcam',
            'toolhead-control',
            'extruder-control',
            'macros',
            'temperature',
        ])
    })

    describe('when the print hero shows the webcam picture', () => {
        const withWebcam = idle.map((panel) => (panel.name === 'webcam' ? { ...panel, visible: true } : panel))

        it('does not show the webcam panel as well while printing, so the camera is not streamed twice', () => {
            const result = deriveStateLayout('printing', withWebcam, { heroShowsWebcam: true })

            expect(result.map((panel) => panel.name)).toEqual([
                'print-hero',
                'temperature',
                'webcam',
                'extruder-control',
                'macros',
                'miniconsole',
                'toolhead-control',
            ])
            expect(result.find((panel) => panel.name === 'webcam')?.visible).toBe(false)
        })

        it('changes nothing else', () => {
            const result = deriveStateLayout('printing', withWebcam, { heroShowsWebcam: true })
            const others = (panels: GuiStateLayoutoption[]) => panels.filter((panel) => panel.name !== 'webcam')

            expect(others(result)).toEqual(others(deriveStateLayout('printing', withWebcam)))
        })

        it('keeps the webcam panel when the hero does not show the webcam', () => {
            const result = deriveStateLayout('printing', withWebcam, { heroShowsWebcam: false })

            expect(result[1]).toEqual({ name: 'webcam', visible: true })
            expect(result).toEqual(deriveStateLayout('printing', withWebcam))
        })

        it('keeps the webcam panel after a failed print, where the hero may be scrolled away', () => {
            const result = deriveStateLayout('error', withWebcam, { heroShowsWebcam: true })

            expect(result.find((panel) => panel.name === 'webcam')?.visible).toBe(true)
        })
    })

    it('promotes the print hero without changing whether the user has hidden it', () => {
        const hidden = idle.map((panel) => (panel.name === 'print-hero' ? { ...panel, visible: false } : panel))
        const result = deriveStateLayout('printing', hidden)

        expect(result[0]).toEqual({ name: 'print-hero', visible: false })
    })

    it('never hides a panel, because every panel has controls that are needed in some situation', () => {
        for (const layoutState of ['printing', 'error'] as const) {
            const result = deriveStateLayout(layoutState, idle)
            for (const panel of idle.filter((entry) => entry.visible)) {
                expect(result.find((entry) => entry.name === panel.name)?.visible).toBe(true)
            }
        }
    })

    it('keeps every panel exactly once', () => {
        for (const layoutState of ['printing', 'error'] as const) {
            const names = deriveStateLayout(layoutState, idle).map((panel) => panel.name)
            expect([...names].sort()).toEqual(idle.map((panel) => panel.name).sort())
        }
    })

    it('does not mutate the idle layout', () => {
        const snapshot = JSON.parse(JSON.stringify(idle))
        deriveStateLayout('printing', idle)
        deriveStateLayout('error', idle)
        expect(idle).toEqual(snapshot)
    })

    it('leaves a column without affected panels unchanged', () => {
        const column: GuiStateLayoutoption[] = [
            { name: 'macros', visible: true },
            { name: 'miscellaneous', visible: false },
        ]
        expect(deriveStateLayout('printing', column)).toEqual(column)
    })
})

describe('getViewportLayoutKeys', () => {
    it('lists the layout keys of each viewport', () => {
        expect(getViewportLayoutKeys('mobile')).toEqual(['mobileLayout'])
        expect(getViewportLayoutKeys('tablet')).toEqual(['tabletLayout1', 'tabletLayout2'])
        expect(getViewportLayoutKeys('desktop')).toEqual(['desktopLayout1', 'desktopLayout2'])
        expect(getViewportLayoutKeys('widescreen')).toEqual([
            'widescreenLayout1',
            'widescreenLayout2',
            'widescreenLayout3',
        ])
    })

    it('returns an empty list for an unknown viewport', () => {
        expect(getViewportLayoutKeys('watch')).toEqual([])
    })
})
