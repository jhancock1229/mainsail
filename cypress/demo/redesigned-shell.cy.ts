import { demo, openDashboard, openShell } from './support'

const rawKey = /\b(Shell|Settings|Panels|App|CommandPalette)\.[A-Z]\w*\.\w+/
const paletteDialog = '.v-dialog--active.command-palette'
const pages = ['home', 'print', 'tune', 'fix', 'machine', 'settings']
const titles = ['Print something', 'Tune and calibrate', 'Fix a problem', 'Machine and files', 'Settings']

const rail = (page: string) => cy.get(`.shell-rail [data-page="${page}"]`)
const tab = (id: string) => cy.get(`.sh-page__tabs [data-tab="${id}"], .shell-settings__tabs [data-tab="${id}"]`)
const headline = () => cy.get('.shell-header__title')
const noRawKeys = () => cy.get('.shell').should(($shell) => expect($shell.text()).not.to.match(rawKey))
const gcodeLog = (check: (log: string[]) => void) =>
    cy.request(`${Cypress.env('demoUrl')}/gcode-log`).should((response) => check(response.body as string[]))

const pageDoesNotScroll = () => {
    cy.get('.shell__main > *').should('be.visible')
    cy.window().should((win) => {
        const doc = win.document
        const shell = doc.querySelector('.shell') as HTMLElement

        expect(doc.documentElement.scrollHeight, 'document height').to.be.at.most(win.innerHeight)
        expect(doc.documentElement.scrollWidth, 'document width').to.be.at.most(win.innerWidth)
        expect(shell.scrollHeight, 'shell height').to.be.at.most(win.innerHeight)
        expect(shell.getBoundingClientRect().bottom, 'shell bottom').to.be.at.most(win.innerHeight)

        const last = doc.querySelector('.shell__main > *') as HTMLElement
        expect(last.getBoundingClientRect().bottom, 'page bottom').to.be.at.most(win.innerHeight + 1)
        doc.querySelectorAll<HTMLElement>('.sh-col:not(.sh-col--scroll)').forEach((column) => {
            expect(column.scrollHeight, `column ${column.getAttribute('aria-label')}`).to.be.at.most(
                column.clientHeight + 1
            )
        })
        const settingsTabs = doc.querySelector('.shell-settings__tabs')
        if (settingsTabs) {
            expect(settingsTabs.scrollHeight, 'settings tab list').to.be.at.most(settingsTabs.clientHeight + 1)
        }
        const stop = doc.querySelector('.shell-rail__stop')
        if (stop) expect(stop.getBoundingClientRect().bottom, 'emergency stop').to.be.at.most(win.innerHeight)
    })
}

