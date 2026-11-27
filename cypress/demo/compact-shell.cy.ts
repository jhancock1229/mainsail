import { openShell, useTouchScreen } from './support'

const PIN = '4821'
const rawKey = /\b(Shell|Settings|Panels|App|Kiosk)\.[A-Z]\w*\.\w+/
const pages = ['home', 'print', 'tune', 'fix', 'machine', 'settings']
const sizes: [number, number][] = [
    [400, 850],
    [800, 480],
]

const nav = (page: string) => cy.get(`.shell-rail__link[data-page="${page}"]`)
const section = (key: string) => cy.get(`.shell-sections__tab[data-entry="${key}"]`)
const headline = () => cy.get('.shell-header__title')
const activeColumn = () => cy.get('.sh-columns > [data-compact="active"]')
const noRawKeys = () => cy.get('.shell').should(($shell) => expect($shell.text()).not.to.match(rawKey))
const demoRequest = (command: string) => cy.request(`${Cypress.env('demoUrl')}/${command}`)

const touchAt = (clientX: number, clientY: number) => {
    const touches = [{ clientX, clientY, pageX: clientX, pageY: clientY }]

    return { touches, changedTouches: touches }
}

const swipe = (selector: string, fromX: number, toX: number) => {
    cy.get(selector).first().trigger('touchstart', touchAt(fromX, 300)).trigger('touchend', touchAt(toX, 306))
}

const openTouchScreen = (path: string, width: number, height: number) => {
    cy.viewport(width, height)
    cy.visit(path)
    cy.get('.shell .shell-rail', { timeout: 15000 })
    useTouchScreen()
}

const enterPin = (pin: string, dialog = '.kiosk-pin-dialog') => {
    pin.split('').forEach((digit) => cy.get(`${dialog} [data-key="${digit}"]`).click())
    cy.get(`${dialog} [data-key="ok"]`).click()
}

const setPin = (pin: string) => {
    cy.get('.kiosk-pin-set').click()
    enterPin(pin, '.kiosk-set-pin-dialog')
    cy.contains('.kiosk-set-pin-dialog', 'Repeat the PIN')
    enterPin(pin, '.kiosk-set-pin-dialog')
    cy.contains('.settings-kiosk-tab', 'A PIN is set')
}

const chooseRule = (action: string, rule: string) => {
    cy.get(`.kiosk-action-${action}`).click()
    cy.contains(`.kiosk-action-${action} .v-list-item`, rule).click()
}

const fitsTheScreen = (label: string) => {
    activeColumn().should('have.length', 1).and('be.visible')
    cy.window().should((win) => {
        const doc = win.document
        const shell = doc.querySelector('.shell') as HTMLElement
        const column = doc.querySelector('.sh-columns > [data-compact="active"]') as HTMLElement
        const links = doc.querySelector('.shell-rail__links') as HTMLElement
        const strip = doc.querySelector<HTMLElement>('.shell-sections')
        const stop = doc.querySelector<HTMLElement>('.shell-rail__stop')
        const floor = (strip ?? links).getBoundingClientRect().top

        expect(doc.documentElement.scrollHeight, `${label}: document height`).to.be.at.most(win.innerHeight)
        expect(doc.documentElement.scrollWidth, `${label}: document width`).to.be.at.most(win.innerWidth)
        expect(shell.scrollHeight, `${label}: shell height`).to.be.at.most(win.innerHeight + 1)
        expect(links.getBoundingClientRect().bottom, `${label}: bottom bar`).to.be.at.most(win.innerHeight + 1)
        expect(column.getBoundingClientRect().bottom, `${label}: column bottom`).to.be.at.most(floor + 1)
        expect(column.getBoundingClientRect().height, `${label}: column height`).to.be.at.least(120)
        expect(column.scrollWidth, `${label}: column width`).to.be.at.most(column.clientWidth + 1)
        if (column.matches('.sh-col:not(.sh-col--scroll)')) {
            expect(column.scrollHeight, `${label}: column content`).to.be.at.most(column.clientHeight + 1)
        }
        if (strip) expect(strip.scrollWidth, `${label}: sections`).to.be.at.most(strip.clientWidth + 1)
        if (stop) {
            const box = stop.getBoundingClientRect()
            expect(box.top, `${label}: emergency stop`).to.be.at.least(0)
            expect(box.right, `${label}: emergency stop`).to.be.at.most(win.innerWidth)
        }
    })
}

