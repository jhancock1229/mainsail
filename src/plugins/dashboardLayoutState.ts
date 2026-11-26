import type { GuiStateDashboardLayoutKey, GuiStateLayoutoption } from '@/store/gui/types'

export type DashboardLayoutState = 'idle' | 'printing' | 'error'

export const dashboardLayoutStates: DashboardLayoutState[] = ['idle', 'printing', 'error']

const viewportLayoutKeys: Record<string, GuiStateDashboardLayoutKey[]> = {
    mobile: ['mobileLayout'],
    tablet: ['tabletLayout1', 'tabletLayout2'],
    desktop: ['desktopLayout1', 'desktopLayout2'],
    widescreen: ['widescreenLayout1', 'widescreenLayout2', 'widescreenLayout3'],
}

interface DeriveRule {
    promote: string[]
    show: string[]
    hide: string[]
}

const deriveRules: Record<Exclude<DashboardLayoutState, 'idle'>, DeriveRule> = {
    printing: {
        promote: ['webcam', 'temperature'],
        show: ['webcam'],
        hide: ['toolhead-control'],
    },
    error: {
        promote: ['miniconsole'],
        show: ['miniconsole'],
        hide: ['toolhead-control', 'extruder-control'],
    },
}

export const getViewportLayoutKeys = (viewport: string): GuiStateDashboardLayoutKey[] => {
    return viewportLayoutKeys[viewport] ?? []
}

export const resolveDashboardLayoutState = (input: {
    enabled: boolean
    klipperState: string
    printerState: string
}): DashboardLayoutState => {
    if (!input.enabled) return 'idle'

    if (['error', 'shutdown'].includes(input.klipperState) || input.printerState === 'error') return 'error'
    if (input.klipperState === 'ready' && ['printing', 'paused'].includes(input.printerState)) return 'printing'

    return 'idle'
}

// default layout of a printer state, until the user customizes it
export const deriveStateLayout = (
    layoutState: DashboardLayoutState,
    panels: GuiStateLayoutoption[]
): GuiStateLayoutoption[] => {
    if (layoutState === 'idle') return panels

    const rule = deriveRules[layoutState]
    const derived = panels.map((panel) => {
        if (rule.show.includes(panel.name)) return { ...panel, visible: true }
        if (rule.hide.includes(panel.name)) return { ...panel, visible: false }

        return { ...panel }
    })

    const promoted = rule.promote
        .map((name) => derived.find((panel) => panel.name === name))
        .filter((panel): panel is GuiStateLayoutoption => panel !== undefined)

    return [...promoted, ...derived.filter((panel) => !rule.promote.includes(panel.name))]
}