describe('Redesigned shell: navigation', () => {
    beforeEach(() => openShell())

    it('opens on Home with the six task pages in the left rail', () => {
        headline().should('have.text', 'Ready to print')
        cy.get('.shell-rail [data-page]').should(($links) => {
            expect($links.toArray().map((link) => link.getAttribute('data-page'))).to.deep.equal(pages)
        })
        rail('home').should('have.attr', 'aria-current', 'page')
        cy.get('.v-app-bar').should('not.exist')
        noRawKeys()
    })

    it('reaches every page with one click and keeps the emergency stop on each', () => {
        pages.slice(1).forEach((page, index) => {
            rail(page).click()
            headline().should('have.text', titles[index])
            rail(page).should('have.attr', 'aria-current', 'page')
            cy.get('.shell-rail__stop').should('be.visible').and('contain', 'Emergency stop')
            noRawKeys()
        })
        rail('home').click()
        headline().should('have.text', 'Ready to print')
    })

    it('shows the tune and calibrate tabs from the design and remembers the tab in the address', () => {
        rail('tune').click()
        cy.get('.sh-page__tabs [role="tab"]').should(($tabs) => {
            expect($tabs.toArray().map((entry) => entry.innerText.trim())).to.deep.equal([
                'Move',
                'Extruder',
                'Bed level',
                'Heater tuning',
                'Resonance',
                'Limits',
                'Macros',
            ])
        })
        tab('limits').click()
        cy.location('pathname').should('eq', '/tune/limits')
        cy.reload()
        tab('limits').should('have.attr', 'aria-selected', 'true')
        cy.get('.machine-settings-panel').should('be.visible')
    })

    it('opens the pages of the classic interface at their new place', () => {
        cy.visit('/files')
        headline().should('have.text', 'Print something')
        cy.get('.gcode-files-panel').should('be.visible')

        cy.visit('/console')
        headline().should('have.text', 'Fix a problem')
        tab('console').should('have.attr', 'aria-selected', 'true')

        cy.visit('/config')
        headline().should('have.text', 'Machine and files')
        cy.get('.machine-configfiles-panel').should('be.visible')
    })

    it('opens an available tab when the address names one the printer does not offer', () => {
        cy.visit('/machine/updates')
        headline().should('have.text', 'Machine and files')
        cy.get('.sh-page__tabs [data-tab="updates"]').should('not.exist')
        tab('config').should('have.attr', 'aria-selected', 'true')
        cy.get('.machine-configfiles-panel').should('be.visible')

        cy.visit('/settings/timelapse')
        tab('general').should('have.attr', 'aria-selected', 'true')
    })

    it('keeps the shell and the page when the window is resized below the phone width', () => {
        rail('tune').click()
        tab('limits').click()
        cy.viewport(800, 700)
        cy.get('.shell .shell-rail').should('be.visible')
        cy.get('.v-app-bar').should('not.exist')
        cy.location('pathname').should('eq', '/tune/limits')
    })

    it('opens the command palette from the rail and runs a command', () => {
        cy.get('.shell-rail__search').should('contain', 'Search or run').click()
        cy.get(`${paletteDialog} .command-palette__input`).type('console')
        cy.get(`${paletteDialog} .command-palette-row--selected`).should('contain', 'Console')
        cy.get(`${paletteDialog} .command-palette__input`).type('{enter}')
        headline().should('have.text', 'Fix a problem')
        tab('console').should('have.attr', 'aria-selected', 'true')
    })

    it('stops the printer from the rail', () => {
        rail('machine').click()
        cy.get('.shell-rail__stop').click()
        headline().should('have.text', 'Machine and files')
        rail('home').click()
        headline().should('have.text', 'The printer has shut down')
        cy.get('.shell-home').should('have.attr', 'data-state', 'error')
    })

    it('uses the bundled Manrope font and the palette of the design', () => {
        cy.get('.shell').should(($shell) => {
            expect($shell.css('font-family')).to.contain('Manrope')
            expect($shell.css('background-color')).to.equal('rgb(35, 40, 50)')
        })
        cy.document().should((doc) => expect(doc.fonts.check('500 16px Manrope')).to.equal(true))

        cy.get('.shell-rail .mode-toggle-button').click()
        cy.get('html').should('have.class', 'theme--light')
        cy.get('.shell').should('have.css', 'background-color', 'rgb(246, 247, 249)')
        rail('home').should('have.css', 'background-color', 'rgb(28, 36, 48)')
    })
})

describe('Redesigned shell: nothing scrolls', () => {
    const sizes: [number, number][] = [
        [1280, 720],
        [1440, 900],
    ]
    const states: [string, string[], string][] = [
        ['idle', ['spool'], 'idle'],
        ['printing', ['spool', 'print'], 'printing'],
        ['error', ['spool', 'print', 'error'], 'error'],
    ]

    sizes.forEach(([width, height]) => {
        states.forEach(([name, seed, homeState]) => {
            it(`fits every page in a ${width}x${height} window while ${name}`, () => {
                cy.viewport(width, height)
                openShell('/', seed)
                cy.get('.shell-home').should('have.attr', 'data-state', homeState)
                pageDoesNotScroll()

                pages.slice(1).forEach((page) => {
                    rail(page).click()
                    cy.get(`.shell--${page}`)
                    pageDoesNotScroll()
                })

                cy.visit('/tune/heater-tuning')
                cy.get('.shell-tune[data-tab="heater-tuning"]')
                pageDoesNotScroll()
                cy.visit('/machine/history')
                cy.get('.shell-machine[data-tab="history"]')
                pageDoesNotScroll()
            })
        })
    })

    it('fits a failed print and a finished print as well', () => {
        cy.viewport(1280, 720)
        openShell('/', ['spool', 'print', 'fail/heater'])
        headline().should('have.text', 'The print stopped with an error')
        cy.get('.shell-error .error-explainer').should('be.visible')
        pageDoesNotScroll()

        openShell('/', ['spool', 'print', 'finish'])
        headline().should('have.text', 'Your print is finished')
        pageDoesNotScroll()
    })
})

