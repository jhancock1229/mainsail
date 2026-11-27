import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    classifyRequest,
    createPinRecord,
    effectiveActionRule,
    getDefaultKioskSettings,
    hasPin,
    isSmallTouchScreen,
    isValidPinFormat,
    kioskActions,
    kioskPanelSequence,
    parseDeviceMode,
    parseKioskUrlParam,
    PIN_LOCKOUT_MS,
    PIN_MAX_ATTEMPTS,
    pinLockoutRemaining,
    resolveBottomBar,
    resolveKioskMode,
    resolveKioskSettings,
    resolveMorePages,
    resolveOpenPanel,
    routeRule,
    swipeDirection,
    verifyPin,
    buildKioskMacros,
    canRecoverOnSmallScreen,
    classifyGcode,
    classifyHttpRequest,
    combinedActionRule,
    guardedRequests,
    httpRequestMethod,
    isRequestKnown,
    MACRO_DEPTH_LIMIT,
    onDemandPanelRenders,
    onDemandPanels,
    unguardedRequests,
    exposedShellPages,
    hiddenShellTabs,
    shellLocationRule,
    shellLockKey,
} from '@/plugins/kiosk'

const settingsWith = (overrides: Record<string, unknown>) => resolveKioskSettings(overrides)
const pin = createPinRecord('4821', 'a1b2c3d4')

describe('resolveKioskMode', () => {
    const phone = { smallTouchScreen: true }
    const desktop = { smallTouchScreen: false }

    it('stays off on a desktop that never enabled it', () => {
        expect(resolveKioskMode({ deviceMode: null, smallScreens: 'suggest', ...desktop })).toEqual({
            active: false,
            suggest: false,
        })
        expect(resolveKioskMode({ deviceMode: null, smallScreens: 'apply', ...desktop })).toEqual({
            active: false,
            suggest: false,
        })
    })

    it('follows the choice made on this device', () => {
        expect(resolveKioskMode({ deviceMode: 'on', smallScreens: 'off', ...desktop }).active).toBe(true)
        expect(resolveKioskMode({ deviceMode: 'off', smallScreens: 'apply', ...phone }).active).toBe(false)
    })

    it('suggests the mode on a small touch screen that has not decided yet', () => {
        expect(resolveKioskMode({ deviceMode: null, smallScreens: 'suggest', ...phone })).toEqual({
            active: false,
            suggest: true,
        })
    })

    it('never suggests again after the device declined or accepted', () => {
        expect(resolveKioskMode({ deviceMode: 'off', smallScreens: 'suggest', ...phone }).suggest).toBe(false)
        expect(resolveKioskMode({ deviceMode: 'on', smallScreens: 'suggest', ...phone }).suggest).toBe(false)
    })

    it('applies automatically on small touch screens when the owner chose that', () => {
        expect(resolveKioskMode({ deviceMode: null, smallScreens: 'apply', ...phone })).toEqual({
            active: true,
            suggest: false,
        })
    })

    it('does nothing on small touch screens when switched off', () => {
        expect(resolveKioskMode({ deviceMode: null, smallScreens: 'off', ...phone })).toEqual({
            active: false,
            suggest: false,
        })
    })
})

describe('device detection and stored values', () => {
    it('treats phones and small printer screens as small touch screens', () => {
        expect(isSmallTouchScreen({ width: 400, height: 850, touch: true })).toBe(true)
        expect(isSmallTouchScreen({ width: 800, height: 480, touch: true })).toBe(true)
    })

    it('does not treat tablets, desktops or small mouse windows as small touch screens', () => {
        expect(isSmallTouchScreen({ width: 768, height: 1024, touch: true })).toBe(false)
        expect(isSmallTouchScreen({ width: 1500, height: 1100, touch: true })).toBe(false)
        expect(isSmallTouchScreen({ width: 400, height: 850, touch: false })).toBe(false)
    })

    it('reads the url parameter', () => {
        expect(parseKioskUrlParam('?kiosk=1')).toBe('on')
        expect(parseKioskUrlParam('?foo=bar&kiosk=on')).toBe('on')
        expect(parseKioskUrlParam('?kiosk=true')).toBe('on')
        expect(parseKioskUrlParam('?kiosk')).toBe('on')
        expect(parseKioskUrlParam('?kiosk=0')).toBe('off')
        expect(parseKioskUrlParam('?kiosk=off')).toBe('off')
        expect(parseKioskUrlParam('?kiosk=false')).toBe('off')
        expect(parseKioskUrlParam('?kiosk=banana')).toBe(null)
        expect(parseKioskUrlParam('')).toBe(null)
        expect(parseKioskUrlParam('?kiosks=1')).toBe(null)
    })

    it('ignores unknown stored device values', () => {
        expect(parseDeviceMode('on')).toBe('on')
        expect(parseDeviceMode('off')).toBe('off')
        expect(parseDeviceMode(null)).toBe(null)
        expect(parseDeviceMode('true')).toBe(null)
    })
})

