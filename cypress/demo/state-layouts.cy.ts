import { columnPanels, demo, openDashboard, openDashboardSettings } from './support'

const last = (titles: string[]) => titles[titles.length - 1]

describe('State-aware dashboard', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('shows the stored layout while idle', () => {
        columnPanels(1, (titles) => expect(titles[2]).to.equal('Toolhead'))
        columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures', 'Console']))
    })

    it('keeps the webcam on top and moves the toolhead controls to the bottom while printing', () => {
        demo('print')
        cy.contains('.panel-toolbar', 'Printing')

        columnPanels(1, (titles) => expect(titles[1]).to.equal('Webcam'))
        columnPanels(1, (titles) => expect(last(titles)).to.equal('Toolhead'))

        demo('pause')
        cy.contains('.panel-toolbar', 'Paused')
        columnPanels(1, (titles) => expect(last(titles)).to.equal('Toolhead'))
    })

    it('puts the console first after a failed print and keeps the motion controls', () => {
        demo('print')
        cy.contains('.panel-toolbar', 'Printing')
        demo('fail')
        cy.contains('.panel-toolbar', 'Error')

        columnPanels(2, (titles) => expect(titles).to.deep.equal(['Console', 'Temperatures']))
        columnPanels(1, (titles) => expect(titles).to.include('Toolhead'))
        columnPanels(1, (titles) => expect(titles).to.include('Extruder'))
    })

    it('returns to the idle layout when the printer is idle again', () => {
        demo('print')
        cy.contains('.panel-toolbar', 'Printing')
        columnPanels(1, (titles) => expect(last(titles)).to.equal('Toolhead'))

        demo('idle')
        cy.contains('.panel-toolbar', 'Standby')
        columnPanels(1, (titles) => expect(titles[2]).to.equal('Toolhead'))
    })

    it('keeps the idle layout while printing when the feature is switched off', () => {
        openDashboardSettings()
        cy.contains('.v-dialog--active', 'Adapt layout to printer state').find('.v-input--switch').click()
        cy.get('.v-dialog--active .v-btn-toggle').should('have.length', 1)
        cy.get('body').type('{esc}')

        demo('print')
        cy.contains('.panel-toolbar', 'Printing')
        columnPanels(1, (titles) => expect(titles[2]).to.equal('Toolhead'))
    })

    it('lets the printing layout be customized and reset', () => {
        openDashboardSettings()
        cy.contains('.v-dialog--active .v-btn-toggle button', 'Printing').click()
        cy.contains('.v-dialog--active', 'Follows your idle layout')
        // an untranslated label would show its key
        cy.get('.v-dialog--active').invoke('text').should('not.match', /Settings\.DashboardTab\./i)
        cy.contains('.v-dialog--active .v-list-item', 'Toolhead').find('.v-icon').last().click()
        cy.contains('.v-dialog--active', 'Customized.')
        cy.get('body').type('{esc}')

        demo('print')
        cy.contains('.panel-toolbar', 'Printing')
        columnPanels(1, (titles) => expect(titles).not.to.include('Toolhead'))

        openDashboardSettings()
        cy.contains('.v-dialog--active .v-btn-toggle button', 'Printing').click()
        cy.contains('.v-dialog--active button', 'Reset Layout').click()
        cy.contains('.v-dialog--active', 'Follows your idle layout')
        cy.get('body').type('{esc}')
        columnPanels(1, (titles) => expect(last(titles)).to.equal('Toolhead'))
    })
})
