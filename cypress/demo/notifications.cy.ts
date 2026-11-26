import { demo } from './support'

interface ShownNotification {
    title: string
    body: string
}

interface StubbedWindow {
    shownNotifications: ShownNotification[]
    playedTones: number[]
    permissionRequests: number
}

type Permission = 'granted' | 'denied' | 'default'

// Replaces the browser notifications and the audio output of the page, so the tests can see what was sent.
// A permission request is answered with "granted", unless the permission is "denied" already.
const stubBrowser = (win: Cypress.AUTWindow, permission: Permission) => {
    const stubbed = win as unknown as StubbedWindow
    stubbed.shownNotifications = []
    stubbed.playedTones = []
    stubbed.permissionRequests = 0

    class FakeNotification {
        static permission = permission
        static requestPermission() {
            stubbed.permissionRequests++
            if (FakeNotification.permission === 'default') FakeNotification.permission = 'granted'

            return Promise.resolve(FakeNotification.permission)
        }
        onclick = null
        constructor(title: string, options?: { body?: string }) {
            stubbed.shownNotifications.push({ title, body: options?.body ?? '' })
        }
        close() {}
    }

    class FakeAudioContext {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator() {
            const frequency = { value: 0 }

            return {
                type: 'sine',
                frequency,
                connect() {},
                start: () => stubbed.playedTones.push(frequency.value),
                stop() {},
            }
        }
        createGain() {
            return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }
        }
        resume() {
            return Promise.resolve()
        }
    }

    Object.defineProperty(win, 'Notification', { value: FakeNotification, configurable: true, writable: true })
    Object.defineProperty(win, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true })
}

// checks what the page sent to the stubs (retried until it passes)
const expectStubs = (check: (stubs: StubbedWindow) => void) =>
    cy.window().should((win) => check(win as unknown as StubbedWindow))

// The service worker of Mainsail serves the page from its cache, past Cypress and so without the stubs.
const withoutServiceWorker = (win: Cypress.AUTWindow) => {
    delete (Object.getPrototypeOf(win.navigator) as { serviceWorker?: unknown }).serviceWorker
}

const removeServiceWorkers = async (win: Cypress.AUTWindow) => {
    const registrations = await win.navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    const cacheNames = await win.caches.keys()
    await Promise.all(cacheNames.map((name) => win.caches.delete(name)))
}

let initialPermission: Permission = 'default'
Cypress.on('window:before:load', (win) => {
    withoutServiceWorker(win)
    stubBrowser(win, initialPermission)
})

const visit = (permission: Permission = 'default') => {
    initialPermission = permission
    cy.visit('/')
    // a page that was served by a service worker of an earlier test has no stubs: remove the worker and load again
    cy.window().then((win) => {
        if ('shownNotifications' in win) return

        cy.wrap(removeServiceWorkers(win)).then(() => cy.reload())
    })
    cy.window().should('have.property', 'shownNotifications')
    cy.get('.v-main .panel', { timeout: 15000 })
}

const open = (permission: Permission = 'default') => {
    demo('reset')
    visit(permission)
    cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
}

const startPrint = () => {
    demo('print')
    cy.contains('.panel-toolbar', 'Printing')
}

const openNotificationSettings = () => {
    cy.get('.v-app-bar button').eq(-2).click()
    cy.contains('.v-dialog--active .v-tab', /^\s*Notifications\s*$/i).click()
    cy.contains('.v-dialog--active', 'Notify me about printer events')
}

const closeSettings = () => {
    cy.get('.settings-menu-dialog .panel-toolbar button').last().click()
    cy.get('.v-dialog--active').should('not.exist')
}

const channel = (event: string, name: string) => cy.get(`[data-event=${event}] [data-channel=${name}] input`)
const toggleChannel = (event: string, name: string) => channel(event, name).click({ force: true })
const toast = (text: string) => cy.contains('.v-toast__item', text, { timeout: 10000 })
// gives a notification that should not come the time to show up
const expectNoToast = (text: string) => {
    cy.wait(2500)
    cy.contains('.v-toast__item', text).should('not.exist')
}

const untranslated = /(ErrorExplainer|PrinterEvents|NotificationsTab|KlippyStatePanel)\./

