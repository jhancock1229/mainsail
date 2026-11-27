import { openShell, useTouchScreen } from './support'
import { sha256 } from 'js-sha256'

const PIN = '4821'
const SALT = 'a1b2c3d4'
const pinRecord = { salt: SALT, hash: sha256(`${SALT}:${PIN}`), iterations: 1 }
const demoUrl = (): string => Cypress.env('demoUrl')
const demoRequest = (command: string) => cy.request(`${demoUrl()}/${command}`)
const seed = (key: string, value: unknown): string =>
    `dbset?key=kiosk.${key}&value=${encodeURIComponent(JSON.stringify(value))}`
const rule = (action: string, value: string): string => seed(`actions.${action}`, value)
const withPin = seed('pin', pinRecord)

const nav = (page: string) => cy.get(`.shell-rail__link[data-page="${page}"]`)
const section = (key: string) => cy.get(`.shell-sections__tab[data-entry="${key}"]`)
const headline = () => cy.get('.shell-header__title')
const pinPrompt = () => cy.get('.kiosk-pin-dialog.v-dialog--active')
const toast = (text: string) => cy.contains('.v-toast', text)
const sent = (log: string, check: (entries: string[]) => void) =>
    cy.request(`${demoUrl()}/${log}`).should((response) => check(response.body as string[]))
const uploads = (check: (roots: string[]) => void) =>
    cy
        .request(`${demoUrl()}/upload-log`)
        .should((response) => check((response.body as { root: string }[]).map((entry) => entry.root)))

const openConfigFromExplanation = () =>
    cy.contains('.shell-error button', /open printer\.cfg/i, { timeout: 15000 }).click()

const enterPin = (pin: string) => {
    pin.split('').forEach((digit) => cy.get(`.kiosk-pin-dialog [data-key="${digit}"]`).click())
    cy.get('.kiosk-pin-dialog [data-key="ok"]').click()
}

const openTouchMode = (path: string, seeds: string[]) => {
    const separator = path.includes('?') ? '&' : '?'
    openShell(`${path}${separator}kiosk=1`, seeds)
    cy.get('.shell-rail__leave')
}

const typeInConsole = (text: string) => {
    nav('fix').click()
    section('console:console').click()
    cy.get('.shell-fix textarea').first().type(text)
}

describe('Operator guard: config editing', () => {
    it('does not open the config from the error explanation when config editing is blocked', () => {
        openTouchMode('/', [rule('configEdit', 'block'), 'error/config'])
        headline().should('have.text', 'The printer needs attention')
        openConfigFromExplanation()

        toast('"Edit configuration" is not available in touch mode')
        cy.get('.editor-dialog').should('not.exist')
        nav('machine').click()
        cy.get('.shell-sections__tab[data-entry="config:config"]').should('not.exist')
    })

    it('asks for the pin before opening the config from the error explanation', () => {
        openTouchMode('/', [rule('configEdit', 'pin'), withPin, 'error/config'])
        openConfigFromExplanation()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to edit the configuration')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.editor-dialog').should('not.exist')

        openConfigFromExplanation()
        enterPin(PIN)
        cy.get('.editor-dialog').should('be.visible')
        cy.get('.editor-dialog .panel-toolbar button').eq(-2).click()
        pinPrompt().should('not.exist')
        uploads((roots) => expect(roots).to.deep.equal(['config']))
    })

    it('saves the config but refuses the restart of Save & Restart when restarts are blocked', () => {
        openTouchMode('/machine/config', [rule('restart', 'block')])
        cy.contains('.machine-configfiles-panel tr', 'moonraker.conf').click()
        cy.get('.editor-dialog').should('be.visible')
        cy.contains('.editor-dialog .panel-toolbar button', 'Save & Restart').click()

        toast('"Restarts, power and updates" is not available in touch mode')
        uploads((roots) => expect(roots).to.deep.equal(['config']))
        sent('rpc-log', (methods) => expect(methods).not.to.include('server.restart'))
    })

    it('restarts Moonraker after Save & Restart when it is allowed', () => {
        openTouchMode('/machine/config', [])
        cy.contains('.machine-configfiles-panel tr', 'moonraker.conf').click()
        cy.contains('.editor-dialog .panel-toolbar button', 'Save & Restart').click()

        sent('rpc-log', (methods) => expect(methods).to.include('server.restart'))
    })

    it('refuses to save an open config once config editing is blocked from elsewhere', () => {
        openTouchMode('/machine/config', [])
        cy.contains('.machine-configfiles-panel tr', 'moonraker.conf').click()
        cy.get('.editor-dialog').should('be.visible')

        demoRequest(rule('configEdit', 'block'))
        demoRequest('reconnect')
        cy.get('.shell-machine', { timeout: 15000 }).should('not.have.attr', 'data-tab', 'config')
        cy.get('.machine-configfiles-panel').should('not.exist')
        cy.get('.editor-dialog .panel-toolbar button').eq(-2).click()

        toast('"Edit configuration" is not available in touch mode')
        uploads((roots) => expect(roots).to.deep.equal([]))
    })
})