describe('resolveKioskSettings', () => {
    it('falls back to the defaults for missing or broken settings', () => {
        const defaults = getDefaultKioskSettings()

        expect(resolveKioskSettings(undefined)).toEqual(defaults)
        expect(resolveKioskSettings(null)).toEqual(defaults)
        expect(resolveKioskSettings('nonsense')).toEqual(defaults)
        expect(
            resolveKioskSettings({ bottomBar: 'dashboard', hiddenPages: 5, actions: [], smallScreens: 'x' })
        ).toEqual(defaults)
    })

    it('exposes everything and requires no pin by default', () => {
        const defaults = getDefaultKioskSettings()

        expect(defaults.hiddenPages).toEqual([])
        expect(defaults.hiddenPanels).toEqual([])
        expect(defaults.pin).toBe(null)
        expect(defaults.smallScreens).toBe('suggest')
        kioskActions.forEach((action) => expect(defaults.actions[action]).toBe('allow'))
    })

    it('keeps valid values and fills in missing action rules', () => {
        const settings = resolveKioskSettings({
            smallScreens: 'apply',
            bottomBar: ['console', 7, 'dashboard'],
            hiddenPages: ['machine'],
            hiddenPanels: ['miniconsole'],
            actions: { cancelPrint: 'pin', deleteFile: 'nope' },
            pin,
        })

        expect(settings.smallScreens).toBe('apply')
        expect(settings.bottomBar).toEqual(['console', 'dashboard'])
        expect(settings.hiddenPages).toEqual(['machine'])
        expect(settings.hiddenPanels).toEqual(['miniconsole'])
        expect(settings.hiddenShell).toEqual([])
        expect(settings.actions.cancelPrint).toBe('pin')
        expect(settings.actions.deleteFile).toBe('allow')
        expect(settings.actions.restart).toBe('allow')
        expect(settings.pin).toEqual(pin)
    })

    it('treats a damaged pin record as no pin, so nobody is locked out by it', () => {
        expect(resolveKioskSettings({ pin: { hash: 'abc' } }).pin).toBe(null)
        expect(resolveKioskSettings({ pin: 'secret' }).pin).toBe(null)
        expect(resolveKioskSettings({ pin: { salt: '', hash: '', iterations: 1 } }).pin).toBe(null)
        expect(resolveKioskSettings({ pin: { salt: 'ab', hash: 'cd', iterations: 'many' } }).pin).toBe(null)
    })
})

describe('pin', () => {
    it('accepts only 4 to 8 digits', () => {
        expect(isValidPinFormat('1234')).toBe(true)
        expect(isValidPinFormat('12345678')).toBe(true)
        expect(isValidPinFormat('123')).toBe(false)
        expect(isValidPinFormat('123456789')).toBe(false)
        expect(isValidPinFormat('12a4')).toBe(false)
        expect(isValidPinFormat('')).toBe(false)
    })

    it('never stores the pin itself', () => {
        expect(JSON.stringify(pin)).not.toContain('4821')
        expect(pin.hash).toMatch(/^[0-9a-f]{64}$/)
        expect(pin.salt).toBe('a1b2c3d4')
    })

    it('verifies the right pin and rejects everything else', () => {
        expect(verifyPin('4821', pin)).toBe(true)
        expect(verifyPin('4822', pin)).toBe(false)
        expect(verifyPin('', pin)).toBe(false)
        expect(verifyPin('48210', pin)).toBe(false)
    })

    it('gives the same pin a different hash with another salt', () => {
        expect(createPinRecord('4821', 'ffffffff').hash).not.toBe(pin.hash)
    })

    it('does not accept the stored hash as the pin', () => {
        expect(verifyPin(pin.hash, pin)).toBe(false)
    })

    it('accepts anything when no pin is set', () => {
        expect(hasPin(null)).toBe(false)
        expect(hasPin(pin)).toBe(true)
        expect(verifyPin('0000', null)).toBe(true)
    })

    it('locks the keypad for a while after too many wrong attempts', () => {
        const now = 1_000_000

        expect(pinLockoutRemaining(PIN_MAX_ATTEMPTS - 1, now, now)).toBe(0)
        expect(pinLockoutRemaining(PIN_MAX_ATTEMPTS, now, now)).toBe(PIN_LOCKOUT_MS)
        expect(pinLockoutRemaining(PIN_MAX_ATTEMPTS, now, now + 10_000)).toBe(PIN_LOCKOUT_MS - 10_000)
        expect(pinLockoutRemaining(PIN_MAX_ATTEMPTS, now, now + PIN_LOCKOUT_MS)).toBe(0)
        expect(pinLockoutRemaining(PIN_MAX_ATTEMPTS + 3, now, now + PIN_LOCKOUT_MS + 1)).toBe(0)
    })
})

