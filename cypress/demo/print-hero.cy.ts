import { demo, openDashboard, openDashboardSettings } from './support'

const hero = '.print-hero-panel'
const settingsMenu = '.print-hero-settings'

// a short print: 2 seconds of warm-up, then 60 seconds of printing
const startPrint = (options = 'seconds=60&warmup=2') => {
    demo(`print?${options}`)
    cy.get(hero, { timeout: 10000 }).should('be.visible')
}

const openHeroSettings = () => {
    cy.get(`${hero} .print-hero-settings__button`).click()
    cy.get(settingsMenu).should('be.visible')
}

const closeHeroSettings = () => {
    // a click outside closes the menu
    cy.get(`${hero} .print-hero__filename`).click()
    cy.get(settingsMenu).should('not.be.visible')
}

const toggleHeroSetting = (label: string) => cy.contains(`${settingsMenu} .v-input--checkbox label`, label).click()

const timelineEvents = (check: (labels: string[]) => void, timeout = 4000) =>
    cy
        .get(`${hero} .print-hero-timeline__event`, { timeout })
        .should(($events) => check($events.toArray().map((event) => event.innerText.replace(/\s+/g, ' ').trim())))

describe('Print hero panel', () => {
    beforeEach(() => {
        openDashboard()
    })

    it('renders nothing while the printer is idle', () => {
        cy.get(hero).should('not.exist')
    })

    it('appears below the status panel when a print starts and shows the key numbers', () => {
        startPrint()

        // first panel of the first column after the fixed status panel
        cy.get('.v-main .row')
            .first()
            .children()
            .first()
            .find('.panel')
            .should(($panels) => {
                expect($panels.eq(0)).to.have.class('status-panel')
                expect($panels.eq(1)).to.have.class('print-hero-panel')
            })

        cy.contains(`${hero} .print-hero__state`, 'Printing')
        cy.get(`${hero} .print-hero__filename`).should('have.text', 'demo.gcode')
        cy.get(`${hero} .print-hero__percent`)
            .invoke('text')
            .should('match', /^\s*\d+\s*%\s*$/)
        cy.get(`${hero} .print-hero__times`)
            .invoke('text')
            .should('match', /\d+s left/)
        cy.get(`${hero} .print-hero__times`)
            .invoke('text')
            .should('match', /Done at \d+:\d+/)
        cy.get(`${hero} .print-hero__metric--layer`)
            .invoke('text')
            .should('match', /Layer\s*[1-9]\d* \/ 120/)
        cy.contains(`${hero} .print-hero__metric--speed`, '60 mm/s')
        cy.contains(`${hero} .print-hero__metric--flow`, '6.0 mm³/s')
        cy.get(`${hero} .print-hero__metric--filament`)
            .invoke('text')
            .should('match', /Filament\s*[1-9]\d* mm/)

        // the webcam picture is the default backdrop
        cy.get(`${hero} .print-hero__stage--webcam .print-hero__backdrop img`).should('be.visible')

        // an untranslated label would show its key
        cy.get(hero)
            .invoke('text')
            .should('not.match', /Panels\.|PrintHeroPanel/)
    })

    it('pauses, resumes and cancels the print from the panel', () => {
        startPrint()
        cy.contains(`${hero} .print-hero__state`, 'Printing')
        // cancelling while printing has to be enabled in the interface settings, like in the status panel
        cy.get(`${hero} .print-hero__action--cancel`).should('not.exist')

        cy.get(`${hero} .print-hero__action--pause`).click()
        cy.contains(`${hero} .print-hero__state`, 'Paused')
        cy.contains('.status-panel .panel-toolbar', 'Paused')

        cy.get(`${hero} .print-hero__action--resume`).click()
        cy.contains(`${hero} .print-hero__state`, 'Printing')

        cy.get(`${hero} .print-hero__action--pause`).click()
        cy.get(`${hero} .print-hero__action--cancel`).click()
        cy.contains(`${hero} .print-hero__state`, 'Cancelled')
        cy.contains(`${hero} .print-hero__times`, 'Cancelled after')
    })

    it('records the phases and events of the print in the timeline', () => {
        startPrint()

        timelineEvents((labels) => {
            expect(labels[0]).to.match(/Warm-up$/)
            expect(labels[1]).to.match(/Print started$/)
            expect(labels[2]).to.match(/First layer done$/)
        })
        // every observed event has a time, and none is marked as approximate
        timelineEvents((labels) => labels.forEach((label) => expect(label).to.match(/^\d+:\d+/)))
        cy.get(`${hero} .print-hero-timeline__phase--warmup`).should('exist')
        cy.get(`${hero} .print-hero-timeline__phase--printing`).should('exist')

        demo('pause')
        timelineEvents((labels) => expect(labels[labels.length - 1]).to.match(/Paused$/))
        demo('resume')
        timelineEvents((labels) => expect(labels.join(' | ')).to.match(/Paused \| .*Resumed/))
        cy.get(`${hero} .print-hero-timeline__phase--paused`).should('exist')

        // 25% of the 60 seconds of printing
        timelineEvents((labels) => expect(labels.join(' | ')).to.match(/25% · layer \d+/), 20000)

        demo('fail')
        cy.contains(`${hero} .print-hero__state`, 'Failed')
        cy.contains(`${hero} .print-hero__times`, 'Failed after')
        cy.contains(`${hero} .print-hero__message`, 'Heater extruder not heating at expected rate')
        timelineEvents((labels) => expect(labels[labels.length - 1]).to.match(/Failed$/))
        cy.get(hero)
            .invoke('text')
            .should('not.match', /Panels\.|PrintHeroPanel/)
    })

    it('rebuilds the timeline when the page is opened in the middle of a print', () => {
        startPrint()
        timelineEvents((labels) => expect(labels.join(' | ')).to.contain('First layer done'))

        cy.reload()
        cy.get(hero, { timeout: 15000 }).should('be.visible')
        timelineEvents((labels) => {
            expect(labels[0]).to.match(/Warm-up$/)
            // not observed: the time is an estimate
            expect(labels[1]).to.match(/^~\d+:\d+.*Print started$/)
            expect(labels[2]).to.equal('First layer done')
        })
    })

    it('stays after the print has finished, until the print stats are cleared', () => {
        startPrint('seconds=5&warmup=1')

        cy.contains(`${hero} .print-hero__state`, 'Finished', { timeout: 15000 })
        cy.get(`${hero} .print-hero__percent`)
            .invoke('text')
            .should('match', /100\s*%/)
        cy.contains(`${hero} .print-hero__times`, 'Finished in')
        cy.contains(`${hero} .print-hero__metric--layer`, '120 / 120')
        // live numbers make no sense after the print
        cy.get(`${hero} .print-hero__metric--speed`).should('not.exist')
        timelineEvents((labels) => expect(labels[labels.length - 1]).to.match(/Finished$/))

        cy.get(`${hero} .print-hero__action--clear`).click()
        cy.get(hero).should('not.exist')
        cy.contains('.status-panel .panel-toolbar', 'Standby')
    })

    it('disappears when Klipper shuts down, because the print data is stale then', () => {
        startPrint()
        cy.contains(`${hero} .print-hero__state`, 'Printing')

        demo('error')
        cy.get(hero).should('not.exist')

        demo('idle')
        cy.contains('.status-panel .panel-toolbar', 'Standby', { timeout: 15000 })
        cy.get(hero).should('not.exist')
    })

    it('lets the user choose the numbers, the backdrop and the timeline, and remembers the choice', () => {
        startPrint()

        openHeroSettings()
        cy.get(settingsMenu)
            .invoke('text')
            .should('not.match', /Panels\.|PrintHeroPanel/)

        cy.get(`${hero} .print-hero__metric--flow`).should('exist')
        toggleHeroSetting('Flow')
        cy.get(`${hero} .print-hero__metric--flow`).should('not.exist')

        cy.get(`${hero} .print-hero__percent`).should('exist')
        toggleHeroSetting('Progress')
        cy.get(`${hero} .print-hero__percent`).should('not.exist')

        cy.get(`${hero} .print-hero__metric--elapsed`).should('not.exist')
        toggleHeroSetting('Elapsed')
        cy.get(`${hero} .print-hero__metric--elapsed`)
            .invoke('text')
            .should('match', /Elapsed\s*\d+s/)

        cy.contains(`${settingsMenu} .v-btn-toggle button`, 'Thumbnail').click()
        cy.get(`${hero} .print-hero__stage--thumbnail .print-hero__thumbnail`)
            .should('be.visible')
            .and('have.attr', 'src')
            .and('include', '.thumbs/demo-300x300.svg')
        cy.get(`${hero} .print-hero__backdrop .webcamImage`).should('not.exist')

        cy.contains(`${settingsMenu} .v-btn-toggle button`, 'None').click()
        cy.get(`${hero} .print-hero__stage--none`).should('exist')
        cy.get(`${hero} .print-hero__thumbnail`).should('not.exist')

        cy.get(`${hero} .print-hero-timeline`).should('exist')
        toggleHeroSetting('Timeline')
        cy.get(`${hero} .print-hero-timeline`).should('not.exist')
        closeHeroSettings()

        // the settings are stored in the database of the printer
        cy.reload()
        cy.get(hero, { timeout: 15000 }).should('be.visible')
        cy.get(`${hero} .print-hero__stage--none`).should('exist')
        cy.get(`${hero} .print-hero__metric--layer`).should('exist')
        cy.get(`${hero} .print-hero__metric--elapsed`).should('exist')
        cy.get(`${hero} .print-hero__metric--flow`).should('not.exist')
        cy.get(`${hero} .print-hero__percent`).should('not.exist')
        cy.get(`${hero} .print-hero-timeline`).should('not.exist')

        // and everything can be switched back on
        openHeroSettings()
        toggleHeroSetting('Timeline')
        cy.contains(`${settingsMenu} .v-btn-toggle button`, 'Webcam').click()
        cy.get(`${hero} .print-hero-timeline`).should('exist')
        cy.get(`${hero} .print-hero__stage--webcam`).should('exist')
    })

    it('can be hidden in the dashboard settings like any other panel', () => {
        openDashboardSettings()
        cy.contains('.v-dialog--active .v-list-item', 'Print Progress').find('.v-icon').last().click()
        cy.get('.v-dialog--active')
            .invoke('text')
            .should('not.match', /Panels\.|PrintHeroPanel/)
        cy.get('body').type('{esc}')

        demo('print?seconds=60&warmup=2')
        cy.contains('.status-panel .panel-toolbar', 'Printing')
        cy.get(hero).should('not.exist')
    })
})