const everySectionFits = (page: string) => {
    nav(page).click()
    cy.get(`.shell--${page}`)
    cy.get('body').then(($body) => {
        const keys = $body
            .find('.shell-sections__tab')
            .toArray()
            .map((entry) => entry.getAttribute('data-entry') as string)
        if (keys.length === 0) return fitsTheScreen(page)

        keys.forEach((key) => {
            section(key).click()
            section(key).should('have.attr', 'aria-selected', 'true')
            fitsTheScreen(`${page} ${key}`)
            cy.get('.sh-columns > [data-section]').should(($columns) => {
                $columns.toArray().forEach((column) => {
                    const name = column.getAttribute('data-section') as string
                    const offered = keys.some((entry) => entry.endsWith(`:${name}`)) || name === 'view'
                    expect(offered, `${page}: a section for the column ${name}`).to.equal(true)
                })
            })
        })
    })
}

describe('Small-screen shell: layout', () => {
    beforeEach(() => {
        cy.viewport(400, 850)
        openShell()
    })

    it('has the six task pages in a bottom bar and the emergency stop on every one', () => {
        headline().should('have.text', 'Ready to print')
        cy.get('.shell-rail__link').should(($links) => {
            expect($links.toArray().map((link) => link.getAttribute('data-page'))).to.deep.equal(pages)
            expect($links.toArray().map((link) => link.innerText.trim())).to.deep.equal([
                'Home',
                'Print',
                'Tune',
                'Fix',
                'Machine',
                'Settings',
            ])
        })
        cy.get('.v-app-bar').should('not.exist')

        pages.forEach((page) => {
            nav(page).click()
            nav(page).should('have.attr', 'aria-current', 'page')
            cy.get('.shell-rail__stop').should('be.visible').and('have.attr', 'aria-label', 'Emergency stop')
            headline().should('be.visible')
            noRawKeys()
        })
    })

    it('shows the columns of a page one at a time', () => {
        cy.get('.shell-sections__tab').should(($tabs) => {
            expect($tabs.toArray().map((entry) => entry.innerText.trim())).to.deep.equal([
                'Start',
                'Get ready',
                'Camera',
            ])
        })
        cy.get('.shell-start').should('be.visible')
        cy.get('.shell-ready').should('not.be.visible')

        section(':ready').click()
        cy.get('.shell-ready').should('be.visible')
        cy.get('.shell-start').should('not.be.visible')
        activeColumn().should('have.length', 1)

        section(':camera').click()
        cy.get('.shell-last').should('be.visible')
        cy.get('.shell-ready').should('not.be.visible')
    })

    it('lists the columns of every tab of a page, so each is one tap from the page', () => {
        nav('tune').click()
        cy.get('.sh-page__tabs').should('not.be.visible')
        cy.get('.shell-sections__tab').should(($tabs) => {
            const labels = $tabs.toArray().map((entry) => entry.innerText.trim())
            expect(labels.slice(0, 3)).to.deep.equal(['Move', 'Go to', 'First layer'])
            expect(labels).to.include.members(['Extruder', 'Heaters', 'PID', 'Limits', 'Speed', 'Macros'])
        })

        section('heater-tuning:pid').click()
        cy.location('pathname').should('eq', '/tune/heater-tuning')
        cy.get('.shell-tune [data-heater="extruder"]').should('be.visible')
        cy.get('.temperature-panel').should('not.be.visible')

        section('heater-tuning:heaters').click()
        cy.get('.temperature-panel').should('be.visible')

        section('move:first-layer').click()
        cy.location('pathname').should('eq', '/tune/move')
        cy.get('.shell-offset [data-offset="+0.01"]').should('be.visible')
    })

    it('moves between sections with a swipe, also into the next tab', () => {
        nav('fix').click()
        section('status:status').should('have.attr', 'aria-selected', 'true')

        swipe('.shell-fix__status h2', 320, 80)
        section('status:endstops').should('have.attr', 'aria-selected', 'true')
        cy.get('.shell-fix__status').should('not.be.visible')

        swipe('.shell__main .shell-header', 320, 80)
        section('console:console').should('have.attr', 'aria-selected', 'true')
        cy.location('pathname').should('eq', '/fix/console')

        swipe('.shell__main .shell-header', 80, 320)
        section('status:endstops').should('have.attr', 'aria-selected', 'true')
        cy.location('pathname').should('eq', '/fix/status')
    })

    it('does not change the section when the jog pad is swiped', () => {
        nav('tune').click()
        swipe('.shell-move__circle', 320, 80)
        section('move:move').should('have.attr', 'aria-selected', 'true')
        cy.get('.shell-move__circle').should('be.visible')
    })

    it('uses the circular pad to jog on a phone', () => {
        nav('tune').click()
        cy.get('.shell-move__circle').should('be.visible')
        cy.get('.shell-move__home').click()
        cy.request(`${Cypress.env('demoUrl')}/gcode-log`).should((response) =>
            expect(response.body as string[]).to.include('G28')
        )
    })

    it('opens the list of settings first and the chosen settings after a tap', () => {
        nav('settings').click()
        section('general:sections').should('have.attr', 'aria-selected', 'true')
        cy.get('.shell-settings__tabs').should('be.visible')
        cy.get('.shell-settings__content').should('not.be.visible')

        cy.get('.shell-settings__tab[data-tab="kiosk"]').click()
        cy.location('pathname').should('eq', '/settings/kiosk')
        cy.get('.settings-kiosk-tab').should('be.visible')
        section('kiosk:content').should('have.attr', 'aria-selected', 'true').and('contain', 'Touch & kiosk')
        noRawKeys()

        section('kiosk:sections').click()
        cy.get('.shell-settings__tabs').should('be.visible')
    })

    it('keeps speed and flow, the console and pausing within three taps while printing', () => {
        demoRequest('print')
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        cy.get('.shell-sections__tab').should(($tabs) => {
            expect($tabs.toArray().map((entry) => entry.innerText.trim())).to.deep.equal([
                'Print',
                'Camera',
                'Console',
                'Heat',
            ])
        })
        cy.get('.shell-job__pause').should('be.visible')
        cy.get('.shell-while [data-action="speed"]').should('be.visible').click()
        cy.get('.v-dialog--active .shell-speed-flow').should('be.visible')
        cy.get('body').type('{esc}')

        section(':console').click()
        cy.get('.shell-view .shell-console textarea').should('be.visible')
        cy.get('.shell-while').should('not.be.visible')

        section(':camera').click()
        cy.get('.shell-view .shell-console').should('not.exist')
    })
})

