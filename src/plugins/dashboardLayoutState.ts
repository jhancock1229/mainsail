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
    demote: string[]
    show: string[]
}

const deriveRules: Record<Exclude<DashboardLayoutState, 'idle'>, DeriveRule> = {
    printing: {
        promote: ['print-hero', 'webcam', 'temperature'],
        demote: ['toolhead-control'],
        show: ['webcam'],
    },
    error: {
        promote: ['miniconsole', 'print-hero'],
        demote: [],
        show: ['miniconsole'],
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

    if (['error', 'shutdown'].includes(input.klipperState)) return 'error'

    if (input.klipperState !== 'ready') return 'idle'
    if (input.printerState === 'error') return 'error'
    if (['printing', 'paused'].includes(input.printerState)) return 'printing'

    return 'idle'
}

export interface DeriveStateLayoutOptions {
    heroShowsWebcam?: boolean
}

export const deriveStateLayout = (
    layoutState: DashboardLayoutState,
    panels: GuiStateLayoutoption[],
    options: DeriveStateLayoutOptions = {}
): GuiStateLayoutoption[] => {
    if (layoutState === 'idle') return panels

    const rule = deriveRules[layoutState]
    const heroReplacesWebcam = layoutState === 'printing' && options.heroShowsWebcam === true
    const unlessReplaced = (names: string[]) => (heroReplacesWebcam ? names.filter((name) => name !== 'webcam') : names)
    const promote = unlessReplaced(rule.promote)
    const show = unlessReplaced(rule.show)

    const derived = panels.map((panel) => {
        if (heroReplacesWebcam && panel.name === 'webcam') return { ...panel, visible: false }

        return show.includes(panel.name) ? { ...panel, visible: true } : { ...panel }
    })
    const pick = (names: string[]) =>
        names
            .map((name) => derived.find((panel) => panel.name === name))
            .filter((panel): panel is GuiStateLayoutoption => panel !== undefined)
    const moved = [...promote, ...rule.demote]

    return [...pick(promote), ...derived.filter((panel) => !moved.includes(panel.name)), ...pick(rule.demote)]
}
