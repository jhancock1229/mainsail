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
        { name: 'temperature', visible: true },
        { name: 'miniconsole', visible: false },
    ]

    it('returns the idle layout unchanged for idle', () => {
        expect(deriveStateLayout('idle', idle)).toEqual(idle)
    })

    it('puts webcam and temperature first and hides jog controls while printing', () => {
        const result = deriveStateLayout('printing', idle)

        expect(result.map((panel) => panel.name)).toEqual([
            'webcam',
            'temperature',
            'toolhead-control',
            'extruder-control',
            'macros',
            'miniconsole',
        ])
        expect(result.find((panel) => panel.name === 'webcam')?.visible).toBe(true)
        expect(result.find((panel) => panel.name === 'toolhead-control')?.visible).toBe(false)
        expect(result.find((panel) => panel.name === 'extruder-control')?.visible).toBe(true)
    })

    it('puts the console first and hides motion controls on error', () => {
        const result = deriveStateLayout('error', idle)

        expect(result[0]).toEqual({ name: 'miniconsole', visible: true })
        expect(result.find((panel) => panel.name === 'toolhead-control')?.visible).toBe(false)
        expect(result.find((panel) => panel.name === 'extruder-control')?.visible).toBe(false)
        expect(result.find((panel) => panel.name === 'temperature')?.visible).toBe(true)
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