describe('Redesigned shell: three clicks to any feature', () => {
    const deepFeatures: [string, string, string, string][] = [
        ['motion limits', 'tune', 'limits', '.machine-settings-panel input'],
        ['macros', 'tune', 'macros', '.macros-panel .v-item-group .v-btn'],
        ['pressure advance', 'tune', 'extruder', '.extruder-control-panel input'],
        ['bed mesh profiles', 'tune', 'bed-level', '.heightmap-profiles-panel'],
        ['heater tuning', 'tune', 'heater-tuning', '.shell-tune [data-heater="extruder"]'],
        ['log files', 'fix', 'logs', '.machine-logfiles-panel a, .machine-logfiles-panel .v-btn'],
        ['console', 'fix', 'console', '.shell-fix textarea'],
        ['system load', 'machine', 'system', '.machine-systemload-panel'],
        ['print history', 'machine', 'history', '.history-list-panel'],
        ['job queue', 'print', 'queue', '.jobqueue-panel'],
        ['preheat presets', 'settings', 'presets', '.shell-settings__content .v-btn'],
        ['notification rules', 'settings', 'notifications', '.shell-settings__content .v-input'],
    ]

    beforeEach(() => openShell())

    deepFeatures.forEach(([name, page, tabId, control]) => {
        it(`reaches ${name} with a page, a tab and the control`, () => {
            rail(page).click()
            tab(tabId).click()
            cy.get(control).first().scrollIntoView().should('be.visible')
            noRawKeys()
        })
    })

    it('says when a heater tuning temperature cannot be used', () => {
        cy.visit('/tune/heater-tuning')
        cy.get('.shell-tune [data-heater="extruder"]').should('not.be.disabled')
        cy.get('.shell-tune__pid').first().find('input').clear()
        cy.get('.shell-tune__pid-error').should('contain', 'Enter a temperature between 1 and')
        cy.get('.shell-tune__pid').first().find('button').should('be.disabled')

        cy.get('.shell-tune__pid').first().find('input').type('65')
        cy.get('.shell-tune__pid-error').should('not.exist')
        cy.get('.shell-tune__pid').first().find('button').click()
        gcodeLog((log) =>
            expect(log.some((script) => /^PID_CALIBRATE HEATER=\w+ TARGET=65$/.test(script))).to.equal(true)
        )
    })

    it('runs a macro on the third click', () => {
        rail('tune').click()
        tab('macros').click()
        cy.contains('.macros-panel .v-item-group .v-btn', /LIGHTS ON/i).click()
        gcodeLog((log) => expect(log).to.include('LIGHTS_ON'))
    })

    it('homes, jogs and nudges the first layer from the Move tab', () => {
        rail('tune').click()
        cy.get('.shell-move__circle button[aria-label="Move right"]').should('be.disabled')
        cy.get('.shell-move__home').click()
        gcodeLog((log) => expect(log).to.include('G28'))

        cy.get('.shell-move__circle button[aria-label="Move right"]').should('not.be.disabled').click()
        gcodeLog((log) => expect(log.some((script) => script.includes('G1 X10 F6000'))).to.equal(true))

        cy.contains('.shell-move__step', /^\s*1\s*$/).click()
        cy.get('.shell-move__slim button[aria-label="Move up"]').click()
        gcodeLog((log) => expect(log.some((script) => script.includes('G1 Z1 F1500'))).to.equal(true))

        cy.get('.shell-goto [data-place="centre"]').click()
        gcodeLog((log) => expect(log.some((script) => script.includes('G1 X110 Y110'))).to.equal(true))

        cy.get('.shell-offset [data-offset="+0.01"]').click()
        gcodeLog((log) =>
            expect(log.some((script) => script.startsWith('SET_GCODE_OFFSET Z_ADJUST=+0.01'))).to.equal(true)
        )

        cy.get('.shell-goto [data-action="motors-off"]').click()
        gcodeLog((log) => expect(log).to.include('M84'))
    })
})

