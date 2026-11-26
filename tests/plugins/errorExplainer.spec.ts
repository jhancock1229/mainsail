import { describe, expect, it } from 'vitest'
import { errorIds, explainError, resolveReheatTarget, settledKlipperMessage } from '@/plugins/errorExplainer'
import en from '@/locales/en.json'

const SHUTDOWN_HINT =
    'Once the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nPrinter is shutdown\n'

const shutdown = (raw: string) => explainError(raw, { klipperState: 'shutdown' })
const failedPrint = (raw: string) => explainError(raw, { klipperState: 'ready' })

describe('explainError', () => {
    it('returns null when there is no message', () => {
        expect(explainError(null, { klipperState: 'shutdown' })).toBeNull()
        expect(explainError(undefined, { klipperState: 'ready' })).toBeNull()
        expect(explainError('  \n ', { klipperState: 'ready' })).toBeNull()
    })

    it('returns null for the placeholder that is shown until the message of Klipper arrived', () => {
        expect(explainError('Shutdown...', { klipperState: 'shutdown' })).toBeNull()
        expect(explainError('Disconnected...', { klipperState: 'error' })).toBeNull()
    })

    it('explains "Timer too close" and keeps the raw message', () => {
        const raw = `MCU 'mcu' shutdown: Timer too close\nThis often indicates the host computer is overloaded.\n${SHUTDOWN_HINT}`
        const result = shutdown(raw)

        expect(result?.id).toBe('timerTooClose')
        expect(result?.known).toBe(true)
        expect(result?.raw).toBe(raw.trim())
        expect(result?.params.mcu).toBe('mcu')
        expect(result?.actions).toEqual(['firmwareRestart', 'klipperLog'])
    })

    it('explains lost communication with an MCU', () => {
        const result = shutdown(`Lost communication with MCU 'toolboard'\n${SHUTDOWN_HINT}`)

        expect(result?.id).toBe('lostCommunication')
        expect(result?.params.mcu).toBe('toolboard')
        expect(result?.actions).toEqual(['firmwareRestart', 'klipperLog'])
    })

    it('falls back to the default MCU name when the message does not name one', () => {
        expect(shutdown('Lost communication with MCU')?.params.mcu).toBe('mcu')
        expect(shutdown('Timer too close')?.params.mcu).toBe('mcu')
    })

    it('explains an MCU that cannot be reached at startup', () => {
        const result = explainError("mcu 'mcu': Unable to connect\nError configuring printer\n", {
            klipperState: 'error',
        })

        expect(result?.id).toBe('mcuUnableToConnect')
        expect(result?.actions).toEqual(['firmwareRestart', 'openConfig', 'klipperLog'])
    })

    it('explains a heater that does not heat, with the heater name', () => {
        const result = shutdown(`Heater heater_bed not heating at expected rate\n${SHUTDOWN_HINT}`)

        expect(result?.id).toBe('heaterNotHeating')
        expect(result?.params.heater).toBe('heater_bed')
        expect(result?.actions).toEqual(['firmwareRestart', 'klipperLog'])
    })

    it('explains thermistor / ADC out of range', () => {
        expect(shutdown(`MCU 'mcu' shutdown: ADC out of range\n${SHUTDOWN_HINT}`)?.id).toBe('thermistorOutOfRange')
        expect(shutdown('Thermocouple reader fault')?.id).toBe('thermistorOutOfRange')
    })

    it('explains "Move out of range"', () => {
        const result = failedPrint('Move out of range: 300.000 200.000 5.000 [0.000]')

        expect(result?.id).toBe('moveOutOfRange')
        expect(result?.actions).toEqual(['home', 'openConfig'])
    })

    it('explains "Must home axis first"', () => {
        const result = failedPrint('Must home axis first: 110.000 110.000 5.000 [0.000]')

        expect(result?.id).toBe('mustHomeFirst')
        expect(result?.actions).toEqual(['home'])
        expect(failedPrint('!! Must home X axis first')?.id).toBe('mustHomeFirst')
    })

    it('explains extruding below the minimum temperature', () => {
        const result = failedPrint("Extrude below minimum temp\nSee the 'min_extrude_temp' config option for details")

        expect(result?.id).toBe('extrudeBelowMinTemp')
        expect(result?.actions).toEqual(['reheat'])
    })

    it('explains a filament runout', () => {
        expect(failedPrint('Filament runout detected')?.id).toBe('filamentRunout')
        expect(failedPrint('Filament Sensor runout_sensor: runout event detected')?.id).toBe('filamentRunout')
    })

    it('explains an emergency stop', () => {
        expect(shutdown(`Shutdown due to webhooks request\n${SHUTDOWN_HINT}`)?.id).toBe('emergencyStop')
        expect(shutdown('Shutdown due to M112 command')?.id).toBe('emergencyStop')
    })

    it('explains a configuration error', () => {
        const result = explainError("Option 'serial' in section 'mcu' must be specified\nPrinter is halted\n", {
            klipperState: 'error',
        })

        expect(result?.id).toBe('configError')
        expect(result?.actions).toEqual(['openConfig', 'restart', 'klipperLog'])
        expect(
            explainError("Section 'bltouch_typo' is not a valid config section", { klipperState: 'error' })?.id
        ).toBe('configError')
    })

    it('is not case sensitive and ignores the console error prefix', () => {
        expect(failedPrint('!! move OUT of range: 1 2 3')?.id).toBe('moveOutOfRange')
    })

    it('falls back to an unknown error that still carries the raw text', () => {
        const result = shutdown('Something nobody has seen before\nSecond line')

        expect(result?.id).toBe('unknown')
        expect(result?.known).toBe(false)
        expect(result?.raw).toBe('Something nobody has seen before\nSecond line')
        expect(result?.summary).toBe('Something nobody has seen before')
        expect(result?.actions).toEqual(['firmwareRestart', 'klipperLog'])
    })

    it('only suggests restarting Klipper while Klipper is in error or shutdown', () => {
        expect(failedPrint('Heater extruder not heating at expected rate')?.actions).toEqual(['reheat', 'klipperLog'])
        expect(failedPrint('Something nobody has seen before')?.actions).toEqual(['klipperLog'])
    })

    it('only suggests actions that need a running Klipper while Klipper is ready', () => {
        expect(shutdown('Move out of range: 1 2 3')?.actions).toEqual(['openConfig'])
        expect(shutdown('Must home axis first')?.actions).toEqual([])
    })

    it('uses the first line as summary', () => {
        expect(shutdown(`\nMCU 'mcu' shutdown: Timer too close\nmore`)?.summary).toBe(
            "MCU 'mcu' shutdown: Timer too close"
        )
    })
})

