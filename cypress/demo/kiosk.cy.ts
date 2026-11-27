import { demo, useTouchScreen } from './support'

const PIN = '4821'

const openKiosk = (path = '/?kiosk=1') => {
    cy.visit(path)
    cy.get('.kiosk-bottom-bar', { timeout: 15000 })
}

const openTouchPhone = () => {
    cy.viewport(400, 850)
    cy.visit('/')
    cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
    useTouchScreen()
}

const openKioskSettings = () => {
    cy.get('.kiosk-bottom-bar__more').click()
    cy.get('.kiosk-more-sheet__settings').click()
}

const closeSettings = () => cy.get('.settings-menu-dialog .panel-toolbar button').last().click()

const enterPin = (pin: string, dialog = '.kiosk-pin-dialog') => {
    pin.split('').forEach((digit) => cy.get(`${dialog} [data-key="${digit}"]`).click())
    cy.get(`${dialog} [data-key="ok"]`).click()
}

const setPin = (pin: string) => {
    cy.get('.kiosk-pin-set').click()
    cy.contains('.kiosk-set-pin-dialog', 'Choose a PIN')
    enterPin(pin, '.kiosk-set-pin-dialog')
    cy.contains('.kiosk-set-pin-dialog', 'Repeat the PIN')
    enterPin(pin, '.kiosk-set-pin-dialog')
    cy.contains('.settings-kiosk-tab', 'A PIN is set')
}

const chooseRule = (action: string, rule: string) => {
    cy.get(`.kiosk-action-${action}`).click()
    cy.contains(`.kiosk-action-${action} .v-list-item`, rule).click()
}

const visiblePanelTitles = (check: (titles: string[]) => void) =>
    cy
        .get('.kiosk-dashboard__panel:visible .panel .panel-toolbar .subheading')
        .should(($titles) => check($titles.toArray().map((title) => title.innerText.trim())))

const touchAt = (clientX: number, clientY: number) => {
    const touches = [{ clientX, clientY, pageX: clientX, pageY: clientY }]

    return { touches, changedTouches: touches }
}

const swipe = (selector: string, fromX: number, toX: number) => {
    cy.get(selector).first().trigger('touchstart', touchAt(fromX, 300)).trigger('touchend', touchAt(toX, 306))
}

const noRawKeys = (selector: string) =>
    cy
        .get(selector)
        .invoke('text')
        .should('not.match', /Kiosk\.[A-Z]|Settings\.KioskTab|Router\./)