describe('Redesigned shell: Home', () => {
    it('starts a print from the recent files and follows it to the end', () => {
        openShell()
        cy.get('.shell-start__file').should('have.length', 5)
        cy.contains('.shell-start__file', 'benchy.gcode').should('contain', '1 h 12 min · 9 g').click()
        cy.contains('.v-dialog--active .v-btn', /print/i).click()

        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        headline()
            .invoke('text')
            .should('match', /^(Warming up for your print|Your print is \d+% done)$/)
        cy.get('.shell-header__status').should('contain', 'benchy.gcode')
        cy.get('.shell-job__facts').should('contain', 'Time left').and('contain', 'Layer')
        cy.get('.shell-while .sh-btn').should('have.length', 4)

        cy.get('.shell-job__pause').click()
        headline()
            .invoke('text')
            .should('match', /^Your print is paused at \d+%$/)
        cy.get('.shell-job__resume').click()
        cy.get('.shell-job__pause').should('be.visible')

        demo('finish')
        headline().should('have.text', 'Your print is finished')
        cy.get('.shell-events').should('contain', 'Finished').and('contain', 'Paused for')
        cy.get('.shell-job__clear').click()
        headline().should('have.text', 'Ready to print')
        cy.get('.shell-last__name').should('have.text', 'benchy.gcode')
        noRawKeys()
    })

    it('uploads a file and offers to print it', () => {
        openShell()
        cy.get('.shell-start__input').selectFile(
            { contents: Cypress.Buffer.from('G28\n'), fileName: 'uploaded_part.gcode' },
            { force: true }
        )
        cy.get('.v-dialog--active').should('contain', 'uploaded_part.gcode')
        cy.contains('.shell-start__file', 'uploaded_part.gcode').should('exist')
        cy.contains('.v-dialog--active .v-btn', /print/i).click()
        cy.get('.shell-header__status').should('contain', 'uploaded_part.gcode')
    })

    it('prints the last print again', () => {
        openShell()
        cy.get('.shell-last__name').should('have.text', 'phone_stand.gcode')
        cy.get('.shell-last__meta').should('contain', '1 h 52 min')
        cy.get('.shell-last__again').click()
        cy.contains('.v-dialog--active .v-btn', /print/i).click()
        cy.get('.shell-header__status').should('contain', 'phone_stand.gcode')
    })

    it('still offers to print an upload after leaving Home', () => {
        openShell()
        cy.get('.shell-start__input').selectFile(
            { contents: Cypress.Buffer.from('G28\n'), fileName: 'left_home.gcode' },
            { force: true }
        )
        rail('tune').click({ force: true })
        cy.get('.v-dialog--active').should('contain', 'left_home.gcode')
        cy.contains('.v-dialog--active .v-btn', /print/i).click()
        headline()
            .invoke('text')
            .should('match', /^(Warming up for your print|Your print is \d+% done)$/)
    })

    it('shows how the time of the print was spent and fills the middle column with the camera', () => {
        openShell('/', ['print?seconds=120&warmup=4'])
        cy.get('.shell-phases__bar .shell-phases__segment--printing', { timeout: 15000 }).should('exist')
        cy.get('.shell-phases__legend').should('contain', 'To go')
        cy.get('.shell-view .shell-camera').should(($box) => {
            const column = $box.closest('.sh-col')[0].getBoundingClientRect()
            const box = $box[0].getBoundingClientRect()
            const image = $box.find('img')[0].getBoundingClientRect()

            expect(column.bottom - box.bottom, 'gap below the camera').to.be.at.most(24)
            expect(image.height, 'picture height').to.be.closeTo(box.height, 2)
            expect(image.width, 'picture width').to.be.closeTo(box.width, 2)
        })
    })

    it('asks before cancelling a running print', () => {
        openShell('/', ['print'])
        cy.get('.shell-job__cancel').click()
        cy.contains('.v-dialog--active .v-btn', 'No').click()
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        cy.get('.shell-job__cancel').click()
        cy.contains('.v-dialog--active .v-btn', 'Yes').click()
        headline().should('have.text', 'The print was cancelled')
    })

    it('shows the camera or the console in the middle column while printing', () => {
        openShell('/', ['print'])
        cy.get('.shell-view .shell-camera img').should('be.visible')
        cy.get('.shell-view [data-tab="console"]').click()
        cy.get('.shell-view .shell-console textarea').should('be.visible')
        cy.get('.shell-view .shell-camera').should('not.exist')
    })

    it('opens speed and flow without leaving Home', () => {
        openShell('/', ['print'])
        cy.get('.shell-while [data-action="speed"]').click()
        cy.get('.v-dialog--active').should('contain', 'Speed factor').and('contain', 'Extrusion factor')
    })

    it('preheats with a preset and homes from the get ready column', () => {
        openShell()
        cy.contains('.shell-ready__preset', 'PLA').should('contain', '210 / 60').click()
        gcodeLog((log) =>
            expect(log).to.include(
                'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210\nSET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60'
            )
        )
        cy.get('.shell-ready [data-action="home"]').click()
        gcodeLog((log) => expect(log).to.include('G28'))
        cy.get('.shell-ready [data-action="move"]').click()
        cy.location('pathname').should('eq', '/tune/move')
    })

    it('explains a Klipper error and offers the way out', () => {
        openShell('/', ['error/heater'])
        cy.get('.shell-home').should('have.attr', 'data-state', 'error')
        cy.get('.shell-error .error-explainer').should('be.visible')
        cy.get('.shell-error [data-action="firmwareRestart"]').click()
        headline().should('have.text', 'Ready to print')
    })
})