describe('Error explainer', () => {
    beforeEach(() => {
        open()
    })

    const klipperErrors = [
        ['timer-too-close', "The printer's computer could not keep up", 'Timer too close'],
        ['lost-communication', 'The connection to the controller board was lost', 'Lost communication with MCU'],
        ['thermistor', 'A temperature sensor reported an impossible value', 'ADC out of range'],
        ['heater', 'A heater is not heating up as expected', 'not heating at expected rate'],
        ['mcu-connect', 'Klipper cannot reach the controller board', 'Unable to connect'],
        ['config', 'There is a mistake in the configuration', "Option 'sensor_type' in section 'extruder'"],
    ]

    klipperErrors.forEach(([name, title, raw]) => {
        it(`explains the Klipper error "${name}" and keeps the original message one click away`, () => {
            demo(`error/${name}`)

            cy.contains('.v-alert .error-explainer__title', title, { timeout: 15000 })
            cy.get('.v-alert .error-explainer__cause').invoke('text').should('have.length.greaterThan', 40)
            cy.get('.v-alert .error-explainer__fix').invoke('text').should('have.length.greaterThan', 20)
            cy.get('.v-alert').invoke('text').should('not.match', untranslated)

            cy.contains('.error-explainer__raw', raw).should('not.be.visible')
            cy.contains('.error-explainer button', 'Show original message').click()
            cy.contains('.error-explainer__raw', raw).should('be.visible')
        })
    })

    it('shows the raw text of an unknown Klipper error right away', () => {
        demo('error/unknown')

        cy.contains('.v-alert .error-explainer__title', 'The printer reported an error')
        cy.contains('.error-explainer__raw', 'Stepper too far in past').should('be.visible')
        cy.contains('.error-explainer button', 'Show original message').should('not.exist')
    })

    it('offers the suggested actions as buttons, next to the other recovery buttons', () => {
        demo('error/timer-too-close')
        cy.contains('.error-explainer__title', 'could not keep up')

        cy.get('.error-explainer [data-action=klipperLog]')
            .should('have.attr', 'href')
            .and('match', /\/server\/files\/klippy\.log$/)
        // the recovery buttons that are not part of the suggestion stay where they were
        cy.contains('.v-alert .v-btn', /^\s*Restart\s*$/)
        cy.contains('.v-alert a.v-btn', 'Moonraker Log')
        cy.get('.v-alert').find('.v-btn:contains("Firmware Restart")').should('have.length', 1)

        cy.get('.error-explainer [data-action=firmwareRestart]').click()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('.error-explainer').should('not.exist')
    })

    it('opens printer.cfg from a configuration error and restarts Klipper', () => {
        demo('error/config')
        cy.contains('.error-explainer__title', 'There is a mistake in the configuration', { timeout: 15000 })

        cy.get('.error-explainer [data-action=openConfig]').click()
        cy.contains('.v-dialog--active', 'printer.cfg')
        cy.contains('.v-dialog--active .cm-content', '[extruder]')
        cy.get('body').type('{esc}')

        cy.get('.error-explainer [data-action=restart]').click()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
    })

    it('explains a failed print and homes the printer with the suggested action', () => {
        startPrint()
        demo('fail/must-home')

        cy.contains('.status-panel .error-explainer__title', 'The printer has to be homed first')
        cy.contains('.error-explainer__raw', 'Must home axis first').should('not.be.visible')
        cy.get('.status-panel').invoke('text').should('not.match', untranslated)
        // the buttons of the status panel are still there: clear and reprint
        cy.get('.status-panel .panel-toolbar button').should('have.length.at.least', 3)

        cy.get('.error-explainer [data-action=home]').click()
        cy.contains('.consoleTable', 'G28')
    })

    it('re-heats to the temperature of the print after a heater error', () => {
        startPrint()
        demo('fail/heater')

        cy.contains('.status-panel .error-explainer__title', 'A heater is not heating up as expected')
        cy.contains('.error-explainer [data-action=reheat]', /Heat extruder to 210\s*°C/).click()
        cy.contains('.consoleTable', 'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210')
        // restarting Klipper is only suggested while Klipper has stopped
        cy.get('.error-explainer [data-action=firmwareRestart]').should('not.exist')
    })

    it('shows the raw text of an unknown print error right away', () => {
        startPrint()
        demo('fail/unknown')

        cy.contains('.status-panel .error-explainer__title', 'The printer reported an error')
        cy.contains('.status-panel .error-explainer__raw', 'Unable to read tool 3 offsets').should('be.visible')
    })

    it('shows the raw messages as before when the explanations are switched off', () => {
        openNotificationSettings()
        cy.get('.v-dialog--active [data-setting=explainErrors]').click({ force: true })
        closeSettings()

        startPrint()
        demo('fail/must-home')
        cy.contains('.status-panel', 'Must home axis first')
        cy.get('.error-explainer').should('not.exist')

        demo('error/timer-too-close')
        cy.contains('.v-alert pre', "MCU 'mcu' shutdown: Timer too close")
        cy.get('.error-explainer').should('not.exist')
        cy.contains('.v-alert .v-btn', /^\s*Restart\s*$/)
        cy.contains('.v-alert .v-btn', 'Firmware Restart')
        cy.contains('.v-alert .v-btn', 'Klipper Log')
        cy.contains('.v-alert .v-btn', 'Moonraker Log')
    })
})

