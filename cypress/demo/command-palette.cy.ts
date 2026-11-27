import { demo, openDashboard } from './support'

const mod = Cypress.platform === 'darwin' ? '{meta}' : '{ctrl}'
const modLabel = Cypress.platform === 'darwin' ? '⌘' : 'Ctrl'

const paletteDialog = '.v-dialog--active.command-palette'
const input = () => cy.get(`${paletteDialog} .command-palette__input`)
const openPalette = () => {
    cy.get('body').type(`${mod}k`)
    input().should('be.focused')
}
const paletteIsClosed = () => cy.get(paletteDialog).should('not.exist')
const search = (text: string) => input().clear().type(text)
const selectedRow = () => cy.get(`${paletteDialog} .command-palette-row--selected`)
const sectionTitles = (check: (titles: string[]) => void) =>
    cy
        .get(`${paletteDialog} .command-palette__section span:first-child`)
        .should(($titles) => check($titles.toArray().map((title) => title.innerText.trim().toLowerCase())))
const noRawKeys = (selector: string) =>
    cy
        .get(selector)
        .invoke('text')
        .should('not.match', /CommandPalette|Settings\.|Buttons\./)

const gcodeLog = (check: (scripts: string[]) => void, attempts = 20): void => {
    demo('gcode-log').then((response) => {
        try {
            check(response.body)
        } catch (error) {
            if (attempts <= 0) throw error
            cy.wait(150)
            gcodeLog(check, attempts - 1)
        }
    })
}
const printerStatus = (check: (status: string) => void, attempts = 20): void => {
    demo('status').then((response) => {
        try {
            check(response.body)
        } catch (error) {
            if (attempts <= 0) throw error
            cy.wait(150)
            printerStatus(check, attempts - 1)
        }
    })
}

const dispatch = (action: string, payload: unknown) =>
    cy.get('#app').then(($app) => {
        const app = $app[0] as unknown as { __vue__: { $store: { dispatch: (name: string, value: unknown) => void } } }
        app.__vue__.$store.dispatch(action, payload)
    })

const openPaletteSettings = () => {
    openPalette()
    search('settings commands{enter}')
    cy.contains('.v-dialog--active .v-tab--active', /commands/i)
    cy.contains('.v-dialog--active', 'Enable the command palette')
}
const closeSettings = () => {
    cy.get('.settings-menu-dialog .panel-toolbar button').last().click()
    cy.get('.v-dialog--active').should('not.exist')
}