describe('action rules', () => {
    it('allows everything by default', () => {
        const settings = getDefaultKioskSettings()

        expect(effectiveActionRule('cancelPrint', settings)).toBe('allow')
        expect(effectiveActionRule('settings', settings)).toBe('allow')
    })

    it('asks for the pin where the owner requires it', () => {
        const settings = settingsWith({ actions: { cancelPrint: 'pin' }, pin })

        expect(effectiveActionRule('cancelPrint', settings)).toBe('pin')
        expect(effectiveActionRule('deleteFile', settings)).toBe('allow')
    })

    it('cannot ask for a pin that does not exist', () => {
        const settings = settingsWith({ actions: { cancelPrint: 'pin' } })

        expect(effectiveActionRule('cancelPrint', settings)).toBe('allow')
    })

    it('blocks an action with or without a pin', () => {
        expect(effectiveActionRule('deleteFile', settingsWith({ actions: { deleteFile: 'block' } }))).toBe('block')
        expect(effectiveActionRule('deleteFile', settingsWith({ actions: { deleteFile: 'block' }, pin }))).toBe('block')
    })

    it('always protects the settings once a pin is set, because they hold these rules', () => {
        expect(effectiveActionRule('settings', settingsWith({ actions: { settings: 'allow' }, pin }))).toBe('pin')
        expect(effectiveActionRule('settings', settingsWith({ actions: { settings: 'block' }, pin }))).toBe('block')
    })
})

describe('classifyRequest', () => {
    it('never guards the emergency stop', () => {
        expect(classifyRequest('printer.emergency_stop', {})).toEqual([])
        expect(classifyRequest('printer.gcode.script', { script: 'M112' })).toEqual([])
    })

    it('recognises cancelling a print', () => {
        expect(classifyRequest('printer.print.cancel', {})).toEqual(['cancelPrint'])
        expect(classifyRequest('printer.gcode.script', { script: 'CANCEL_PRINT' })).toEqual(['cancelPrint'])
        expect(classifyRequest('printer.gcode.script', { script: 'G28\n  cancel_print  ; stop' })).toEqual([
            'cancelPrint',
        ])
    })

    it('recognises restarts of klipper, moonraker, services and the host', () => {
        const restarts = [
            'printer.firmware_restart',
            'printer.restart',
            'server.restart',
            'machine.reboot',
            'machine.shutdown',
            'machine.services.restart',
            'machine.services.stop',
            'machine.services.start',
        ]

        restarts.forEach((method) => expect(classifyRequest(method, {}), method).toEqual(['restart']))
        expect(classifyRequest('printer.gcode.script', { script: 'FIRMWARE_RESTART' })).toEqual(['restart'])
        expect(classifyRequest('printer.gcode.script', { script: 'RESTART' })).toEqual(['restart'])
    })

    it('recognises software updates, which restart services, also for a component named at run time', () => {
        const updates = [
            'machine.update.full',
            'machine.update.system',
            'machine.update.client',
            'machine.update.recover',
        ]

        updates.forEach((method) => expect(classifyRequest(method, {}), method).toEqual(['restart']))
        expect(classifyRequest('machine.update.klipper', {})).toEqual(['restart'])
        expect(classifyRequest('machine.update.moonraker', {})).toEqual(['restart'])
        expect(classifyRequest('machine.update.status', {})).toEqual([])
    })

    it('recognises switching a power device off, and leaves switching it on alone', () => {
        expect(classifyRequest('machine.device_power.off', { printer: null })).toEqual(['restart'])
        expect(classifyRequest('machine.device_power.post_device', { device: 'printer', action: 'off' })).toEqual([
            'restart',
        ])
        expect(classifyRequest('machine.device_power.post_device', { device: 'printer', action: 'toggle' })).toEqual([
            'restart',
        ])
        expect(classifyRequest('machine.device_power.post_device', { device: 'printer', action: 'on' })).toEqual([])
        expect(classifyRequest('machine.device_power.on', { printer: null })).toEqual([])
    })

    it('recognises deleting, moving and renaming files', () => {
        expect(classifyRequest('server.files.delete_file', { path: 'gcodes/a.gcode' })).toEqual(['deleteFile'])
        expect(classifyRequest('server.files.delete_directory', { path: 'gcodes/old' })).toEqual(['deleteFile'])
        expect(classifyRequest('server.files.move', { source: 'gcodes/a.gcode', dest: 'gcodes/b.gcode' })).toEqual([
            'deleteFile',
        ])
    })

    it('recognises every change in the config directory as config editing', () => {
        expect(classifyRequest('server.files.delete_file', { path: 'config/printer.cfg' })).toEqual([
            'deleteFile',
            'configEdit',
        ])
        expect(classifyRequest('server.files.move', { source: 'gcodes/a.cfg', dest: 'config/a.cfg' })).toEqual([
            'deleteFile',
            'configEdit',
        ])
        expect(classifyRequest('server.files.copy', { source: 'config/a.cfg', dest: 'config/b.cfg' })).toEqual([
            'configEdit',
        ])
        expect(classifyRequest('server.files.post_directory', { path: 'config/macros' })).toEqual(['configEdit'])
        expect(classifyRequest('server.files.upload', { root: 'config' })).toEqual(['configEdit'])
        expect(classifyRequest('server.files.upload', { root: 'gcodes' })).toEqual([])
        expect(classifyRequest('server.files.copy', { source: 'config/a.cfg', dest: 'gcodes/a.cfg' })).toEqual([])
        expect(classifyRequest('server.files.post_directory', { path: 'configs_old/x' })).toEqual([])
        expect(classifyRequest('printer.gcode.script', { script: 'SAVE_CONFIG' })).toEqual(['configEdit'])
    })

    it('leaves ordinary requests alone', () => {
        expect(classifyRequest('printer.gcode.script', { script: 'G28' })).toEqual([])
        expect(classifyRequest('printer.gcode.script', { script: 'SET_HEATER_TEMPERATURE HEATER=extruder' })).toEqual(
            []
        )
        expect(classifyRequest('printer.gcode.script', { script: 'M117 RESTART later' })).toEqual([])
        expect(classifyRequest('printer.gcode.script', {})).toEqual([])
        expect(classifyRequest('printer.print.pause', {})).toEqual([])
        expect(classifyRequest('server.database.post_item', { key: 'kiosk.pin' })).toEqual([])
        expect(classifyRequest('server.files.get_directory', { path: 'gcodes' })).toEqual([])
    })
})

