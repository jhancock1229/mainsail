import { openShell } from './support'

const rawKey = /\b(Shell|Settings|AppearanceTab|ImportErrors)\.[A-Z]\w*/
const tab = '.appearance-tab'
const overridable = ['--shell-bg', '--shell-accent', '--shell-radius', '--shell-font', '--shell-pad-x']

const preset = (id: string) => cy.get(`${tab} .theme-preset-card[data-preset="${id}"]`)
const currentTheme = () => cy.get(`${tab} .appearance-current-theme`)
const resetButton = (token: string) => cy.get(`${tab} .appearance-reset[data-token="${token}"]`)
const select = (selector: string, option: string) => {
    cy.get(`${tab} ${selector}`).click()
    cy.contains('.menuable__content__active .v-list-item', option).click()
}
const inlineVariable = (name: string, check: (value: string) => void) =>
    cy.document().should((doc) => check(doc.documentElement.style.getPropertyValue(name).trim()))
const shellVariable = (name: string, check: (value: string) => void) =>
    cy.document().should((doc) => check(getComputedStyle(doc.documentElement).getPropertyValue(name).trim()))
const isColorOtherThan = (other: string) => (value: string) => {
    expect(value).to.match(/^#[0-9a-f]{6}$/)
    expect(value).not.to.equal(other)
}
const approvedLook = () =>
    cy.document().should((doc) => {
        overridable.forEach((name) => expect(doc.documentElement.style.getPropertyValue(name), name).to.equal(''))
    })
const importFile = (contents: string, fileName = 'theme.json') =>
    cy
        .get(`${tab} .appearance-import-input`)
        .selectFile(
            { contents: Cypress.Buffer.from(contents), fileName, mimeType: 'application/json' },
            { force: true }
        )
const store = () =>
    cy.get('#app').then(($app) => {
        const app = $app[0] as unknown as {
            __vue__: {
                $store: {
                    dispatch: (name: string, value: unknown) => void
                    getters: Record<string, (name: string) => string>
                }
            }
        }

        return app.__vue__.$store
    })
const pageDoesNotScroll = (tabListFits: boolean) =>
    cy.window().should((win) => {
        const doc = win.document
        const tabs = doc.querySelector('.shell-settings__tabs') as HTMLElement

        expect(doc.documentElement.scrollHeight, 'document height').to.be.at.most(win.innerHeight)
        expect(doc.documentElement.scrollWidth, 'document width').to.be.at.most(win.innerWidth)
        if (tabListFits) expect(tabs.scrollHeight, 'settings tab list').to.be.at.most(tabs.clientHeight + 1)
    })

const inkFile = {
    format: 'mainsail-theme',
    version: 1,
    interface: 'new',
    name: 'Ink',
    tokens: {
        accent: '#8ea2ff',
        radius: 10,
        density: 'comfortable',
        font: 'manrope',
        chartPalette: 'soft',
        tone: 'ink',
    },
}

describe('Theming of the new interface', () => {
    beforeEach(() => {
        cy.viewport(1440, 900)
        openShell('/settings/appearance')
        cy.contains(tab, 'Themes')
    })

    it('shows the approved look until a theme is chosen', () => {
        approvedLook()
        shellVariable('--shell-bg', (value) => expect(value).to.equal('#232832'))
        shellVariable('--shell-accent', (value) => expect(value).to.equal('#5cc8ff'))
        shellVariable('--shell-radius', (value) => expect(value).to.equal('8px'))
        cy.get('.shell')
            .should('have.css', 'font-family')
            .and('match', /^.?Manrope/)
        cy.get('body').should('have.css', 'background-color', 'rgb(35, 40, 50)')

        currentTheme().should('contain', 'Slate')
        preset('slate').should('have.attr', 'aria-pressed', 'true')
        cy.get(`${tab} .theme-preset-card`).should('have.length.within', 4, 6)
        cy.get(`${tab} .appearance-reset`).should('not.exist')
        cy.get(`${tab} .appearance-surface, ${tab} .appearance-tint`).should('not.exist')
        cy.get('.shell').should(($shell) => expect($shell.text()).not.to.match(rawKey))
    })

    it('fits the settings page without scrolling it, at the smallest supported size too', () => {
        pageDoesNotScroll(true)
        cy.get(`${tab} .appearance-reset-all`).should(($button) => {
            expect($button[0].getBoundingClientRect().bottom).to.be.at.most(900)
        })

        cy.viewport(1280, 720)
        pageDoesNotScroll(true)

        cy.viewport(960, 600)
        pageDoesNotScroll(false)
        cy.get(`${tab} .appearance-reset-all`).scrollIntoView().should('be.visible')
    })

    it('is reached in three clicks from any page', () => {
        cy.get('.shell-rail [data-page="home"]').click()
        cy.get('.shell-header__title').should('contain', 'Ready to print')

        cy.get('.shell-rail [data-page="settings"]').click()
        cy.get('.shell-settings__tabs [data-tab="appearance"]').click()
        preset('pine').click()

        currentTheme().should('contain', 'Pine')
    })

    it('applies a preset with one click, in dark and light mode, and remembers it', () => {
        preset('ink').click()

        currentTheme().should('contain', 'Ink')
        inlineVariable('--shell-bg', isColorOtherThan('#232832'))
        inlineVariable('--shell-radius', (value) => expect(value).to.equal('10px'))
        inlineVariable('--shell-accent', (value) => expect(value).to.equal('#8ea2ff'))
        cy.get('body').should('not.have.css', 'background-color', 'rgb(35, 40, 50)')
        cy.get('.shell-settings__tab[aria-selected="true"]').should('have.css', 'border-radius', '10px')
        store().should(($store) => {
            expect($store.getters['printer/tempHistory/getDatasetColor']('heater_bed')).to.equal('#9cc9e8')
        })

        cy.get('.mode-toggle-button').click()
        cy.get('html').should('have.class', 'theme--light')
        inlineVariable('--shell-text', (value) => expect(value).to.match(/^#[0-3]/))
        inlineVariable('--shell-accent', isColorOtherThan('#8ea2ff'))
        store().should(($store) => {
            expect($store.getters['printer/tempHistory/getDatasetColor']('heater_bed')).to.equal('#4a7fa5')
        })

        cy.reload()
        cy.get('.shell .shell-rail', { timeout: 15000 })
        currentTheme().should('contain', 'Ink')
        inlineVariable('--shell-radius', (value) => expect(value).to.equal('10px'))
    })

    it('updates the interface while single tokens are edited and resets each of them', () => {
        cy.get(`${tab} .appearance-radius .v-slider__thumb-container`)
            .focus()
            .type('{rightarrow}{rightarrow}', { force: true })
        inlineVariable('--shell-radius', (value) => expect(value).to.equal('10px'))
        cy.get('.shell-settings__tab[aria-selected="true"]').should('have.css', 'border-radius', '10px')
        currentTheme().should('contain', 'Custom')
        resetButton('radius').click()
        cy.get('.shell-settings__tab[aria-selected="true"]').should('have.css', 'border-radius', '8px')

        cy.contains(`${tab} .appearance-density .v-btn`, 'Compact').click()
        inlineVariable('--shell-pad-x', (value) => expect(value).to.equal('20px'))
        cy.get('.shell-header').should('have.css', 'padding-left', '20px')
        resetButton('density').click()
        cy.get('.shell-header').should('have.css', 'padding-left', '28px')

        select('.appearance-tone', 'Plum')
        cy.get('body').should('not.have.css', 'background-color', 'rgb(35, 40, 50)')
        resetButton('tone').click()
        cy.get('body').should('have.css', 'background-color', 'rgb(35, 40, 50)')

        cy.get(`${tab} .appearance-font`).click()
        cy.get('.menuable__content__active').should('contain', 'Manrope').and('not.contain', 'Monospace')
        cy.contains('.menuable__content__active .v-list-item', 'Roboto').click()
        cy.get('.shell')
            .should('have.css', 'font-family')
            .and('match', /^Roboto/)
        resetButton('font').click()
        cy.get('.shell')
            .should('have.css', 'font-family')
            .and('match', /^.?Manrope/)

        select('.appearance-chart-palette', 'Vivid')
        store().should(($store) => {
            expect($store.getters['printer/tempHistory/getDatasetColor']('heater_bed')).to.equal('#38bdf8')
        })
        resetButton('chartPalette').click()

        approvedLook()
        currentTheme().should('contain', 'Slate')
    })

    it('uses the accent colour of the user and keeps it readable', () => {
        cy.get(`${tab} .appearance-contrast-warning`).should('not.exist')

        cy.get(`${tab} .appearance-accent`).click()
        cy.get('.appearance-accent-picker .v-color-picker__input input').first().clear().type('#0a3d91{enter}').blur()
        cy.get(`${tab} .appearance-contrast-warning`).should('contain', 'a little lighter in dark mode')
        inlineVariable('--shell-accent', isColorOtherThan('#0a3d91'))
        cy.get('body').type('{esc}')
        cy.wait(700)

        cy.visit('/tune/move')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        inlineVariable('--shell-accent', isColorOtherThan('#0a3d91'))

        cy.visit('/settings/appearance')
        resetButton('accent').click()
        approvedLook()
    })

    it('does not let the theme of the classic interface leak into the new one', () => {
        store().then(($store) =>
            $store.dispatch('gui/saveSetting', {
                name: 'uiSettings.tokens',
                value: { radius: 0, density: 'compact', surface: 'outlined', tint: 'accent', font: 'rounded' },
            })
        )

        cy.get('html').should(($html) => {
            ;['radius', 'density', 'surface', 'tint', 'font'].forEach((name) =>
                expect($html.attr(`data-theme-${name}`), name).to.equal(undefined)
            )
        })
        approvedLook()
    })

    it('exports the theme to a file that can be imported again', () => {
        preset('ink').click()
        cy.get(`${tab} .appearance-export`).click()
        cy.readFile('cypress/downloads/mainsail-theme.json').should('deep.equal', inkFile)

        cy.get(`${tab} .appearance-reset-all`).click()
        approvedLook()

        importFile(JSON.stringify(inkFile))
        cy.get(`${tab} .appearance-import-message`).should('contain', 'Theme "Ink" imported.')
        currentTheme().should('contain', 'Ink')
    })

    it('rejects theme files with unknown, invalid or classic content and changes nothing', () => {
        importFile(JSON.stringify({ ...inkFile, css: 'body { display: none }' }))
        cy.get(`${tab} .appearance-import-message`).should('contain', 'unknown setting "css"')
        approvedLook()

        importFile(JSON.stringify({ ...inkFile, tokens: { ...inkFile.tokens, font: 'mono' } }))
        cy.get(`${tab} .appearance-import-message`).should('contain', 'not a valid value for "font"')
        approvedLook()

        importFile(JSON.stringify({ ...inkFile, tokens: { ...inkFile.tokens, tone: '#000000' } }))
        cy.get(`${tab} .appearance-import-message`).should('contain', 'not a valid value for "tone"')
        approvedLook()

        importFile(JSON.stringify({ format: 'mainsail-theme', version: 1, tokens: { radius: 0, surface: 'flat' } }))
        cy.get(`${tab} .appearance-import-message`)
            .should('contain', 'made for the other interface')
            .invoke('text')
            .should('not.match', rawKey)
        approvedLook()
        currentTheme().should('contain', 'Slate')
    })
})