describe('Command palette', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('opens with the shortcut and with the button in the top bar, and closes with Esc', () => {
        openPalette()
        sectionTitles((titles) =>
            expect(titles).to.deep.equal(['printer actions', 'go to', 'macros', 'print a file', 'settings'])
        )
        noRawKeys(paletteDialog)
        input().type('{esc}')
        paletteIsClosed()

        cy.get('.command-palette-trigger').should('contain', 'Search commands').and('contain', modLabel).click()
        input().should('be.focused')
        cy.get('body').type(`${mod}k`)
        paletteIsClosed()
    })

    it('goes to a page with the keyboard only', () => {
        openPalette()
        search('consol')
        selectedRow().should('contain', 'Console')
        input().type('{enter}')

        paletteIsClosed()
        cy.location('pathname').should('equal', '/console')
    })

    it('moves the selection with the arrow keys', () => {
        openPalette()
        search('filament')
        selectedRow().should('contain', 'LOAD_FILAMENT').and('not.contain', 'UNLOAD')
        input().type('{downarrow}')
        selectedRow().should('contain', 'UNLOAD_FILAMENT')
        input().type('{uparrow}')
        selectedRow().should('contain', 'LOAD_FILAMENT').and('not.contain', 'UNLOAD')
    })

    it('runs a macro and remembers it as recently used', () => {
        openPalette()
        search('park')
        selectedRow().should('contain', 'PARK_TOOLHEAD').and('contain', 'Park the toolhead at the front of the bed')
        input().type('{enter}')

        paletteIsClosed()
        cy.contains('.v-main', 'Toolhead parked')
        gcodeLog((scripts) => expect(scripts).to.include('PARK_TOOLHEAD'))

        openPalette()
        sectionTitles((titles) => expect(titles[0]).to.equal('recently used'))
        selectedRow().should('contain', 'PARK_TOOLHEAD')
    })

    it('finds a macro by its initials and a file by its folder', () => {
        openPalette()
        search('lf')
        selectedRow().should('contain', 'LOAD_FILAMENT')
        search('functional')
        cy.contains(`${paletteDialog} .command-palette-row`, 'cable_clip.gcode').should('contain', 'functional/')
        search('zzzzzz')
        cy.contains(paletteDialog, 'No command matches "zzzzzz"')
    })

    it('sends the gcode of a preheat preset and of the cooldown', () => {
        openPalette()
        search('preheat pla{enter}')
        gcodeLog((scripts) => {
            expect(scripts).to.include('SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210')
            expect(scripts).to.include('SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60')
        })

        openPalette()
        search('cooldown{enter}')
        gcodeLog((scripts) => expect(scripts).to.include('TURN_OFF_HEATERS'))
    })

    it('opens the start print dialog for a file, and offers only what is valid while printing', () => {
        openPalette()
        search('benchy{enter}')
        paletteIsClosed()
        cy.contains('.v-dialog--active', 'Do you want to start benchy.gcode?')
        printerStatus((status) => expect(status).to.contain('print: standby'))

        // Cypress does not press buttons with Enter
        cy.focused().should('have.class', 'v-btn').and('contain', 'print').click()
        cy.get('.v-dialog--active').should('not.exist')
        cy.contains('.panel-toolbar', 'Printing')

        openPalette()
        search('home')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'Home all axes').should(
            'contain',
            'Not available while printing'
        )
        search('demo.gcode')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'demo.gcode').click()
        cy.contains('.v-dialog--active', 'Do you want to start').should('not.exist')
        search('preheat pla')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'Preheat PLA').should(
            'contain',
            'Not available while printing'
        )
        search('resume')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'Resume print').should(
            'contain',
            'No print is paused'
        )

        search('pause print{enter}')
        cy.contains('.panel-toolbar', 'Paused')

        openPalette()
        search('cancel{enter}')
        cy.contains(`${paletteDialog} .command-palette__confirm`, 'cannot be resumed')
        cy.focused().type('{esc}')
        input().should('be.focused').and('have.value', 'cancel')
        printerStatus((status) => expect(status).to.contain('print: paused'))

        input().type('{enter}')
        cy.focused().type('{enter}')
        paletteIsClosed()
        printerStatus((status) => expect(status).to.contain('print: cancelled'))
    })

    it('asks before an emergency stop, and offers the firmware restart afterwards', () => {
        openPalette()
        search('emergency{enter}')
        cy.contains(`${paletteDialog} .command-palette__confirm`, 'Klipper shuts down')
        noRawKeys(paletteDialog)
        cy.contains(`${paletteDialog} button`, 'Cancel').click()
        input().should('be.focused')
        printerStatus((status) => expect(status).to.contain('klipper: ready'))

        input().type('{enter}')
        cy.contains(`${paletteDialog} button`, 'Emergency stop').click()
        paletteIsClosed()
        printerStatus((status) => expect(status).to.contain('klipper: shutdown'))
        cy.contains('.v-main', 'Printer is shutdown')

        openPalette()
        search('load_filament')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'LOAD_FILAMENT').should(
            'contain',
            'Klipper is not ready'
        )
        search('emergency')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'Emergency stop').should(
            'contain',
            'already shut down'
        )

        search('firmware restart{enter}')
        cy.contains(`${paletteDialog} .command-palette__confirm`, 'firmware restart')
        cy.focused().type('{enter}')
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        printerStatus((status) => expect(status).to.contain('klipper: ready'))
    })

    it('keeps the keyboard working after a click inside the palette', () => {
        openPalette()
        search('purge')
        selectedRow().find('.command-palette-row__pin').click()
        input().should('be.focused')
        cy.get(`${paletteDialog} .command-palette__section`).first().click()
        input().should('be.focused')
        cy.get(`${paletteDialog} .command-palette__footer`).click()
        input().should('be.focused')
        search('pause print')
        cy.contains(`${paletteDialog} .command-palette-row--disabled`, 'Pause print').click()
        input().should('be.focused')

        search('consol{enter}')
        cy.location('pathname').should('equal', '/console')
    })

    it('does not run another command when the selected one disappears', () => {
        demo('print')
        cy.contains('.panel-toolbar', 'Printing')
        openPalette()
        selectedRow().should('contain', 'Pause print')

        demo('idle')
        cy.get(`${paletteDialog} .command-palette-row`).first().should('contain', 'Home all axes')
        selectedRow().should('not.exist')
        input().type('{enter}')
        cy.wait(300)
        cy.get(paletteDialog).should('exist')
        gcodeLog((scripts) => expect(scripts).not.to.include('G28'))

        input().type('{downarrow}')
        selectedRow().should('contain', 'Home all axes')
    })

    it('respects the hidden macros and the cooldown confirmation of the settings', () => {
        dispatch('gui/macros/saveSetting', { name: 'hiddenMacros', value: ['PURGE_LINE'] })
        dispatch('gui/saveSetting', { name: 'uiSettings.confirmOnCoolDown', value: true })

        openPalette()
        search('purge')
        cy.contains(paletteDialog, 'No command matches "purge"')

        search('cooldown{enter}')
        cy.contains(`${paletteDialog} .command-palette__confirm`, 'All heaters are switched off')
        cy.wait(300)
        gcodeLog((scripts) => expect(scripts).not.to.include('TURN_OFF_HEATERS'))
        cy.focused().type('{enter}')
        gcodeLog((scripts) => expect(scripts).to.include('TURN_OFF_HEATERS'))
    })

    it('opens a tab of the settings dialog', () => {
        openPalette()
        search('settings webcams{enter}')

        paletteIsClosed()
        cy.contains('.v-dialog--active .v-tab--active', /webcams/i)
    })

    it('pins favourites to the top, keeps them after a reload, and unpins them in the settings', () => {
        openPalette()
        search('purge')
        selectedRow().find('.command-palette-row__pin').click()
        search('{selectall}{backspace}')
        sectionTitles((titles) => expect(titles[0]).to.equal('favourites'))
        selectedRow().should('contain', 'PURGE_LINE')

        cy.reload()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        openPalette()
        sectionTitles((titles) => expect(titles[0]).to.equal('favourites'))
        input().type('{esc}')

        openPaletteSettings()
        noRawKeys('.v-dialog--active')
        cy.contains('.v-dialog--active .command-palette-favourite', 'PURGE_LINE')
        cy.get('.command-palette-add-favourite input[type=text]').type('lights_on')
        cy.contains('.menuable__content__active .v-list-item', 'LIGHTS_ON').click()
        cy.get('.v-dialog--active .command-palette-favourite').should(($rows) =>
            expect($rows.toArray().map((row) => row.innerText.split('\n')[0].trim())).to.deep.equal([
                'PURGE_LINE',
                'LIGHTS_ON',
            ])
        )

        cy.contains('.v-dialog--active .command-palette-favourite', 'PURGE_LINE').find('button').click()
        cy.contains('.v-dialog--active .command-palette-favourite', 'PURGE_LINE').should('not.exist')
        closeSettings()

        openPalette()
        sectionTitles((titles) => expect(titles[0]).to.equal('favourites'))
        selectedRow().should('contain', 'LIGHTS_ON')
        cy.contains(`${paletteDialog} .command-palette-row`, 'PURGE_LINE').should('not.exist')
    })

    it('pins the selected command with the keyboard', () => {
        openPalette()
        search('clean')
        selectedRow().should('contain', 'CLEAN_NOZZLE')
        input().type('{alt}p')
        selectedRow().find('.command-palette-row__pin--active').should('exist')
        input().type('{alt}p')
        selectedRow().find('.command-palette-row__pin--active').should('not.exist')
    })

    it('lets the shortcut be changed and reset', () => {
        openPaletteSettings()
        cy.get('.command-palette-shortcut').should('contain', modLabel).and('contain', 'K').click()
        cy.contains('.v-dialog--active', 'Press the new key combination')

        cy.get('body').type('j')
        cy.get('.command-palette-shortcut-error').should('contain', 'together with another key')
        cy.get('body').type(`${mod}s`)
        cy.get('.command-palette-shortcut-error').should('contain', 'used by the browser or by Mainsail')

        cy.get('body').type(`${mod}{shift}p`)
        cy.get('.command-palette-shortcut-error').should('not.exist')
        cy.get('.command-palette-shortcut').should('contain', 'P').and('not.contain', 'K')
        cy.contains('.v-dialog--active', 'Enable the command palette')
        paletteIsClosed()
        closeSettings()

        cy.get('.command-palette-trigger').should('contain', 'P').and('not.contain', 'K')
        cy.get('body').type(`${mod}k`)
        paletteIsClosed()
        cy.get('body').type(`${mod}{shift}p`)
        input().should('be.focused')
        input().type('{esc}')

        cy.reload()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('body').type(`${mod}{shift}p`)
        search('settings commands{enter}')
        cy.contains('.v-dialog--active button', 'Reset').click()
        cy.get('.command-palette-shortcut').should('contain', 'K')
        closeSettings()
        openPalette()
    })

    it('keeps the current shortcut when recording is cancelled with Esc', () => {
        openPaletteSettings()
        cy.get('.command-palette-shortcut').click()
        cy.get('body').type('{esc}')

        cy.get('.command-palette-shortcut').should('contain', 'K')
        cy.contains('.v-dialog--active', 'Enable the command palette')
    })

    it('can be turned off and on again', () => {
        openPaletteSettings()
        cy.get('.command-palette-enable .v-input--selection-controls__ripple').click()
        closeSettings()

        cy.get('.command-palette-trigger').should('not.exist')
        cy.get('body').type(`${mod}k`)
        paletteIsClosed()

        cy.get('.v-app-bar button').eq(-2).click()
        cy.contains('.v-dialog--active .v-tab', /^\s*Commands\s*$/i).click()
        cy.get('.command-palette-enable .v-input--selection-controls__ripple').click()
        closeSettings()

        cy.get('.command-palette-trigger').should('exist')
        openPalette()
    })

    it('leaves the shortcut to the search of the code editor', () => {
        cy.visit('/config')
        cy.contains('.v-main td', 'printer.cfg', { timeout: 15000 }).click()
        // the file is longer than the window, so the center of the editor is not in view
        cy.get('.cm-content', { timeout: 15000 }).should('contain', 'kinematics').type(`${mod}f`, { force: true })
        cy.get('.cm-search input[name=search]').type(`stepper${mod}k`)
        cy.wait(300)
        paletteIsClosed()
        cy.get('.cm-search input[name=search]').should('be.focused')

        cy.get('.cm-content').type(`${mod}k`, { force: true })
        input().should('be.focused')
    })

    it('does not open while typing the shortcut key without the modifier', () => {
        cy.get('.v-main textarea').first().type('k')
        cy.get('.v-main textarea').first().should('have.value', 'k')
        paletteIsClosed()
    })
})