describe('classifyGcode', () => {
    const macros = buildKioskMacros({
        'gcode_macro END_PRINT': { gcode: 'G91\nG1 Z10\nPARK\nM84' },
        'gcode_macro PARK': { gcode: 'G90\nG1 X0 Y200' },
        'gcode_macro ABORT': { gcode: 'M104 S0\n  CANCEL_PRINT\n' },
        'gcode_macro STOP_ALL': { gcode: 'ABORT' },
        'gcode_macro Finish_Tuning': {
            gcode: '{% if printer.idle_timeout.state != "Printing" %}SAVE_CONFIG{% endif %}',
        },
        'gcode_macro CANCEL_PRINT': {
            rename_existing: 'BASE_CANCEL_PRINT',
            gcode: 'TURN_OFF_HEATERS\nBASE_CANCEL_PRINT',
        },
        'gcode_macro USES_BASE': { gcode: 'base_cancel_print' },
        'gcode_macro LOOP_A': { gcode: 'LOOP_B' },
        'gcode_macro LOOP_B': { gcode: 'LOOP_A\nRESTART' },
        'gcode_macro POWER_OFF': { gcode: '{action_call_remote_method("shutdown_machine")}' },
        'gcode_macro LIGHTS': { gcode: '{action_call_remote_method("set_device_power", device="lights", state="on")}' },
        'gcode_macro LATER': { gcode: 'UPDATE_DELAYED_GCODE ID=reboot_soon DURATION=5' },
        'delayed_gcode reboot_soon': { gcode: 'FIRMWARE_RESTART' },
        'gcode_macro D1': { gcode: 'D2' },
        'gcode_macro D2': { gcode: 'D3' },
        'gcode_macro D3': { gcode: 'D4' },
        'gcode_macro D4': { gcode: 'D5' },
        'gcode_macro D5': { gcode: 'D6' },
        'gcode_macro D6': { gcode: 'D7' },
        'gcode_macro D7': { gcode: 'RESTART' },
        extruder: { nozzle_diameter: '0.4' },
    })

    it('checks every line, not only the first protected one', () => {
        expect(classifyGcode('RESTART\nSAVE_CONFIG')).toEqual(['restart', 'configEdit'])
        expect(classifyGcode('G28\nCANCEL_PRINT\nFIRMWARE_RESTART\nSAVE_CONFIG')).toEqual([
            'cancelPrint',
            'restart',
            'configEdit',
        ])
    })

    it('ignores a line number in front of a command and a checksum behind it', () => {
        expect(classifyGcode('N10 CANCEL_PRINT')).toEqual(['cancelPrint'])
        expect(classifyGcode('n7  restart*71')).toEqual(['restart'])
        expect(classifyGcode('N10 G28')).toEqual([])
    })

    it('looks into the macros of the printer configuration', () => {
        expect(classifyGcode('ABORT', macros)).toEqual(['cancelPrint'])
        expect(classifyGcode('abort', macros)).toEqual(['cancelPrint'])
        expect(classifyGcode('STOP_ALL', macros)).toEqual(['cancelPrint'])
        expect(classifyGcode('END_PRINT', macros)).toEqual([])
        expect(classifyGcode('FINISH_TUNING', macros)).toEqual(['configEdit'])
    })

    it('still guards a command that a macro replaces, and the renamed original', () => {
        expect(classifyGcode('CANCEL_PRINT', macros)).toEqual(['cancelPrint'])
        expect(classifyGcode('BASE_CANCEL_PRINT', macros)).toEqual(['cancelPrint'])
        expect(classifyGcode('USES_BASE', macros)).toEqual(['cancelPrint'])
    })

    it('follows a delayed gcode that a macro schedules', () => {
        expect(classifyGcode('LATER', macros)).toEqual(['restart'])
        expect(classifyGcode('UPDATE_DELAYED_GCODE ID=reboot_soon DURATION=1', macros)).toEqual(['restart'])
        expect(classifyGcode('UPDATE_DELAYED_GCODE ID=unknown DURATION=1', macros)).toEqual([])
    })

    it('sees a host shutdown or reboot that a macro asks Moonraker for', () => {
        expect(classifyGcode('POWER_OFF', macros)).toEqual(['restart'])
        expect(classifyGcode('LIGHTS', macros)).toEqual([])
    })

    it('does not hang on macros that call each other', () => {
        expect(classifyGcode('LOOP_A', macros)).toEqual(['restart'])
    })

    it('stops looking after six nested macros', () => {
        expect(MACRO_DEPTH_LIMIT).toBe(6)
        expect(classifyGcode('D2', macros)).toEqual(['restart'])
        expect(classifyGcode('D1', macros)).toEqual([])
    })

    it('reads the macros of a request to run a script', () => {
        expect(classifyRequest('printer.gcode.script', { script: 'G28\nABORT' }, macros)).toEqual(['cancelPrint'])
        expect(classifyRequest('printer.gcode.script', { script: 'ABORT' })).toEqual([])
    })

    it('survives a configuration that is missing or malformed', () => {
        expect(buildKioskMacros(undefined)).toEqual({ bodies: {}, renamed: {} })
        expect(buildKioskMacros({ 'gcode_macro X': 'nonsense', 'gcode_macro Y': { gcode: 5 } })).toEqual({
            bodies: {},
            renamed: {},
        })
    })
})