describe('Redesigned shell: spool tracker', () => {
    it('invites the user to say when a spool was loaded', () => {
        openShell()
        cy.get('.shell-spool').should('contain', 'it will estimate how much is left')
        cy.get('.shell-spool__new').click()
        cy.get('.shell-spool-dialog__size input').should('have.value', '1000')
        cy.get('.shell-spool-dialog__name input').type('Red PETG')
        cy.get('.shell-spool-dialog__material').click()
        cy.contains('.menuable__content__active .v-list-item', 'PETG').click()
        cy.get('.shell-spool-dialog__size input').clear().type('750')
        cy.get('.shell-spool-dialog__save').click()

        cy.get('.shell-spool').should('contain', 'about 750 g left').and('contain', 'Red PETG')
        cy.get('.shell-header__status').should('contain', 'PETG loaded')

        cy.reload()
        cy.get('.shell-spool', { timeout: 15000 }).should('contain', 'about 750 g left')
        noRawKeys()
    })

    it('adds up the filament of the prints since the spool was loaded', () => {
        openShell('/', ['spool'])
        cy.get('.shell-spool')
            .should('contain', 'about 317 g left')
            .and('contain', 'of 1 kg · 683 g used')
            .and('contain', 'Black PLA')
        cy.get('.shell-spool .sh-bar > div').should(($bar) => {
            const share = $bar.width()! / $bar.parent().width()!

            expect(share).to.be.closeTo(0.32, 0.01)
        })
    })

    it('stores what was used, so the estimate does not depend on how much history is loaded', () => {
        openShell('/', ['spool'])
        cy.get('.shell-spool').should('contain', 'about 317 g left')
        cy.request(
            `${Cypress.env('demoUrl').replace('/demo', '')}/server/database/item?namespace=mainsail&key=spoolTracker`
        )
            .its('body.result.value')
            .should((stored) => {
                expect(stored.usedLength).to.equal(228920)
                expect(stored.lastJobId).to.equal('000009')
            })

        demo('print?seconds=60')
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        demo('finish')
        headline().should('have.text', 'Your print is finished')
        cy.reload()
        cy.get('.shell-spool', { timeout: 15000 }).should('contain', 'g used since loading')
        cy.request(
            `${Cypress.env('demoUrl').replace('/demo', '')}/server/database/item?namespace=mainsail&key=spoolTracker`
        )
            .its('body.result.value.lastJobId')
            .should('equal', '00000A')
    })

    it('says whether the spool is enough for the running print and counts it down', () => {
        openShell('/', ['spool', 'print?seconds=60'])
        cy.get('.shell-spool').should('contain', '683 g used since loading')
        cy.get('.shell-spool__enough')
            .invoke('text')
            .should('match', /Enough for this print \(\d+ g to go\)/)

        demo('finish')
        cy.get('.shell-job__clear').click()
        cy.get('.shell-spool').should('contain', 'g used').and('contain', 'about 31')
    })

    it('starts again from a full spool, also in the middle of a print', () => {
        openShell('/', ['spool', 'print?seconds=60'])
        cy.get('.shell-spool__subtitle--button').click()
        cy.get('.shell-spool-dialog__save').click()
        cy.get('.shell-spool').should('contain', 'about 1 kg left')
    })

    it('can be switched off in the settings', () => {
        openShell('/settings/ui-settings', ['spool'])
        cy.get('.spool-tracker-switch input').click({ force: true })
        rail('home').click()
        cy.get('.shell-last').should('be.visible')
        cy.get('.shell-spool').should('not.exist')
    })
})