describe('Touch and kiosk mode', () => {
    beforeEach(() => {
        demo('reset')
    })

    it('changes nothing for a desktop that never enabled it', () => {
        cy.visit('/')
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })

        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
        cy.get('.kiosk-bottom-bar').should('not.exist')
        cy.get('.kiosk-suggestion').should('not.exist')
        cy.get('.kiosk-dashboard').should('not.exist')
        cy.get('.v-navigation-drawer').should('exist')
        cy.get('.v-app-bar__nav-icon').should('be.visible')
        cy.get('.v-main .row').first().children().should('have.length', 2)
    })

    it('starts in touch mode with the url parameter and stays in it after a reload', () => {
        openKiosk()

        cy.get('.v-application').should('have.class', 'kiosk-mode')
        cy.get('.v-navigation-drawer').should('not.exist')
        cy.get('.v-app-bar__nav-icon').should('not.be.visible')
        cy.get('.emergency-button').should('be.visible')
        cy.get('.kiosk-bottom-bar .kiosk-bottom-bar__item').should(($items) => {
            expect($items.toArray().map((item) => item.innerText.trim())).to.deep.equal([
                'Dashboard',
                'Files',
                'Console',
                'Webcam',
            ])
        })
        noRawKeys('.v-application')

        cy.visit('/')
        cy.get('.kiosk-bottom-bar', { timeout: 15000 })
    })

    it('shows one dashboard panel at a time, in the order of the dashboard layout', () => {
        openKiosk()

        visiblePanelTitles((titles) => expect(titles).to.deep.equal(['Standby']))
        cy.get('.kiosk-dashboard__tab').should(($tabs) => {
            const names = $tabs.toArray().map((tab) => tab.dataset.panel)
            expect(names[0]).to.equal('status')
            expect(names.indexOf('temperature')).to.be.lessThan(names.indexOf('miniconsole'))
            expect(names.indexOf('miniconsole')).to.be.lessThan(names.indexOf('toolhead-control'))
        })

        cy.get('.kiosk-dashboard__tab[data-panel="temperature"]').click()
        visiblePanelTitles((titles) => expect(titles).to.deep.equal(['Temperatures']))
        cy.contains('.kiosk-dashboard__position', /Panel \d+ of \d+/)
    })

    it('moves between panels with a swipe, but not when a slider is dragged', () => {
        openKiosk()
        visiblePanelTitles((titles) => expect(titles).to.deep.equal(['Standby']))

        swipe('.kiosk-dashboard__panel:visible .panel-toolbar', 320, 80)
        cy.get('.kiosk-dashboard__tab').eq(1).should('have.class', 'v-tab--active')
        visiblePanelTitles((titles) => expect(titles).to.have.length(1).and.not.to.include('Standby'))
        cy.get('.kiosk-dashboard__tab[data-panel="print-hero"]').should('not.exist')

        swipe('.kiosk-dashboard__panel:visible .panel-toolbar', 80, 320)
        visiblePanelTitles((titles) => expect(titles).to.deep.equal(['Standby']))

        cy.get('.kiosk-dashboard__tab[data-panel="toolhead-control"]').click()
        swipe('.kiosk-dashboard__panel:visible .v-slider', 320, 80)
        cy.get('.kiosk-dashboard__tab[data-panel="toolhead-control"]').should('have.class', 'v-tab--active')
    })

    it('follows the printer state: the print progress opens when a print starts', () => {
        openKiosk()
        cy.get('.kiosk-dashboard__tab[data-panel="temperature"]').click()

        demo('print')
        cy.get('.kiosk-dashboard__tab[data-panel="print-hero"]').should('have.class', 'v-tab--active')
        cy.get('.kiosk-dashboard__tab').should(($tabs) => {
            const names = $tabs.toArray().map((tab) => tab.dataset.panel)
            expect(names.slice(0, 2)).to.deep.equal(['status', 'print-hero'])
            expect(names[names.length - 1]).to.equal('toolhead-control')
        })
    })

    it('navigates with the bottom bar and the more sheet', () => {
        openKiosk()

        cy.get('.kiosk-bottom-bar__item[data-page="console"]').click()
        cy.location('pathname').should('equal', '/console')
        cy.get('.kiosk-bottom-bar__item[data-page="console"]').should('have.attr', 'aria-current', 'page')

        cy.get('.kiosk-bottom-bar__more').click()
        noRawKeys('.kiosk-more-sheet')
        cy.get('.kiosk-more-sheet__item[data-page="history"]').click()
        cy.location('pathname').should('equal', '/history')
        cy.get('.kiosk-more-sheet__item').should('not.be.visible')
    })

    it('suggests touch mode on a small touch screen, and never again once declined', () => {
        openTouchPhone()
        cy.get('.kiosk-suggestion').should('be.visible')
        noRawKeys('.kiosk-suggestion')
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')

        cy.get('.kiosk-suggestion__decline').click()
        cy.get('.kiosk-suggestion').should('not.exist')

        openTouchPhone()
        cy.get('.kiosk-suggestion').should('not.exist')
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
    })

    it('switches to touch mode when the suggestion is accepted', () => {
        openTouchPhone()
        cy.get('.kiosk-suggestion__accept').click()

        cy.get('.kiosk-bottom-bar').should('be.visible')
        cy.get('.kiosk-suggestion').should('not.exist')
        cy.get('.kiosk-bottom-bar').should(($bar) => {
            expect($bar[0].getBoundingClientRect().bottom).to.be.at.most(850)
            expect($bar[0].scrollWidth).to.be.at.most(400)
        })
    })

    it('applies automatically on small touch screens when the owner chooses that', () => {
        openKiosk()
        openKioskSettings()
        noRawKeys('.settings-menu-dialog')
        cy.get('.kiosk-small-screens').click()
        cy.contains('.kiosk-small-screens .v-list-item', 'Switch to touch mode automatically').click()
        closeSettings()

        cy.clearLocalStorage()
        openTouchPhone()
        cy.get('.kiosk-bottom-bar').should('be.visible')
        cy.get('.kiosk-suggestion').should('not.exist')
    })

    it('can be switched on and off in the settings', () => {
        cy.visit('/')
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('.v-app-bar button').eq(-2).click()
        cy.contains('.v-dialog--active .v-tab', /Touch & kiosk/i).click()
        cy.get('.kiosk-enable-switch').click()
        cy.get('.v-application').should('have.class', 'kiosk-mode')

        cy.get('.kiosk-enable-switch').click()
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
        cy.get('.kiosk-bottom-bar').should('not.exist')
    })

    it('lets the owner choose the bottom bar, the pages and the panels', () => {
        openKiosk()
        openKioskSettings()

        cy.get('.kiosk-bottom-bar-select').click()
        cy.contains('.kiosk-bottom-bar-select .v-list-item', 'Webcam').click()
        cy.contains('.kiosk-bottom-bar-select .v-list-item', 'History').click()
        cy.get('body').type('{esc}')
        cy.contains('.kiosk-pages .v-label', 'Console').click()
        cy.contains('.kiosk-panels .v-label', 'Console').click()
        closeSettings()

        cy.get('.kiosk-bottom-bar .kiosk-bottom-bar__item').should(($items) => {
            expect($items.toArray().map((item) => item.innerText.trim())).to.deep.equal([
                'Dashboard',
                'Files',
                'History',
            ])
        })
        cy.get('.kiosk-dashboard__tab[data-panel="miniconsole"]').should('not.exist')
        cy.get('.kiosk-dashboard__tab[data-panel="temperature"]').should('exist')

        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__item[data-page="webcam"]').should('exist')
        cy.get('.kiosk-more-sheet__item[data-page="console"]').should('not.exist')

        cy.visit('/console')
        cy.get('.kiosk-bottom-bar', { timeout: 15000 })
        cy.location('pathname').should('equal', '/')
    })

    it('asks for the pin before a protected action, and never before the emergency stop', () => {
        openKiosk()
        openKioskSettings()
        chooseRule('restart', 'Require PIN')
        cy.get('.kiosk-pin-missing').should('be.visible')
        setPin(PIN)
        cy.get('.kiosk-pin-missing').should('not.exist')
        cy.contains('.kiosk-pin-honesty', 'not a security boundary')
        closeSettings()

        cy.request(
            `${Cypress.env('demoUrl').replace('/demo', '')}/server/database/item?namespace=mainsail&key=kiosk`
        ).then((response) => {
            const stored = JSON.stringify(response.body)
            expect(stored).not.to.contain(PIN)
            expect(response.body.result.value.pin.hash).to.match(/^[0-9a-f]{64}$/)
        })

        cy.get('.topbar-corner-menu button').click()
        cy.contains('.v-menu__content .v-list-item', 'Firmware Restart').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to restart, power off or update')
        noRawKeys('.kiosk-pin-dialog')

        enterPin('1111')
        cy.contains('.kiosk-pin-dialog', 'Wrong PIN')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        demo('status').its('body').should('contain', 'klipper: ready')

        cy.get('.emergency-button').click()
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        cy.contains('.kiosk-dashboard__panel:visible', 'Shutdown', { timeout: 10000 })

        cy.get('.topbar-corner-menu button').click()
        cy.contains('.v-menu__content .v-list-item', 'Firmware Restart').click()
        enterPin(PIN)
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        visiblePanelTitles((titles) => expect(titles).to.deep.equal(['Standby']))
    })

    it('blocks an action the owner does not expose', () => {
        openKiosk()
        openKioskSettings()
        chooseRule('deleteFile', 'Block')
        chooseRule('configEdit', 'Block')
        closeSettings()

        cy.get('.kiosk-bottom-bar__item[data-page="gcodefiles"]').click()
        cy.contains('.v-data-table tr', 'benchy.gcode').rightclick()
        cy.contains('.v-menu__content .v-list-item', 'Delete').click()
        cy.contains('.v-dialog--active button', 'Delete').click()
        cy.contains('.v-toast', 'not available in touch mode')
        cy.contains('.v-data-table tr', 'benchy.gcode').should('exist')

        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__item[data-page="machine"]').click()
        cy.location('pathname').should('equal', '/files')
    })

    it('needs the pin to open the settings and to leave', () => {
        openKiosk()
        openKioskSettings()
        setPin(PIN)
        closeSettings()

        openKioskSettings()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to open the settings')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.settings-menu-dialog').should('not.be.visible')

        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__exit').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to leave touch mode')
        enterPin('0000')
        cy.contains('.kiosk-pin-dialog', 'Wrong PIN')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.v-application').should('have.class', 'kiosk-mode')

        cy.visit('/?kiosk=0')
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to leave touch mode', { timeout: 15000 })
        cy.get('.v-application').should('have.class', 'kiosk-mode')
        enterPin(PIN)
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
        cy.get('.kiosk-bottom-bar').should('not.exist')
        cy.get('.v-navigation-drawer').should('exist')
    })

    it('locks the keypad after too many attempts, also for the address that leaves touch mode', () => {
        openKiosk()
        openKioskSettings()
        setPin(PIN)
        closeSettings()

        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__exit').click()
        for (let attempt = 0; attempt < 5; attempt++) enterPin('0000')
        cy.contains('.kiosk-pin-dialog', 'Too many wrong attempts')
        cy.get('.kiosk-pin-dialog [data-key="1"]').should('be.disabled')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.v-application').should('have.class', 'kiosk-mode')

        cy.visit('/?kiosk=0')
        cy.contains('.kiosk-pin-dialog', 'Too many wrong attempts', { timeout: 15000 })
        cy.get('.kiosk-pin-dialog [data-key="1"]').should('be.disabled')
        cy.get('.v-application').should('have.class', 'kiosk-mode')
    })

    it('leaves without a pin when none is set', () => {
        openKiosk()
        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__exit').click()

        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
    })

    it('recovers from a forgotten pin on a device that is not in touch mode', () => {
        openKiosk()
        openKioskSettings()
        setPin(PIN)
        closeSettings()

        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__exit').click()
        cy.get('.kiosk-pin-dialog__forgot').click()
        cy.contains('.kiosk-pin-dialog__recovery', 'not in touch mode')
        cy.contains('.kiosk-pin-dialog__recovery', 'kiosk.pin')
        cy.get('.kiosk-pin-dialog__reset').should('not.exist')
        noRawKeys('.kiosk-pin-dialog')

        cy.clearLocalStorage()
        cy.visit('/')
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
        cy.get('.v-app-bar button').eq(-2).click()
        cy.contains('.v-dialog--active .v-tab', /Touch & kiosk/i).click()
        cy.contains('.settings-kiosk-tab', 'A PIN is set')
        cy.get('.kiosk-pin-set').click()
        cy.get('.kiosk-pin-dialog__forgot').click()
        cy.get('.kiosk-pin-dialog__reset').click()
        cy.get('.kiosk-set-pin-dialog [data-key="1"]').should('be.visible')
        cy.contains('.kiosk-set-pin-dialog button', 'Cancel').click()
        cy.contains('.settings-kiosk-tab', 'No PIN set')

        openKiosk()
        cy.get('.kiosk-bottom-bar__more').click()
        cy.get('.kiosk-more-sheet__exit').click()
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        cy.get('.v-application').should('not.have.class', 'kiosk-mode')
    })
})