describe('classifyHttpRequest', () => {
    it('ignores requests that only read', () => {
        expect(classifyHttpRequest('GET', '/server/files/config/printer.cfg', {})).toEqual([])
        expect(httpRequestMethod('get', '/server/files/upload')).toBe(null)
    })

    it('treats an upload into the config directory as config editing', () => {
        expect(classifyHttpRequest('POST', '/server/files/upload', { root: 'config', path: '' })).toEqual([
            'configEdit',
        ])
        expect(classifyHttpRequest('post', '/server/files/upload?x=1', { root: 'config' })).toEqual(['configEdit'])
        expect(classifyHttpRequest('POST', '/server/files/upload', { root: 'gcodes' })).toEqual([])
    })

    it('recognises deleting and moving files over http', () => {
        expect(classifyHttpRequest('DELETE', '/server/files/gcodes/old%20part.gcode', {})).toEqual(['deleteFile'])
        expect(classifyHttpRequest('DELETE', '/server/files/config/printer.cfg', {})).toEqual([
            'deleteFile',
            'configEdit',
        ])
        expect(classifyHttpRequest('DELETE', '/server/files/directory', { path: 'gcodes/old' })).toEqual(['deleteFile'])
        expect(classifyHttpRequest('POST', '/server/files/move', { source: 'gcodes/a', dest: 'config/a' })).toEqual([
            'deleteFile',
            'configEdit',
        ])
        expect(classifyHttpRequest('POST', '/server/files/directory', { path: 'config/new' })).toEqual(['configEdit'])
    })

    it('recognises restarts and scripts over http', () => {
        expect(classifyHttpRequest('POST', '/machine/reboot', {})).toEqual(['restart'])
        expect(classifyHttpRequest('POST', '/machine/services/restart', { service: 'klipper' })).toEqual(['restart'])
        expect(classifyHttpRequest('POST', '/printer/gcode/script', { script: 'RESTART\nSAVE_CONFIG' })).toEqual([
            'restart',
            'configEdit',
        ])
        expect(classifyHttpRequest('POST', '/printer/emergency_stop', {})).toEqual([])
    })
})

