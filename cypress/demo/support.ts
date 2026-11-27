// Chrome reports this harmless layout notice as an error
Cypress.on('uncaught:exception', (error) => !error.message.includes('ResizeObserver loop'))

const demoRequest = (command: string) => cy.request(`${Cypress.env('demoUrl')}/${command}`)

export const demo = (command: string) => {
    const request = demoRequest(command)

    return command === 'reset' ? demoRequest('classic') : request
}

// Stubbed after the page has loaded: a page served by the service worker does not run Cypress' before-load hooks.
// The app looks at the screen again on every resize.
export const useTouchScreen = () => {
    cy.window().then((win) => {
        Object.defineProperty(win.navigator, 'maxTouchPoints', { value: 5, configurable: true })
        win.dispatchEvent(new Event('resize'))
    })
}

export const openShell = (path = '/', seed: string[] = []) => {
    demoRequest('reset')
    seed.forEach((command) => demoRequest(command))
    cy.visit(path)
    cy.get('.shell .shell-rail', { timeout: 15000 })
}

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