describe('Operator guard: scripts and macros', () => {
    it('checks every line of a script, not only the first protected one', () => {
        openTouchMode('/', [rule('configEdit', 'block')])
        typeInConsole('RESTART{shift+enter}SAVE_CONFIG{enter}')

        toast('"Edit configuration" is not available in touch mode')
        sent('gcode-log', (scripts) => expect(scripts.join('\n')).not.to.contain('SAVE_CONFIG'))
        sent('gcode-log', (scripts) => expect(scripts.join('\n')).not.to.contain('RESTART'))
    })

    it('guards a command behind a line number', () => {
        openTouchMode('/', [rule('cancelPrint', 'block'), 'print'])
        typeInConsole('N10 CANCEL_PRINT{enter}')

        toast('"Cancel print" is not available in touch mode')
        sent('gcode-log', (scripts) => expect(scripts.join('\n')).not.to.contain('CANCEL_PRINT'))
        demoRequest('status').its('body').should('contain', 'print: printing')
    })

    it('guards a macro that wraps a protected command', () => {
        openTouchMode('/', [rule('cancelPrint', 'block'), 'print'])
        nav('tune').click()
        section('macros:macros').click()
        cy.contains('.macros-panel .v-item-group .v-btn', /ABORT JOB/i).click()

        toast('"Cancel print" is not available in touch mode')
        sent('gcode-log', (scripts) => expect(scripts).not.to.include('ABORT_JOB'))
        demoRequest('status').its('body').should('contain', 'print: printing')

        cy.contains('.macros-panel .v-item-group .v-btn', /LIGHTS ON/i).click()
        sent('gcode-log', (scripts) => expect(scripts).to.include('LIGHTS_ON'))
    })

    it('asks for the pin before a macro that wraps a protected command and runs it afterwards', () => {
        openTouchMode('/tune/macros', [rule('cancelPrint', 'pin'), withPin, 'print'])
        cy.contains('.macros-panel .v-item-group .v-btn', /ABORT JOB/i).click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to cancel the print')
        enterPin(PIN)

        sent('gcode-log', (scripts) => expect(scripts).to.include('ABORT_JOB'))
        demoRequest('status').its('body').should('not.contain', 'print: printing')
    })

    it('says in the settings what the rules cover and what they cannot see', () => {
        openTouchMode('/settings/kiosk', [])
        cy.contains('.settings-kiosk-tab', 'macros that call it')
        cy.contains('.kiosk-coverage', 'commands a macro builds while it runs')
        cy.contains('.settings-kiosk-tab', 'software updates and recovery')
        cy.get('.settings-kiosk-tab')
            .invoke('text')
            .should('not.match', /\b(Settings|Kiosk)\.[A-Z]\w*\.\w+/)
    })
})