describe('combinedActionRule', () => {
    it('allows a request without protected actions', () => {
        expect(combinedActionRule([], settingsWith({ pin }))).toEqual({ rule: 'allow', action: null })
    })

    it('needs every action of a request to be permitted', () => {
        const settings = settingsWith({ actions: { configEdit: 'block' } })

        expect(combinedActionRule(['restart', 'configEdit'], settings)).toEqual({ rule: 'block', action: 'configEdit' })
        expect(combinedActionRule(['restart'], settings)).toEqual({ rule: 'allow', action: null })
    })

    it('prefers blocking over asking for the pin', () => {
        const settings = settingsWith({ actions: { restart: 'pin', deleteFile: 'block' }, pin })

        expect(combinedActionRule(['restart', 'deleteFile'], settings)).toEqual({ rule: 'block', action: 'deleteFile' })
        expect(combinedActionRule(['restart'], settings)).toEqual({ rule: 'pin', action: 'restart' })
    })

    it('does not ask again for an action that was unlocked for the open page', () => {
        const settings = settingsWith({ actions: { configEdit: 'pin', restart: 'pin' }, pin })

        expect(combinedActionRule(['configEdit'], settings, ['configEdit'])).toEqual({ rule: 'allow', action: null })
        expect(combinedActionRule(['configEdit', 'restart'], settings, ['configEdit'])).toEqual({
            rule: 'pin',
            action: 'restart',
        })
    })

    it('never unlocks a blocked action', () => {
        const settings = settingsWith({ actions: { configEdit: 'block' } })

        expect(combinedActionRule(['configEdit'], settings, ['configEdit']).rule).toBe('block')
    })
})

