import { openDashboard, openDashboardSettings } from './support'

const openUiSettings = () => {
    openDashboardSettings()
    cy.contains('.v-dialog--active .v-tab, .v-dialog--active .v-list-item', /^\s*UI-Settings\s*$/i).click()
}

describe('Light and dark mode toggle', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('switches between dark and light with one click in the top bar', () => {
        cy.get('.v-application').should('have.class', 'theme--dark')

        cy.get('.mode-toggle-button').click()
        cy.get('.v-application').should('have.class', 'theme--light')
        cy.get('html').should('have.class', 'theme--light')

        cy.get('.mode-toggle-button').click()
        cy.get('.v-application').should('have.class', 'theme--dark')
    })

    it('remembers the chosen mode after a reload', () => {
        cy.get('.mode-toggle-button').click()
        cy.get('.v-application').should('have.class', 'theme--light')

        cy.reload()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('.v-application').should('have.class', 'theme--light')
    })

    it('says what a click will do', () => {
        cy.get('.mode-toggle-button').should('have.attr', 'aria-label', 'Switch to light mode')
        cy.get('.mode-toggle-button').click()
        cy.get('.mode-toggle-button').should('have.attr', 'aria-label', 'Switch to dark mode')
    })

    it('offers an auto mode that follows the system', () => {
        openUiSettings()
        cy.contains('.v-dialog--active .v-input', 'Dark').click()
        cy.contains('.v-menu__content .v-list-item', 'Auto (follow system)').click()

        // the test browser reports its own preference; the app has to match it
        cy.window().then((win) => {
            const systemDark = win.matchMedia('(prefers-color-scheme: dark)').matches
            cy.get('.v-application').should('have.class', systemDark ? 'theme--dark' : 'theme--light')
        })
    })

    it('can be removed from the top bar in the settings', () => {
        openUiSettings()
        cy.contains('.v-dialog--active', 'Light/dark toggle in the top bar')
        cy.get('.v-dialog--active')
            .invoke('text')
            .should('not.match', /Settings\.UiSettingsTab\./i)
        cy.get('.v-dialog--active .show-mode-toggle-switch').click()

        cy.get('.mode-toggle-button').should('not.exist')
    })
})