describe('Small-screen shell: nothing scrolls', () => {
    const states: [string, string[], string][] = [
        ['idle', ['spool'], 'idle'],
        ['printing', ['spool', 'print'], 'printing'],
        ['error', ['spool', 'print', 'error'], 'error'],
    ]

    sizes.forEach(([width, height]) => {
        states.forEach(([name, seed, homeState]) => {
            it(`fits every section of every page on a ${width}x${height} screen while ${name}`, () => {
                cy.viewport(width, height)
                openShell('/', seed)
                cy.get('.shell-home').should('have.attr', 'data-state', homeState)

                pages.forEach((page) => everySectionFits(page))
            })
        })

        it(`fits a failed and a finished print on a ${width}x${height} screen`, () => {
            cy.viewport(width, height)
            openShell('/', ['spool', 'print', 'fail/heater'])
            headline().should('have.text', 'The print stopped with an error')
            everySectionFits('home')

            openShell('/', ['spool', 'print', 'finish'])
            headline().should('have.text', 'Your print is finished')
            everySectionFits('home')
        })
    })
})

describe('Small-screen shell: touch mode and the operator view', () => {
    it('uses the small-screen layout at any width in touch mode and leaves it with one tap', () => {
        openShell('/?kiosk=1')
        cy.get('.shell.shell--compact').should('be.visible')
        cy.get('.shell-rail__link').should('have.length', 6)
        cy.get('.shell-rail__search-icon').should('not.exist')

        cy.get('.shell-rail__leave').click()
        cy.get('.shell').should('not.have.class', 'shell--compact')
        cy.get('.shell-rail__leave').should('not.exist')
    })

    it('hides the pages and tabs the owner unticks', () => {
        openShell('/settings/kiosk?kiosk=1')
        noRawKeys()
        cy.contains('.kiosk-shell-page .v-label', 'Machine and files').click()
        cy.contains('.kiosk-shell-tabs .v-label', 'Resonance').click()

        cy.get('.shell-rail__link').should(($links) => {
            expect($links.toArray().map((link) => link.getAttribute('data-page'))).to.deep.equal([
                'home',
                'print',
                'tune',
                'fix',
                'settings',
            ])
        })
        nav('tune').click()
        section('move:move').should('exist')
        cy.get('.shell-sections__tab[data-entry^="resonance:"]').should('not.exist')
        section('limits:limits').should('exist')

        cy.visit('/machine/history')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        cy.location('pathname').should('eq', '/')
        cy.visit('/tune/resonance')
        cy.get('.shell-tune', { timeout: 15000 }).should('have.attr', 'data-tab', 'move')
    })

    it('asks for the pin before a restart, never before the emergency stop, and to open the settings', () => {
        cy.viewport(400, 850)
        openShell('/settings/kiosk?kiosk=1')
        chooseRule('restart', 'Require PIN')
        setPin(PIN)
        cy.contains('.kiosk-pin-honesty', 'not a security boundary')

        nav('fix').click()
        cy.get('.shell-fix [data-action="firmware-restart"]').click()
        cy.contains('.v-dialog--active button', 'Yes').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to restart, power off or update')
        enterPin('1111')
        cy.contains('.kiosk-pin-dialog', 'Wrong PIN')
        cy.get('.kiosk-pin-dialog__cancel').click()
        demoRequest('status').its('body').should('contain', 'klipper: ready')

        cy.get('.shell-rail__stop').click()
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
        nav('home').click()
        headline().should('have.text', 'The printer has shut down')

        nav('fix').click()
        cy.get('.shell-fix [data-action="firmware-restart"]').click()
        cy.contains('.v-dialog--active button', 'Yes').click()
        enterPin(PIN)
        nav('home').click()
        headline().should('have.text', 'Ready to print')

        nav('settings').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to open the settings')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.location('pathname').should('eq', '/')
        nav('settings').click()
        enterPin(PIN)
        cy.location('pathname').should('eq', '/settings')
        cy.get('.shell-settings__tab[data-tab="kiosk"]').click()
        cy.get('.settings-kiosk-tab').should('be.visible')
        cy.get('.kiosk-pin-dialog.v-dialog--active').should('not.exist')
    })

    it('guards the config files and blocks what the owner blocks', () => {
        openShell('/settings/kiosk?kiosk=1')
        chooseRule('deleteFile', 'Block')
        chooseRule('configEdit', 'Require PIN')
        setPin(PIN)

        nav('machine').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to edit the configuration')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.location('pathname').should('eq', '/settings/kiosk')

        nav('print').click()
        cy.contains('.v-data-table tr', 'benchy.gcode').rightclick()
        cy.contains('.v-menu__content .v-list-item', 'Delete').click()
        cy.contains('.v-dialog--active button', 'Delete').click()
        cy.contains('.v-toast', 'not available in touch mode')
        cy.contains('.v-data-table tr', 'benchy.gcode').should('exist')

        cy.get('.shell-rail__leave').click()
        cy.contains('.kiosk-pin-dialog', 'Enter the PIN to leave touch mode')
        cy.get('.kiosk-pin-dialog__cancel').click()
        cy.get('.shell').should('have.class', 'shell--compact')
        cy.get('.shell-rail__leave').click()
        enterPin(PIN)
        cy.get('.shell').should('not.have.class', 'shell--compact')
    })

    it('says how to recover when a small screen enters touch mode by itself, and recovers on a larger one', () => {
        openShell('/settings/kiosk')
        cy.get('.shell').should('not.have.class', 'shell--compact')
        cy.get('.kiosk-lockout-warning').should('not.exist')
        cy.get('.kiosk-small-screens').click()
        cy.contains('.kiosk-small-screens .v-list-item', 'Switch to touch mode automatically').click()
        setPin(PIN)
        cy.contains('.kiosk-lockout-warning', 'cannot leave touch mode without the PIN')

        openTouchScreen('/', 400, 850)
        cy.get('.shell-rail__leave').click()
        cy.get('.kiosk-pin-dialog__forgot').click()
        cy.contains('.kiosk-pin-dialog__recovery', 'enters touch mode by itself')
        cy.contains('.kiosk-pin-dialog__recovery', 'kiosk.pin')
        cy.get('.kiosk-pin-dialog__reset').should('not.exist')
        cy.get('.kiosk-pin-dialog').invoke('text').should('not.match', rawKey)

        cy.clearLocalStorage()
        openTouchScreen('/', 400, 850)
        cy.get('.shell-rail__leave').should('exist')

        openTouchScreen('/settings/kiosk', 1024, 768)
        cy.get('.shell-rail__leave').should('not.exist')
        cy.get('.kiosk-pin-set').click()
        cy.get('.kiosk-pin-dialog__forgot').click()
        cy.get('.kiosk-pin-dialog__reset').click()
        cy.contains('.kiosk-set-pin-dialog button', 'Cancel').click()
        cy.contains('.settings-kiosk-tab', 'No PIN set')
    })
})