describe('settledKlipperMessage', () => {
    it('returns the message of Klipper', () => {
        expect(settledKlipperMessage('Lost communication with MCU')).toBe('Lost communication with MCU')
    })

    it('treats a missing, blank or placeholder message as not arrived yet', () => {
        expect(settledKlipperMessage(null)).toBeNull()
        expect(settledKlipperMessage(undefined)).toBeNull()
        expect(settledKlipperMessage('')).toBeNull()
        expect(settledKlipperMessage('  \n ')).toBeNull()
        expect(settledKlipperMessage('Shutdown...')).toBeNull()
        expect(settledKlipperMessage('Disconnected...')).toBeNull()
    })
})

describe('resolveReheatTarget', () => {
    const printer = {
        heaters: ['extruder', 'extruder1', 'heater_bed'],
        activeExtruder: 'extruder1',
        file: { first_layer_extr_temp: 215.4, first_layer_bed_temp: 60 },
    }

    it('heats the heater that the message names', () => {
        expect(resolveReheatTarget({ ...printer, heater: 'extruder' })).toEqual({
            heater: 'extruder',
            temperature: 215,
        })
        expect(resolveReheatTarget({ ...printer, heater: 'heater_bed' })).toEqual({
            heater: 'heater_bed',
            temperature: 60,
        })
    })

    it('heats the active extruder when the message names no heater', () => {
        expect(resolveReheatTarget({ ...printer, heater: undefined })).toEqual({
            heater: 'extruder1',
            temperature: 215,
        })
    })

    it('falls back to "extruder" when the active extruder is unknown', () => {
        expect(resolveReheatTarget({ ...printer, heater: undefined, activeExtruder: undefined })).toEqual({
            heater: 'extruder',
            temperature: 215,
        })
    })

    it('returns null for a heater that does not exist on the printer', () => {
        expect(resolveReheatTarget({ ...printer, heater: 'chamber' })).toBeNull()
        expect(resolveReheatTarget({ ...printer, heaters: ['heater_bed'], heater: undefined })).toBeNull()
    })

    it('returns null without a usable temperature of the loaded file', () => {
        expect(resolveReheatTarget({ ...printer, heater: 'extruder', file: {} })).toBeNull()
        expect(resolveReheatTarget({ ...printer, heater: 'extruder', file: undefined })).toBeNull()
        expect(resolveReheatTarget({ ...printer, heater: 'extruder', file: { first_layer_extr_temp: 0 } })).toBeNull()
        expect(
            resolveReheatTarget({ ...printer, heater: 'extruder', file: { first_layer_extr_temp: '210' } })
        ).toBeNull()
        expect(resolveReheatTarget({ ...printer, heater: 'extruder', file: { first_layer_extr_temp: 900 } })).toBeNull()
    })
})

describe('error explanations in en.json', () => {
    const texts = (en as unknown as { ErrorExplainer: { Errors: Record<string, Record<string, string>> } })
        .ErrorExplainer.Errors

    it.each(errorIds)('has a title, cause and fix for %s', (id) => {
        expect(texts[id]?.Title).toBeTruthy()
        expect(texts[id]?.Cause).toBeTruthy()
        expect(texts[id]?.Fix).toBeTruthy()
    })
})
