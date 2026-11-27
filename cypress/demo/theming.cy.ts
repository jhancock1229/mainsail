import { openDashboard, openDashboardSettings } from './support'

const dialog = '.v-dialog--active'
const themeAttributes = [
    'data-theme-radius',
    'data-theme-density',
    'data-theme-surface',
    'data-theme-tint',
    'data-theme-font',
]

const openAppearance = () => {
    openDashboardSettings()
    cy.contains(`${dialog} .v-tab, ${dialog} .v-list-item`, /^\s*Appearance\s*$/i).click()
    cy.contains(dialog, 'Themes')
}
const closeSettings = () => {
    cy.get('.settings-menu-dialog .panel-toolbar button').last().click()
    cy.get(dialog).should('not.exist')
}
const preset = (id: string) => cy.get(`${dialog} .theme-preset-card[data-preset="${id}"]`)
const currentTheme = () => cy.get(`${dialog} .appearance-current-theme`)
const resetButton = (token: string) => cy.get(`${dialog} .appearance-reset[data-token="${token}"]`)
const select = (selector: string, option: string) => {
    cy.get(`${dialog} ${selector}`).click()
    cy.contains('.menuable__content__active .v-list-item', option).click()
}
const stockLook = () =>
    cy.get('html').should(($html) => {
        themeAttributes.forEach((name) => expect($html.attr(name), name).to.equal(undefined))
    })
const dashboardPanel = () => cy.get('.v-main .v-card.panel').first()
const importFile = (contents: string, fileName = 'theme.json') =>
    cy
        .get(`${dialog} .appearance-import-input`)
        .selectFile(
            { contents: Cypress.Buffer.from(contents), fileName, mimeType: 'application/json' },
            { force: true }
        )
const sparklineColor = (objectName: string) =>
    cy.get(`.temperature-card[data-object="${objectName}"] .temperature-sparkline__line`).invoke('attr', 'stroke')

const emberFile = {
    format: 'mainsail-theme',
    version: 1,
    interface: 'classic',
    name: 'Ember',
    tokens: {
        accent: '#e2622a',
        radius: 14,
        density: 'comfortable',
        surface: 'elevated',
        tint: 'accent',
        font: 'humanist',
        chartPalette: 'vivid',
    },
}

