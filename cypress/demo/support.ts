// helpers for the browser tests against the simulated printer (demo/mock-moonraker.mjs)

// Chrome reports this harmless layout notice as an error when panels appear or disappear
Cypress.on('uncaught:exception', (error) => !error.message.includes('ResizeObserver loop'))

export const demo = (command: string) => cy.request(`${Cypress.env('demoUrl')}/${command}`)

// checks the titles of the dashboard panels in one column, top to bottom (retried until it passes)
export const columnPanels = (column: number, check: (titles: string[]) => void) =>
    cy
        .get('.v-main .row')
        .first()
        .children()
        .eq(column - 1)
        .find('.panel .panel-toolbar .subheading')
        .should(($titles) => check($titles.toArray().map((title) => title.innerText.trim())))

export const openDashboard = () => {
    demo('reset')
    cy.visit('/')
    cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
}

export const openDashboardSettings = () => {
    cy.get('.v-app-bar button').eq(-2).click()
    cy.contains('.v-dialog--active .v-tab, .v-dialog--active .v-list-item', /^\s*Dashboard\s*$/i).click()
}
