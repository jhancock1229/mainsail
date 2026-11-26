import { demo, openDashboard } from './support'

const EXTRUDER = 'extruder'
const BED = 'heater_bed'
const FAN = 'temperature_fan electronics'
const CHAMBER = 'temperature_sensor chamber'
const MCU = 'temperature_sensor mcu_temp'

const card = (objectName: string) => cy.get(`.temperature-card[data-object="${objectName}"]`)
const cardState = (objectName: string) => card(objectName).find('.temperature-card__state')
const preset = (objectName: string, label: string) =>
    card(objectName).contains('.temperature-card__presets .v-chip', label)

// checks which cards are shown, in their order on the page (retried until it passes)
const cardOrder = (check: (objectNames: string[]) => void) =>
    cy
        .get('.temperature-panel')
        .should(($panel) => check([...$panel.find('.temperature-card')].map((el) => el.dataset.object ?? '')))

const menu = () => cy.get('.menuable__content__active')
const openSettings = () => {
    cy.get('.temperature-panel .panel-toolbar button.v-btn--icon').first().click()
    menu().should('contain', 'View')
}
const closeSettings = () => {
    cy.get('.temperature-panel .panel-toolbar .subheading').click()
    cy.get('.menuable__content__active').should('not.exist')
}
const cardOption = (name: string) => menu().contains('.temperature-settings-cards__card', name)
const toggleCheckbox = (label: string) =>
    menu().contains('.v-list-item', label).find('.v-input--selection-controls__ripple').click()
const noRawKeys = (subject: Cypress.Chainable<JQuery<HTMLElement>>) =>
    subject.invoke('text').should('not.match', /Panels\.TemperaturePanel/)

