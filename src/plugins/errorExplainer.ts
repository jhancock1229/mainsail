// Maps raw Klipper / print error messages to an explanation in plain language.
// The texts live in the locale files under ErrorExplainer.Errors.<id>.

export type ErrorActionId = 'firmwareRestart' | 'restart' | 'klipperLog' | 'home' | 'reheat' | 'openConfig'

export const errorIds = [
    'timerTooClose',
    'lostCommunication',
    'mcuUnableToConnect',
    'thermistorOutOfRange',
    'heaterNotHeating',
    'extrudeBelowMinTemp',
    'moveOutOfRange',
    'mustHomeFirst',
    'filamentRunout',
    'emergencyStop',
    'configError',
    'unknown',
] as const

export type ErrorId = (typeof errorIds)[number]

export interface ErrorExplanation {
    id: ErrorId
    known: boolean
    raw: string
    // first line of the raw message
    summary: string
    // names found in the message, e.g. the heater or the MCU
    params: Record<string, string>
    actions: ErrorActionId[]
}

interface ErrorRule {
    id: ErrorId
    pattern: RegExp
    actions: ErrorActionId[]
    // used in the texts when the message does not contain the name
    defaults?: Record<string, string>
}

// the first matching rule wins
const errorRules: ErrorRule[] = [
    {
        id: 'timerTooClose',
        pattern:
            /(?:mcu '(?<mcu>[^']+)' shutdown: )?(?:timer too close|missed scheduling of next|rescheduled timer in the past)/i,
        actions: ['firmwareRestart', 'klipperLog'],
        defaults: { mcu: 'mcu' },
    },
    {
        id: 'lostCommunication',
        pattern: /lost communication with mcu(?: '(?<mcu>[^']+)')?/i,
        actions: ['firmwareRestart', 'klipperLog'],
        defaults: { mcu: 'mcu' },
    },
    {
        id: 'mcuUnableToConnect',
        pattern: /mcu '(?<mcu>[^']+)': unable to connect/i,
        actions: ['firmwareRestart', 'openConfig', 'klipperLog'],
    },
    {
        id: 'thermistorOutOfRange',
        pattern: /adc out of range|thermocouple reader fault|max318\d+\b.*\bfault/i,
        actions: ['firmwareRestart', 'klipperLog'],
    },
    {
        id: 'heaterNotHeating',
        pattern: /heater (?<heater>\S+) not heating at expected rate/i,
        actions: ['firmwareRestart', 'reheat', 'klipperLog'],
    },
    {
        id: 'extrudeBelowMinTemp',
        pattern: /extrude below minimum temp/i,
        actions: ['reheat'],
    },
    {
        id: 'moveOutOfRange',
        pattern: /move out of range/i,
        actions: ['home', 'openConfig'],
    },
    {
        id: 'mustHomeFirst',
        pattern: /must home (?:\w+ )?axis first/i,
        actions: ['home'],
    },
    {
        id: 'filamentRunout',
        pattern: /filament run-?out|runout event detected|out of filament/i,
        actions: [],
    },
    {
        id: 'emergencyStop',
        pattern: /shutdown due to (?:webhooks request|m112)/i,
        actions: ['firmwareRestart'],
    },
    {
        id: 'configError',
        pattern:
            /option '[^']+' in section '[^']+'|section '[^']+' is not a valid config section|is not valid in section|unable to parse option|unknown pin chip name|error loading template/i,
        actions: ['openConfig', 'restart', 'klipperLog'],
    },
]

const unknownActions: ErrorActionId[] = ['firmwareRestart', 'klipperLog']

// what the server store shows until the message of Klipper has arrived
export const placeholderMessages = ['Shutdown...', 'Disconnected...']

// restarting only helps (and is only safe to suggest) while Klipper has stopped
const faultOnlyActions: ErrorActionId[] = ['firmwareRestart', 'restart']
// these send G-code, which Klipper only accepts while it is ready
const readyOnlyActions: ErrorActionId[] = ['home', 'reheat']

export const isKlipperFault = (klipperState: string): boolean => ['error', 'shutdown'].includes(klipperState)

const filterActions = (actions: ErrorActionId[], klipperState: string): ErrorActionId[] => {
    return actions.filter((action) => {
        if (faultOnlyActions.includes(action)) return isKlipperFault(klipperState)
        if (readyOnlyActions.includes(action)) return klipperState === 'ready'

        return true
    })
}

export const explainError = (
    message: string | null | undefined,
    context: { klipperState: string }
): ErrorExplanation | null => {
    const raw = (message ?? '').trim()
    if (raw === '' || placeholderMessages.includes(raw)) return null

    const summary = raw.split('\n')[0].trim()

    for (const rule of errorRules) {
        const match = rule.pattern.exec(raw)
        if (match === null) continue

        const params: Record<string, string> = { ...rule.defaults }
        Object.entries(match.groups ?? {}).forEach(([key, value]) => {
            if (value !== undefined) params[key] = value
        })

        return {
            id: rule.id,
            known: true,
            raw,
            summary,
            params,
            actions: filterActions(rule.actions, context.klipperState),
        }
    }

    return {
        id: 'unknown',
        known: false,
        raw,
        summary,
        params: {},
        actions: filterActions(unknownActions, context.klipperState),
    }
}