describe('Redesigned shell: interface switch', () => {
    it('switches to the classic interface in the settings and back from the command palette', () => {
        openShell('/settings/ui-settings')
        cy.get('.interface-shell-select').click()
        cy.contains('.menuable__content__active .v-list-item', 'Classic').click()

        cy.get('.v-app-bar', { timeout: 15000 }).should('be.visible')
        cy.get('.shell').should('not.exist')
        cy.contains('.panel-toolbar', 'Standby')
        cy.get('html').should('not.have.class', 'shell-new')

        cy.reload()
        cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })

        cy.get('.command-palette-trigger').click()
        cy.get(`${paletteDialog} .command-palette__input`).type('new interface')
        cy.get(`${paletteDialog} .command-palette-row--selected`).should('contain', 'Switch to the new interface')
        cy.get(`${paletteDialog} .command-palette__input`).type('{enter}')
        cy.get('.shell .shell-rail').should('be.visible')
        cy.get('.v-app-bar').should('not.exist')
    })

    it('offers the classic interface in the command palette of the new shell', () => {
        openShell()
        cy.get('.shell-rail__search').click()
        cy.get(`${paletteDialog} .command-palette__input`).type('classic')
        cy.get(`${paletteDialog} .command-palette-row--selected`).should('contain', 'Switch to the classic interface')
        cy.get(`${paletteDialog} .command-palette__input`).type('{enter}')
        cy.get('.v-app-bar').should('be.visible')
    })

    it('keeps the classic interface on phone-width screens', () => {
        cy.viewport(400, 850)
        openDashboard()
        cy.request(`${Cypress.env('demoUrl')}/reset`)
        cy.reload()
        cy.get('.v-app-bar', { timeout: 15000 }).should('be.visible')
        cy.get('.shell').should('not.exist')
    })

    it('does not offer the new interface where the screen forces the classic one', () => {
        cy.viewport(400, 850)
        openDashboard()
        cy.get('.command-palette-trigger-icon').click()
        cy.get(`${paletteDialog} .command-palette__input`).type('interface')
        cy.get(paletteDialog).should('not.contain', 'Switch to the')
    })

    it('sends an address of the new shell to the matching classic page', () => {
        openDashboard()
        cy.visit('/print/files')
        cy.location('pathname', { timeout: 15000 }).should('eq', '/files')
        cy.get('.gcode-files-panel').should('be.visible')
    })
})
