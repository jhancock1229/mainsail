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
        expect(classifyRequest('printer.emergency_stop', {})).toBe(null)
        expect(classifyRequest('printer.gcode.script', { script: 'M112' })).toBe(null)
    })

    it('recognises cancelling a print', () => {
        expect(classifyRequest('printer.print.cancel', {})).toBe('cancelPrint')
        expect(classifyRequest('printer.gcode.script', { script: 'CANCEL_PRINT' })).toBe('cancelPrint')
        expect(classifyRequest('printer.gcode.script', { script: 'G28\n  cancel_print  ; stop' })).toBe('cancelPrint')
    })

    it('recognises restarts of klipper, services and the host', () => {
        expect(classifyRequest('printer.firmware_restart', {})).toBe('restart')
        expect(classifyRequest('printer.restart', {})).toBe('restart')
        expect(classifyRequest('printer.gcode.script', { script: 'FIRMWARE_RESTART' })).toBe('restart')
        expect(classifyRequest('printer.gcode.script', { script: 'RESTART' })).toBe('restart')
        expect(classifyRequest('machine.reboot', {})).toBe('restart')
        expect(classifyRequest('machine.shutdown', {})).toBe('restart')
        expect(classifyRequest('machine.device_power.off', { printer: null })).toBe('restart')
        expect(classifyRequest('machine.device_power.on', { printer: null })).toBe(null)
        expect(classifyRequest('machine.services.restart', { service: 'klipper' })).toBe('restart')
        expect(classifyRequest('machine.services.stop', { service: 'klipper' })).toBe('restart')
    })

    it('recognises deleting files and directories', () => {
        expect(classifyRequest('server.files.delete_file', { path: 'gcodes/a.gcode' })).toBe('deleteFile')
        expect(classifyRequest('server.files.delete_directory', { path: 'gcodes/old' })).toBe('deleteFile')
    })

    it('recognises saving the configuration', () => {
        expect(classifyRequest('printer.gcode.script', { script: 'SAVE_CONFIG' })).toBe('configEdit')
    })

    it('leaves ordinary requests alone', () => {
        expect(classifyRequest('printer.gcode.script', { script: 'G28' })).toBe(null)
        expect(classifyRequest('printer.gcode.script', { script: 'SET_HEATER_TEMPERATURE HEATER=extruder' })).toBe(null)
        expect(classifyRequest('printer.gcode.script', { script: 'M117 RESTART later' })).toBe(null)
        expect(classifyRequest('printer.gcode.script', {})).toBe(null)
        expect(classifyRequest('printer.print.pause', {})).toBe(null)
        expect(classifyRequest('server.database.post_item', { key: 'kiosk.pin' })).toBe(null)
        expect(classifyRequest('server.files.get_directory', { path: 'gcodes' })).toBe(null)
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