describe('Temperature cards', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('shows a card for every heater and sensor with temperature, state and history', () => {
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([EXTRUDER, BED, FAN, CHAMBER, MCU]))
        cy.get('.temperature-panel-table').should('not.exist')

        card(EXTRUDER).should('contain', 'Extruder')
        card(EXTRUDER)
            .find('.temperature-card__temperature')
            .invoke('text')
            .should('match', /^\s*\d+\s*\.\d\s*°C\s*$/)
        cardState(EXTRUDER).should('have.attr', 'data-state', 'off').and('contain', 'Off')
        cardState(FAN).should('contain', 'In range')
        cardState(CHAMBER).should('have.attr', 'data-state', 'sensor')
        card(CHAMBER).should('contain', 'min').and('contain', 'max')
        card(CHAMBER).find('.temperature-card__target').should('not.exist')
        card(CHAMBER).find('.temperature-card__presets').should('not.exist')

        // the mock serves the temperature history, so every sparkline has a line right away
        cy.get('.temperature-card .temperature-sparkline__line').should(($lines) => {
            expect($lines).to.have.length(5)
            $lines.each((_, line) => expect(line.getAttribute('d')).to.match(/^M[\d.]+,[\d.]+ L/))
        })
        card(EXTRUDER).should('contain', '5 min')
        noRawKeys(cy.get('.temperature-panel'))
    })

    it('sets a target with one tap on a preset and switches the heater off again', () => {
        // the presets of the user plus off
        card(EXTRUDER)
            .find('.temperature-card__presets .v-chip')
            .should(($chips) =>
                expect($chips.toArray().map((chip) => chip.innerText.trim())).to.deep.equal([
                    '250°',
                    '240°',
                    '210°',
                    'Off',
                ])
            )

        preset(EXTRUDER, '210°').click()
        cardState(EXTRUDER).should('have.attr', 'data-state', 'heating').and('contain', 'Heating')
        card(EXTRUDER).find('.temperature-card__target input').should('have.value', '210')
        card(EXTRUDER).should('contain', 'below target')
        card(EXTRUDER).find('.temperature-sparkline__target').should('exist')
        card(EXTRUDER).find('.temperature-card__power > div').should('have.attr', 'style').and('include', '100%')
        cardState(BED).should('have.attr', 'data-state', 'off')

        // hot and without a target reads as cooling, not as off
        card(EXTRUDER)
            .find('.temperature-card__temperature')
            .should(($temperature) => expect(parseFloat($temperature.text().replace(/\s/g, ''))).to.be.above(45))
        preset(EXTRUDER, 'Off').click()
        cardState(EXTRUDER).should('have.attr', 'data-state', 'cooling').and('contain', 'Cooling')
        card(EXTRUDER).find('.temperature-card__target input').should('have.value', '0')
    })

    it('keeps the target editable', () => {
        card(BED).find('.temperature-card__target input').clear()
        card(BED).find('.temperature-card__target input').type('60{enter}')
        cardState(BED).should('have.attr', 'data-state', 'heating')
        card(BED).should('contain', 'below target')

        card(FAN).find('.temperature-card__target input').clear()
        card(FAN).find('.temperature-card__target input').type('25{enter}')
        cardState(FAN).should('have.attr', 'data-state', 'cooling')
        card(FAN).should('contain', 'above target')
    })

    it('locks the presets while printing, like the table does', () => {
        demo('print')
        cy.contains('.panel-toolbar', 'Printing')

        preset(EXTRUDER, '250°').should('have.class', 'v-chip--disabled')
        card(EXTRUDER).find('.temperature-card__target input').should('not.be.disabled').and('have.value', '210')
        cardState(EXTRUDER).should('have.attr', 'data-state', 'heating')
    })

    it('opens the full chart on demand and remembers it', () => {
        cy.get('.temperature-panel .echarts').should('not.exist')
        cy.get('.temperature-panel__chart-toggle').should('have.attr', 'aria-expanded', 'false').click()
        cy.get('.temperature-panel .echarts').should('be.visible')

        cy.reload()
        cy.get('.temperature-panel .echarts', { timeout: 15000 }).should('be.visible')
        cy.get('.temperature-panel__chart-toggle').should('have.attr', 'aria-expanded', 'true').click()
        cy.get('.temperature-panel .echarts').should('not.exist')

        // the existing option still removes the chart completely
        openSettings()
        toggleCheckbox('Show Chart')
        cy.get('.temperature-panel__chart-toggle').should('not.exist')
    })

    it('switches between cards and table in the settings of the panel and remembers the choice', () => {
        openSettings()
        noRawKeys(menu())
        menu().contains('button', 'Table').click()
        cy.get('.temperature-panel-table').should('contain', 'Extruder').and('contain', 'Chamber')
        cy.get('.temperature-card').should('not.exist')
        cy.get('.temperature-panel .echarts').should('be.visible')
        // the options of the cards are only offered for the cards
        menu().find('.temperature-settings-cards__card').should('not.exist')

        cy.reload()
        cy.get('.temperature-panel-table', { timeout: 15000 }).should('contain', 'Extruder')
        cy.get('.temperature-card').should('not.exist')

        openSettings()
        menu().contains('button', 'Cards').click()
        card(EXTRUDER).should('be.visible')
        cy.get('.temperature-panel-table').should('not.exist')
    })

    it('hides and reorders single cards and resets them', () => {
        openSettings()
        cardOption('Mcu Temp').find('.v-input--selection-controls__ripple').click()
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([EXTRUDER, BED, FAN, CHAMBER]))

        cardOption('Chamber').find('button[title="Move up"]').click()
        cardOption('Chamber').find('button[title="Move up"]').click()
        cardOption('Extruder').find('button[title="Move down"]').click()
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([CHAMBER, EXTRUDER, BED, FAN]))
        cardOption('Chamber').find('button[title="Move up"]').should('be.disabled')

        cy.reload()
        cy.get('.temperature-card', { timeout: 15000 })
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([CHAMBER, EXTRUDER, BED, FAN]))

        openSettings()
        menu().contains('button', 'Reset cards').click()
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([EXTRUDER, BED, FAN, CHAMBER, MCU]))
        menu().contains('button', 'Reset cards').should('not.exist')
    })

    it('reuses the existing option to hide the MCU sensor', () => {
        openSettings()
        toggleCheckbox('Hide Host/MCU Sensors')
        cardOrder((objectNames) => expect(objectNames).to.deep.equal([EXTRUDER, BED, FAN, CHAMBER]))
        cardOption('Chamber').should('exist')
        menu().find('.temperature-settings-cards__card').should('have.length', 4)
    })

    it('changes the time window of the sparklines and remembers it', () => {
        openSettings()
        menu().contains('.temperature-settings-cards__window button', '20 min').click()
        card(EXTRUDER).find('.temperature-card__window').should('have.text', '20 min')
        card(CHAMBER).find('.temperature-sparkline__line').should('have.attr', 'd').and('match', /^M/)

        cy.reload()
        card(EXTRUDER).find('.temperature-card__window', { timeout: 15000 }).should('have.text', '20 min')

        openSettings()
        menu().contains('.temperature-settings-cards__window button', '20 min').should('have.class', 'v-btn--active')
        menu().contains('.temperature-settings-cards__window button', '1 min').click()
        card(EXTRUDER).find('.temperature-card__window').should('have.text', '1 min')
        closeSettings()
    })

    it('stays usable on a phone', () => {
        cy.viewport(400, 850)
        card(MCU).scrollIntoView()

        cy.get('.temperature-card').should(($cards) => {
            const panel = Cypress.$('.temperature-panel')[0].getBoundingClientRect()

            expect($cards).to.have.length(5)
            $cards.each((_, element) => {
                const bounds = element.getBoundingClientRect()

                expect(bounds.left).to.be.at.least(panel.left)
                expect(bounds.right).to.be.at.most(panel.right)
                expect(bounds.width).to.be.at.least(150)
                // nothing is cut off inside a card
                expect(element.scrollWidth).to.be.at.most(element.clientWidth)
            })
        })
        cy.document().should((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(400))

        // heaters get the full width, plain sensors share a row
        card(EXTRUDER).should(($card) => expect($card[0].getBoundingClientRect().width).to.be.greaterThan(300))
        card(CHAMBER).should(($chamber) => {
            const mcu = Cypress.$(`.temperature-card[data-object="${MCU}"]`)[0].getBoundingClientRect()

            expect($chamber[0].getBoundingClientRect().top).to.equal(mcu.top)
        })

        card(BED).scrollIntoView()
        preset(BED, '60°').click()
        cardState(BED).should('have.attr', 'data-state', 'heating')
        card(BED).find('.temperature-card__target input').should('be.visible').and('have.value', '60')

        openSettings()
        menu().should(($menu) => {
            const bounds = $menu[0].getBoundingClientRect()

            expect(bounds.left).to.be.at.least(0)
            expect(bounds.right).to.be.at.most(400)
            expect($menu[0].scrollWidth).to.be.at.most($menu[0].clientWidth)
        })
        menu().contains('.temperature-settings-cards__window button', '20 min').should('be.visible')
        menu().contains('button', 'Table').should('be.visible')
    })
})