describe('the requests the interface can send', () => {
    const sourceRoot = path.resolve(__dirname, '../../src')
    const sourceFiles = (directory: string): string[] =>
        fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(directory, entry.name)
            if (entry.isDirectory()) return entry.name === 'types' ? [] : sourceFiles(full)

            return /\.(vue|ts)$/.test(entry.name) ? [full] : []
        })
    const sources = sourceFiles(sourceRoot).map((file) => fs.readFileSync(file, 'utf8'))
    const literals = (pattern: RegExp): string[] => [
        ...new Set(sources.flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1]))),
    ]

    const notRequests = ['printer.cfg', 'printer.extruder.can_extrude', 'printer.id', 'printer._namespace']
    const methods = literals(/['"`]((?:printer|machine|server)\.[a-z_.]+)['"`]/g).filter(
        (method) => !notRequests.includes(method)
    )
    const httpPaths = literals(/['"`}](\/(?:printer|machine|server)\/[a-z_/]+)/g)

    it('finds the requests in the source', () => {
        expect(methods.length).toBeGreaterThan(60)
        expect(methods).toEqual(expect.arrayContaining(['printer.gcode.script', 'server.restart', 'machine.update.']))
        expect(httpPaths).toEqual(expect.arrayContaining(['/server/files/upload', '/server/history/job']))
    })

    it('has decided for every websocket method whether it is guarded', () => {
        const undecided = methods.filter((method) => !isRequestKnown(method))

        expect(undecided).toEqual([])
    })

    it('has decided for every http path that can change something', () => {
        const fileOperations = /^\/server\/files\/(upload|directory|move|copy|zip)$/
        const verbsFor = (entry: string): string[] => {
            const isFileItself = entry.startsWith('/server/files/') && !fileOperations.test(entry)

            return isFileItself ? ['DELETE'] : ['POST', 'DELETE']
        }
        const undecided = httpPaths
            .flatMap((entry) => verbsFor(entry).map((verb) => httpRequestMethod(verb, entry) as string))
            .filter((method) => !isRequestKnown(method) && method !== 'server.files')

        expect(undecided).toEqual([])
    })

    it('guards a request or says why not, never both', () => {
        const both = Object.keys(guardedRequests).filter((method) => method in unguardedRequests)

        expect(both).toEqual([])
        Object.values(unguardedRequests).forEach((reason) => expect(reason.length).toBeGreaterThan(10))
    })

    it('guards the requests that restart, update or move things', () => {
        const required = [
            'server.restart',
            'machine.update.full',
            'machine.update.system',
            'machine.update.client',
            'machine.update.recover',
            'machine.services.start',
            'machine.device_power.post_device',
            'server.files.move',
        ]

        required.forEach((method) => expect(method in guardedRequests, method).toBe(true))
    })
})

describe('pages', () => {
    const available = ['dashboard', 'webcam', 'console', 'gcodefiles', 'history', 'machine']

    it('shows the chosen destinations in the chosen order', () => {
        expect(resolveBottomBar(['console', 'dashboard', 'gcodefiles'], available, [])).toEqual([
            'console',
            'dashboard',
            'gcodefiles',
        ])
    })

    it('drops destinations that are hidden or not available on this printer', () => {
        expect(resolveBottomBar(['dashboard', 'timelapse', 'machine', 'console'], available, ['machine'])).toEqual([
            'dashboard',
            'console',
        ])
    })

    it('never shows more than four destinations', () => {
        expect(resolveBottomBar(available, available, [])).toEqual(['dashboard', 'webcam', 'console', 'gcodefiles'])
    })

    it('always keeps the dashboard reachable', () => {
        expect(resolveBottomBar([], available, [])).toEqual(['dashboard'])
        expect(resolveBottomBar(['console'], available, ['dashboard'])).toEqual(['dashboard', 'console'])
        expect(resolveBottomBar(['timelapse'], available, [])).toEqual(['dashboard'])
    })

    it('lists the remaining exposed pages under more', () => {
        expect(resolveMorePages(['dashboard', 'console'], available, ['machine'])).toEqual([
            'webcam',
            'gcodefiles',
            'history',
        ])
    })

    it('blocks hidden pages and guards the machine page like config editing', () => {
        const settings = settingsWith({ hiddenPages: ['history'], actions: { configEdit: 'pin' }, pin })

        expect(routeRule('history', settings)).toBe('block')
        expect(routeRule('console', settings)).toBe('allow')
        expect(routeRule('machine', settings)).toBe('pin')
        expect(routeRule('machine', settingsWith({ actions: { configEdit: 'block' } }))).toBe('block')
        expect(routeRule('machine', getDefaultKioskSettings())).toBe('allow')
    })

    it('never blocks the dashboard or an unnamed route', () => {
        expect(routeRule('dashboard', settingsWith({ hiddenPages: ['dashboard'] }))).toBe('allow')
        expect(routeRule(undefined, settingsWith({ hiddenPages: ['history'] }))).toBe('allow')
    })
})

describe('pages of the new interface', () => {
    const at = (page: string, tab: string | null = null) => ({ page, tab })
    const pageNames = ['home', 'print', 'tune', 'fix', 'machine', 'settings']
    const firstTabs: Record<string, string | null> = {
        home: null,
        print: 'files',
        tune: 'move',
        fix: 'status',
        machine: 'config',
        settings: 'general',
    }
    const landing = pageNames.map((page) => at(page, firstTabs[page]))

    it('allows everything by default', () => {
        const settings = getDefaultKioskSettings()

        expect(shellLocationRule(at('tune', 'move'), settings)).toBe('allow')
        expect(shellLocationRule(at('machine', 'config'), settings)).toBe('allow')
        expect(shellLocationRule(at('settings', 'general'), settings)).toBe('allow')
        expect(exposedShellPages(landing, settings)).toEqual(pageNames)
        expect(hiddenShellTabs(settings)).toEqual([])
    })

    it('blocks a hidden page with all its tabs, and a single hidden tab', () => {
        const settings = settingsWith({ hiddenShell: ['machine', 'tune/resonance'] })

        expect(shellLocationRule(at('machine', 'history'), settings)).toBe('block')
        expect(shellLocationRule(at('tune', 'resonance'), settings)).toBe('block')
        expect(shellLocationRule(at('tune', 'move'), settings)).toBe('allow')
        expect(exposedShellPages(landing, settings)).toEqual(['home', 'print', 'tune', 'fix', 'settings'])
        expect(hiddenShellTabs(settings)).toEqual(['tune/resonance'])
    })

    it('blocks a page that has no tab left to show', () => {
        const settings = settingsWith({ hiddenShell: ['fix/status', 'fix/console', 'fix/logs'] })

        expect(shellLocationRule(at('fix', null), settings)).toBe('block')
        expect(exposedShellPages([at('home'), at('fix', null), at('tune', 'move')], settings)).toEqual(['home', 'tune'])
        expect(shellLocationRule(at('home', null), settings)).toBe('allow')
    })

    it('never blocks home', () => {
        expect(shellLocationRule(at('home'), settingsWith({ hiddenShell: ['home'] }))).toBe('allow')
        expect(exposedShellPages(landing, settingsWith({ hiddenShell: ['home'] }))).toContain('home')
    })

    it('guards the config files like config editing', () => {
        expect(shellLocationRule(at('machine', 'config'), settingsWith({ actions: { configEdit: 'pin' }, pin }))).toBe(
            'pin'
        )
        expect(shellLocationRule(at('machine', 'system'), settingsWith({ actions: { configEdit: 'pin' }, pin }))).toBe(
            'allow'
        )

        const blocked = settingsWith({ actions: { configEdit: 'block' } })
        expect(shellLocationRule(at('machine', 'config'), blocked)).toBe('block')
        expect(hiddenShellTabs(blocked)).toEqual(['machine/config'])
    })

    it('guards the settings page like the settings', () => {
        expect(shellLocationRule(at('settings', 'general'), settingsWith({ pin }))).toBe('pin')
        expect(shellLocationRule(at('settings', 'kiosk'), settingsWith({ actions: { settings: 'block' } }))).toBe(
            'block'
        )
        expect(exposedShellPages(landing, settingsWith({ actions: { settings: 'block' } }))).not.toContain('settings')
        expect(exposedShellPages(landing, settingsWith({ pin }))).toContain('settings')
    })

    it('cannot hide the settings page through the page list', () => {
        expect(shellLocationRule(at('settings', 'general'), settingsWith({ hiddenShell: ['settings'] }))).toBe('allow')
    })

    it('keeps the settings unlocked while moving between their tabs, and a tab only for itself', () => {
        expect(shellLockKey(at('settings', 'general'))).toBe(shellLockKey(at('settings', 'kiosk')))
        expect(shellLockKey(at('machine', 'config'))).not.toBe(shellLockKey(at('machine', 'system')))
    })

    it('knows that a screen which enters touch mode by itself cannot recover by clearing its data', () => {
        expect(canRecoverOnSmallScreen(settingsWith({ smallScreens: 'apply' }))).toBe(false)
        expect(canRecoverOnSmallScreen(settingsWith({ smallScreens: 'suggest' }))).toBe(true)
        expect(canRecoverOnSmallScreen(settingsWith({ smallScreens: 'off' }))).toBe(true)
    })
})

describe('dashboard panels', () => {
    it('starts with the status panel and follows the layout order', () => {
        expect(kioskPanelSequence([['webcam', 'toolhead-control', 'macros']], [])).toEqual([
            'status',
            'webcam',
            'toolhead-control',
            'macros',
        ])
    })

    it('reads a layout with several columns row by row, so the top of every column comes early', () => {
        expect(
            kioskPanelSequence(
                [
                    ['webcam', 'toolhead-control', 'macros'],
                    ['temperature', 'miniconsole'],
                ],
                []
            )
        ).toEqual(['status', 'webcam', 'temperature', 'toolhead-control', 'miniconsole', 'macros'])
        expect(kioskPanelSequence([], [])).toEqual(['status'])
    })

    it('leaves out the panels the owner does not expose', () => {
        expect(
            kioskPanelSequence([['webcam', 'miniconsole', 'macrogroup_abc']], ['miniconsole', 'macrogroup_abc'])
        ).toEqual(['status', 'webcam'])
    })

    it('keeps the status panel even when it is listed as hidden', () => {
        expect(kioskPanelSequence([['webcam']], ['status', 'webcam'])).toEqual(['status'])
    })

    it('keeps the panel the user opened while it exists', () => {
        expect(resolveOpenPanel('temperature', ['status', 'webcam', 'temperature'], 'idle')).toBe('temperature')
        expect(resolveOpenPanel('temperature', ['status', 'print-hero', 'temperature'], 'printing')).toBe('temperature')
    })

    it('opens the print hero during a print when the user has not chosen a panel', () => {
        expect(resolveOpenPanel(null, ['status', 'print-hero', 'temperature'], 'printing')).toBe('print-hero')
        expect(resolveOpenPanel(null, ['status', 'temperature'], 'printing')).toBe('status')
    })

    it('opens the status panel after an error, because it explains the error and offers the restart', () => {
        expect(resolveOpenPanel(null, ['status', 'miniconsole', 'webcam'], 'error')).toBe('status')
    })

    it('falls back to the first panel when the chosen one is gone', () => {
        expect(resolveOpenPanel('webcam', ['status', 'temperature'], 'idle')).toBe('status')
        expect(resolveOpenPanel(null, ['status', 'temperature'], 'idle')).toBe('status')
    })
})

describe('panels that are only mounted while they are open', () => {
    const ready = { klipperReady: true, klipperConnected: true, heroVisible: true }

    it('are the ones that keep a stream, a chart or a log running', () => {
        expect(onDemandPanels).toEqual(['webcam', 'temperature', 'miniconsole', 'print-hero'])
    })

    it('get a tab only when they would show something', () => {
        onDemandPanels.forEach((name) => expect(onDemandPanelRenders(name, ready), name).toBe(true))
        expect(onDemandPanelRenders('temperature', { ...ready, klipperReady: false })).toBe(false)
        expect(onDemandPanelRenders('miniconsole', { ...ready, klipperConnected: false })).toBe(false)
        expect(onDemandPanelRenders('miniconsole', { ...ready, klipperReady: false })).toBe(true)
        expect(onDemandPanelRenders('print-hero', { ...ready, heroVisible: false })).toBe(false)
        expect(
            onDemandPanelRenders('webcam', { klipperReady: false, klipperConnected: false, heroVisible: false })
        ).toBe(true)
    })
})

describe('swipeDirection', () => {
    it('recognises a clear horizontal swipe', () => {
        expect(swipeDirection({ dx: -120, dy: 10 })).toBe('next')
        expect(swipeDirection({ dx: 120, dy: -20 })).toBe('previous')
    })

    it('ignores short movements and vertical scrolling', () => {
        expect(swipeDirection({ dx: -30, dy: 0 })).toBe(null)
        expect(swipeDirection({ dx: -100, dy: 90 })).toBe(null)
        expect(swipeDirection({ dx: 0, dy: -300 })).toBe(null)
    })
})