describe('Printer event notifications', () => {
    it('tells about a started, paused, finished and failed print with a toast by default', () => {
        open()
        demo('print')
        toast('Print started').should('contain', 'demo.gcode')

        demo('pause')
        toast('Print paused')

        demo('resume')
        cy.contains('.panel-toolbar', 'Printing')
        demo('finish')
        toast('Print finished').should('contain', 'demo.gcode')

        startPrint()
        demo('fail/heater')
        toast('Print failed').should('contain', 'A heater is not heating up as expected')

        cy.get('.v-toast').invoke('text').should('not.match', untranslated)
        // quiet defaults: no sound and no browser notification
        expectStubs((win) => {
            expect(win.playedTones).to.have.length(0)
            expect(win.shownNotifications).to.have.length(0)
            expect(win.permissionRequests).to.equal(0)
        })
    })

    it('tells about a Klipper error once, also when it stops a print', () => {
        open()
        startPrint()
        demo('error/lost-communication')

        toast('Klipper stopped with an error').should('contain', 'The connection to the controller board was lost')
        expectNoToast('Print failed')
        cy.get('.v-toast__item:contains("Klipper stopped with an error")').should('have.length.at.most', 1)
    })

    it('tells about a filament runout once, without a second toast for the pause', () => {
        open()
        startPrint()
        demo('runout')

        toast('Filament ran out').should('contain', 'runout_sensor')
        cy.contains('.panel-toolbar', 'Paused')
        expectNoToast('Print paused')

        // the paused print says what it is waiting for, until filament is loaded and the print resumed
        cy.contains('.status-panel .error-explainer__title', 'No filament at the sensor')
        cy.contains('.status-panel .error-explainer__cause', 'runout_sensor')
        cy.get('.status-panel').invoke('text').should('not.match', untranslated)
        demo('resume')
        cy.contains('.panel-toolbar', 'Printing')
        cy.get('.status-panel .error-explainer').should('not.exist')
    })

    it('does not call it a runout when filament is pulled out of a paused print', () => {
        open()
        startPrint()
        demo('pause')
        toast('Print paused')

        demo('runout')
        cy.contains('.status-panel .error-explainer__title', 'No filament at the sensor')
        expectNoToast('Filament ran out')
    })

    it('does not report the pause of a timelapse frame', () => {
        open()
        startPrint()
        demo('frame')

        // the frame takes about two seconds, a pause is told after a delay of 1.5 seconds
        cy.wait(4500)
        cy.contains('.panel-toolbar', 'Printing')
        cy.contains('.v-toast__item', 'Print paused').should('not.exist')

        // a pause that lasts is still told
        demo('pause')
        toast('Print paused')
    })

    it('tells a pause once when the print pauses, resumes and pauses again right away', () => {
        open()
        startPrint()
        // each state lasts longer than an update of the printer, and all three fit into the delay of a pause
        demo('pause')
        cy.wait(600)
        demo('resume')
        cy.wait(600)
        demo('pause')

        toast('Print paused')
        cy.wait(2500)
        cy.get('.v-toast__item:contains("Print paused")').should('have.length', 1)
    })

    it('tells about the failed print when a Klipper error stops it and Klipper errors are silenced', () => {
        open()
        openNotificationSettings()
        toggleChannel('klipperError', 'toast')
        cy.contains('[data-event=klipperError]', 'Silent')
        closeSettings()

        startPrint()
        demo('error/lost-communication')

        toast('Print failed').should('contain', 'The connection to the controller board was lost')
        cy.contains('.v-toast__item', 'Klipper stopped with an error').should('not.exist')
    })

    it('stays quiet on page load for a print that has failed already', () => {
        demo('reset')
        demo('print')
        demo('fail/heater')
        visit()

        cy.contains('.status-panel .error-explainer__title', 'A heater is not heating up as expected')
        cy.wait(2500)
        cy.get('.v-toast__item').should('not.exist')
    })

    it('stays quiet on page load for a Klipper that is shut down already', () => {
        demo('reset')
        demo('error/thermistor')
        visit()

        cy.contains('.error-explainer__title', 'A temperature sensor reported an impossible value')
        cy.wait(2500)
        cy.get('.v-toast__item').should('not.exist')
    })

    it('lets the rules be customized per event: sound and browser notification instead of a toast', () => {
        open()
        openNotificationSettings()
        cy.get('.v-dialog--active').invoke('text').should('not.match', untranslated)
        channel('printFinished', 'toast').should('be.checked')
        channel('printFinished', 'sound').should('not.be.checked')
        channel('printFinished', 'browser').should('not.be.checked')

        // the permission is requested when the option is enabled, not before
        expectStubs((win) => expect(win.permissionRequests).to.equal(0))
        toggleChannel('printFinished', 'browser')
        expectStubs((win) => expect(win.permissionRequests).to.equal(1))
        toggleChannel('printFinished', 'sound')
        toggleChannel('printFinished', 'toast')
        channel('printFinished', 'toast').should('not.be.checked')
        closeSettings()

        startPrint()
        demo('finish')

        expectStubs((win) => {
            expect(win.shownNotifications).to.deep.equal([{ title: 'Print finished', body: 'demo.gcode' }])
            expect(win.playedTones).to.have.length.greaterThan(0)
        })
        expectNoToast('Print finished')
    })

    it('keeps an event silent when nothing is selected', () => {
        open()
        openNotificationSettings()
        cy.get('[data-event=printStarted]').should('not.contain', 'Silent')
        toggleChannel('printStarted', 'toast')
        cy.contains('[data-event=printStarted]', 'Silent')
        cy.get('[data-event=printStarted] [data-action=test]').should('be.disabled')
        closeSettings()

        startPrint()
        expectNoToast('Print started')

        // the other events still come
        demo('pause')
        toast('Print paused')
    })

    it('sends nothing when the master switch is off', () => {
        open()
        openNotificationSettings()
        cy.get('.v-dialog--active [data-setting=notifyEnabled]').click({ force: true })
        channel('printStarted', 'toast').should('be.disabled')
        cy.get('[data-event=printStarted] [data-action=test]').should('be.disabled')
        closeSettings()

        startPrint()
        demo('fail/heater')
        cy.contains('.panel-toolbar', 'Error')
        cy.wait(2500)
        cy.get('.v-toast__item').should('not.exist')
    })

    it('has a test button per event that uses the rules of the event', () => {
        open('granted')
        openNotificationSettings()

        cy.get('[data-event=printFailed] [data-action=test]').click()
        toast('Print failed').should('contain', 'This is a test notification.')
        expectStubs((win) => expect(win.playedTones).to.have.length(0))

        toggleChannel('klipperError', 'sound')
        toggleChannel('klipperError', 'browser')
        cy.get('[data-event=klipperError] [data-action=test]').click()
        toast('Klipper stopped with an error')
        expectStubs((win) => {
            expect(win.playedTones).to.have.length.greaterThan(0)
            expect(win.shownNotifications).to.deep.equal([
                { title: 'Klipper stopped with an error', body: 'This is a test notification.' },
            ])
        })
    })

    it('opens the dashboard from the toast of an error, but not from a test notification', () => {
        open()
        cy.contains('.v-navigation-drawer a', 'Console').click()
        cy.location('pathname').should('eq', '/console')

        openNotificationSettings()
        cy.get('[data-event=printFailed] [data-action=test]').click()
        closeSettings()
        toast('This is a test notification.').click()
        cy.contains('.v-toast__item', 'This is a test notification.').should('not.exist')
        cy.location('pathname').should('eq', '/console')

        demo('print')
        toast('Print started')
        demo('fail/heater')
        toast('A heater is not heating up as expected').click()
        cy.location('pathname').should('eq', '/')
    })

    it('offers the notification rules for backup in the general settings', () => {
        open()
        openNotificationSettings()
        toggleChannel('printPaused', 'sound')
        channel('printPaused', 'sound').should('be.checked')

        cy.contains('.v-dialog--active .v-tab', /^\s*General\s*$/i).click()
        cy.contains('.v-dialog--active .v-btn', /^\s*Backup\s*$/i).click()
        cy.contains('.mainsail-backup-dialog', 'Notification Rules')
    })

    it('falls back to a toast and says why when browser notifications are blocked', () => {
        open('denied')
        openNotificationSettings()
        cy.contains('.v-dialog--active', 'Browser notifications are blocked').should('not.exist')

        toggleChannel('printFinished', 'browser')
        toggleChannel('printFinished', 'toast')
        cy.contains('.v-dialog--active', 'Browser notifications are blocked for this page')
        closeSettings()

        startPrint()
        demo('finish')
        toast('Print finished')
        expectStubs((win) => expect(win.shownNotifications).to.have.length(0))
    })

    it('keeps the rules after a reload', () => {
        open('granted')
        openNotificationSettings()
        toggleChannel('printPaused', 'sound')
        toggleChannel('filamentRunout', 'toast')
        channel('printPaused', 'sound').should('be.checked')
        closeSettings()

        visit('granted')
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        openNotificationSettings()
        channel('printPaused', 'sound').should('be.checked')
        channel('printPaused', 'toast').should('be.checked')
        channel('filamentRunout', 'toast').should('not.be.checked')
        cy.contains('[data-event=filamentRunout]', 'Silent')
    })
})