describe('Operator guard: pages and sessions', () => {
    it('hides a page when every tab of it is unticked', () => {
        openTouchMode('/', [seed('hiddenShell', ['fix/status', 'fix/console', 'fix/logs'])])
        cy.get('.shell-rail__link').should(($links) => {
            expect($links.toArray().map((link) => link.getAttribute('data-page'))).to.deep.equal([
                'home',
                'print',
                'tune',
                'machine',
                'settings',
            ])
        })

        cy.visit('/fix/console')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        cy.location('pathname').should('eq', '/')
        cy.get('.shell-fix').should('not.exist')
    })

    it('asks for the pin when touch mode starts by itself while the settings are open', () => {
        openShell('/settings/kiosk', [seed('smallScreens', 'apply'), withPin])
        cy.get('.settings-kiosk-tab').should('be.visible')
        cy.get('.shell-rail__leave').should('not.exist')

        cy.viewport(400, 850)
        useTouchScreen()
        cy.get('.shell-rail__leave').should('exist')
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to open the settings')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.location('pathname').should('eq', '/')
    })

    it('keeps the settings open when the pin is entered after touch mode started by itself', () => {
        openShell('/settings/kiosk', [seed('smallScreens', 'apply'), withPin])
        cy.viewport(400, 850)
        useTouchScreen()
        enterPin(PIN)

        cy.location('pathname').should('eq', '/settings/kiosk')
        cy.get('.settings-kiosk-tab').should('be.visible')
    })

    it('leaves a page that became pin protected from another device', () => {
        openTouchMode('/settings/kiosk', [])
        cy.get('.settings-kiosk-tab').should('be.visible')

        demoRequest(withPin)
        demoRequest('reconnect')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        cy.location('pathname').should('eq', '/')
        nav('settings').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to open the settings')
    })

    it('drops a pending pin prompt when the connection is lost, so nothing is sent later', () => {
        openTouchMode('/', [rule('cancelPrint', 'pin'), withPin, 'print'])
        cy.get('.shell-job__cancel').click()
        cy.contains('.v-dialog--active button', 'Yes').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to cancel the print')

        demoRequest('reconnect')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        pinPrompt().should('not.exist')
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        sent('rpc-log', (methods) => expect(methods).not.to.include('printer.print.cancel'))
        demoRequest('status').its('body').should('contain', 'print: printing')
    })

    it('says so when a second protected request arrives while the pin prompt is open', () => {
        openTouchMode('/fix/status', [rule('restart', 'pin'), withPin])
        cy.get('.shell-fix [data-action="firmware-restart"]').click()
        cy.contains('.v-dialog--active button', 'Yes').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to restart, power off or update')

        cy.get('.shell-rail__leave').click({ force: true })
        toast('Answer the PIN prompt first')
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to restart, power off or update')
        cy.get('.shell').should('have.class', 'shell--compact')
    })

    it('keeps the pin lockout after a reload', () => {
        openTouchMode('/', [withPin])
        cy.get('.shell-rail__leave').click()
        for (let attempt = 0; attempt < 5; attempt++) enterPin('0000')
        cy.contains('.kiosk-pin-dialog', 'Too many wrong attempts')

        cy.reload()
        cy.get('.shell-rail__leave', { timeout: 15000 }).click()
        cy.contains('.kiosk-pin-dialog', 'Too many wrong attempts')
        cy.get('.kiosk-pin-dialog [data-key="1"]').should('be.disabled')
    })
})

describe('Operator guard: classic touch mode', () => {
    beforeEach(() => {
        demoRequest('reset')
        demoRequest('classic')
    })

    it('mounts the webcam, the chart and the console only while their panel is open', () => {
        cy.visit('/?kiosk=1')
        cy.get('.kiosk-bottom-bar', { timeout: 15000 })
        cy.get('.kiosk-dashboard__tab[data-panel="webcam"]').should('exist')
        cy.get('.kiosk-dashboard__panel[data-panel="webcam"]').children().should('have.length', 0)
        cy.get('.kiosk-dashboard__panel[data-panel="temperature"]').children().should('have.length', 0)
        cy.get('.kiosk-dashboard__panel[data-panel="miniconsole"]').children().should('have.length', 0)

        cy.get('.kiosk-dashboard__tab[data-panel="webcam"]').click()
        cy.get('.kiosk-dashboard__panel[data-panel="webcam"] .panel').should('be.visible')
        cy.get('.kiosk-dashboard__tab[data-panel="temperature"]').click()
        cy.get('.kiosk-dashboard__panel[data-panel="temperature"] .panel').should('be.visible')
        cy.get('.kiosk-dashboard__panel[data-panel="webcam"]').children().should('have.length', 0)
    })

    it('offers no tab for a heavy panel that would be empty', () => {
        cy.visit('/?kiosk=1')
        cy.get('.kiosk-bottom-bar', { timeout: 15000 })
        cy.get('.kiosk-dashboard__tab[data-panel="print-hero"]').should('not.exist')

        demoRequest('error')
        cy.get('.kiosk-dashboard__tab[data-panel="temperature"]').should('not.exist')
        cy.get('.kiosk-dashboard__tab[data-panel="miniconsole"]').should('exist')
    })
})
