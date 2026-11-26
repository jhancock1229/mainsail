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
    // not matched from a message: a paused print with an empty filament sensor, see explainMissingFilament
    'filamentMissing',
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

// the message of Klipper, or null while it has not arrived yet
export const settledKlipperMessage = (message: string | null | undefined): string | null => {
    const text = (message ?? '').trim()

    return text === '' || placeholderMessages.includes(text) ? null : text
}

const MAX_REHEAT_TEMPERATURE = 500

// Which heater the "re-heat" action heats and to which temperature: the heater named in the message, or the
// active extruder, to the temperature the loaded G-code file starts with. Null when that is not known.
export const resolveReheatTarget = (input: {
    heater: string | undefined
    activeExtruder: string | undefined
    heaters: string[]
    file: Record<string, unknown> | undefined
}): { heater: string; temperature: number } | null => {
    const heater = input.heater ?? input.activeExtruder ?? 'extruder'
    if (!input.heaters.includes(heater)) return null

    let temperature: unknown
    if (heater === 'heater_bed') temperature = input.file?.first_layer_bed_temp
    else if (heater.startsWith('extruder')) temperature = input.file?.first_layer_extr_temp
    if (typeof temperature !== 'number' || temperature <= 0 || temperature > MAX_REHEAT_TEMPERATURE) return null

    return { heater, temperature: Math.round(temperature) }
}

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