describe('Theming system', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('leaves the stock look alone until a theme is chosen', () => {
        stockLook()
        dashboardPanel().should('have.css', 'border-radius', '4px')
        cy.get('.v-main .panel-toolbar').first().should('have.css', 'height', '48px')
        sparklineColor('heater_bed').should('equal', '#2196F3')

        openAppearance()
        currentTheme().should('contain', 'Mainsail Classic')
        preset('classic').should('have.attr', 'aria-pressed', 'true')
        cy.get(`${dialog} .theme-preset-card`).should('have.length.at.least', 5)
        cy.get(`${dialog} .appearance-reset`).should('not.exist')
        cy.get(`${dialog} .appearance-reset-all`).should('be.disabled')
        cy.get(dialog)
            .invoke('text')
            .should('not.match', /AppearanceTab|Settings\./)
    })

    it('applies a preset with one click, in dark and light mode, and remembers it', () => {
        openAppearance()
        preset('ember').click()

        currentTheme().should('contain', 'Ember')
        preset('ember').should('have.attr', 'aria-pressed', 'true')
        cy.get('html')
            .should('have.attr', 'data-theme-radius', '14')
            .and('have.attr', 'data-theme-surface', 'elevated')
            .and('have.attr', 'data-theme-tint', 'accent')
            .and('have.attr', 'data-theme-font', 'humanist')
        dashboardPanel().should('have.css', 'border-radius', '14px')
        cy.get('.v-application')
            .should('have.css', 'font-family')
            .and('match', /^Seravek/)
        cy.get(`${dialog} .appearance-reset-all`).should('have.css', 'color', 'rgb(226, 98, 42)')
        sparklineColor('heater_bed').should('equal', '#38bdf8')
        closeSettings()

        cy.get('.v-application').should('have.class', 'theme--dark')
        cy.get('.v-application').should('not.have.css', 'background-color', 'rgb(18, 18, 18)')
        cy.get('.mode-toggle-button').click()
        cy.get('.v-application').should('have.class', 'theme--light')
        cy.get('html').should('have.attr', 'data-theme-surface', 'elevated')
        sparklineColor('heater_bed').should('equal', '#0369a1')
        dashboardPanel().should('have.css', 'background-color', 'rgb(255, 255, 255)')

        cy.reload()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get('html').should('have.attr', 'data-theme-radius', '14')
        dashboardPanel().should('have.css', 'border-radius', '14px')
    })

    it('updates the interface while single tokens are edited and resets each of them', () => {
        openAppearance()

        cy.get(`${dialog} .appearance-radius .v-slider__thumb-container`)
            .focus()
            .type('{rightarrow}{rightarrow}{rightarrow}', { force: true })
        cy.get('html').should('have.attr', 'data-theme-radius', '7')
        dashboardPanel().should('have.css', 'border-radius', '7px')
        currentTheme().should('contain', 'Custom')
        resetButton('radius').click()
        dashboardPanel().should('have.css', 'border-radius', '4px')
        currentTheme().should('contain', 'Mainsail Classic')

        cy.contains(`${dialog} .appearance-density .v-btn`, 'Compact').click()
        cy.get('html').should('have.attr', 'data-theme-density', 'compact')
        cy.get('.v-main .panel-toolbar').first().should('have.css', 'height', '40px')
        resetButton('density').click()
        cy.get('.v-main .panel-toolbar').first().should('have.css', 'height', '48px')

        select('.appearance-surface', 'Outlined')
        dashboardPanel().should('have.css', 'box-shadow', 'none').and('have.css', 'border-top-width', '1px')
        resetButton('surface').click()
        dashboardPanel().should('have.css', 'border-top-width', '0px')

        cy.contains(`${dialog} .appearance-tint .v-btn`, 'Tinted').click()
        cy.get('html').should('have.attr', 'data-theme-tint', 'accent')
        cy.get('.v-application').should('not.have.css', 'background-color', 'rgb(18, 18, 18)')
        resetButton('tint').click()
        cy.get('.v-application').should('have.css', 'background-color', 'rgb(18, 18, 18)')

        cy.get(`${dialog} .appearance-font`).click()
        cy.get('.menuable__content__active .v-list-item').should('have.length', 5)
        cy.get('.menuable__content__active').should('contain', 'Manrope').and('not.contain', 'Monospace')
        cy.get('body').type('{esc}')
        select('.appearance-font', 'Manrope')
        cy.get('.v-application')
            .should('have.css', 'font-family')
            .and('match', /^.?Manrope/)
        resetButton('font').click()
        cy.get('.v-application')
            .should('have.css', 'font-family')
            .and('match', /^Roboto, /)

        select('.appearance-chart-palette', 'Color-blind friendly')
        sparklineColor('extruder').should('equal', '#d55e00')
        sparklineColor('heater_bed').should('equal', '#56b4e9')
        resetButton('chartPalette').click()
        sparklineColor('heater_bed').should('equal', '#2196F3')

        stockLook()
    })

    it('changes the accent colour everywhere and warns about an unreadable one', () => {
        openAppearance()
        cy.get(`${dialog} .appearance-contrast-warning`).should('not.exist')

        cy.get(`${dialog} .appearance-accent`).click()
        cy.get('.appearance-accent-picker .v-color-picker__input input').first().clear().type('#151515{enter}').blur()
        cy.get(`${dialog} .appearance-contrast-warning`).should('contain', 'hard to see in dark mode')
        cy.get(`${dialog} .appearance-reset-all`).should('have.css', 'color', 'rgb(21, 21, 21)')
        currentTheme().should('contain', 'Custom')

        cy.get('body').type('{esc}')
        resetButton('accent').click()
        cy.get(`${dialog} .appearance-contrast-warning`).should('not.exist')
        currentTheme().should('contain', 'Mainsail Classic')
    })

    it('exports the theme to a file that can be imported again', () => {
        openAppearance()
        preset('ember').click()
        cy.get(`${dialog} .appearance-export`).click()
        cy.readFile('cypress/downloads/mainsail-theme.json').should('deep.equal', emberFile)

        cy.get(`${dialog} .appearance-reset-all`).click()
        stockLook()
        currentTheme().should('contain', 'Mainsail Classic')

        importFile(JSON.stringify(emberFile))
        cy.get(`${dialog} .appearance-import-message`).should('contain', 'Theme "Ember" imported.')
        currentTheme().should('contain', 'Ember')
        dashboardPanel().should('have.css', 'border-radius', '14px')
    })

    it('rejects theme files with unknown or invalid content and changes nothing', () => {
        openAppearance()

        importFile(JSON.stringify({ ...emberFile, css: 'body { display: none }' }))
        cy.get(`${dialog} .appearance-import-message`)
            .should('contain', 'was not imported')
            .and('contain', 'unknown setting "css"')
        stockLook()

        importFile(JSON.stringify({ ...emberFile, tokens: { ...emberFile.tokens, font: 'x; } body { display: none' } }))
        cy.get(`${dialog} .appearance-import-message`)
            .should('contain', 'not a valid value for "font"')
            .invoke('text')
            .should('not.match', /AppearanceTab|ImportErrors/)
        stockLook()

        importFile(JSON.stringify({ ...emberFile, interface: 'new', tokens: { accent: '#e2622a', tone: 'ink' } }))
        cy.get(`${dialog} .appearance-import-message`).should('contain', 'made for the other interface')
        stockLook()

        importFile('.panel { display: none }', 'custom.css')
        cy.get(`${dialog} .appearance-import-message`).should('contain', 'not a JSON file')
        stockLook()
        currentTheme().should('contain', 'Mainsail Classic')
        cy.get('body').should('be.visible')
    })

    it('keeps the primary colour setting of the UI settings in sync with the accent', () => {
        openAppearance()
        preset('orchid').click()
        cy.contains(`${dialog} .v-tab, ${dialog} .v-list-item`, /^\s*UI-Settings\s*$/i).click()
        cy.contains(`${dialog} .settings-row-title`, 'Primary')
            .parents('.row')
            .eq(1)
            .find('.v-btn.px-5')
            .should('have.css', 'background-color', 'rgb(139, 92, 246)')
    })
})
