import { openShell } from './support'
import {
    HomeArrangement,
    HomeBlockId,
    HomeColumn,
    HomeLayoutState,
    blocksForState,
    checkArrangement,
    defaultHomeArrangement,
    listColumnChoices,
    requiredBlocks,
} from '../../src/plugins/shellHomeLayout'

const rawKey = /\b(Shell|Settings|Panels|App|CommandPalette|Dashboard)\.[A-Z]\w*\.\w+/
const mod = Cypress.platform === 'darwin' ? '{meta}' : '{ctrl}'

const headline = () => cy.get('.shell-header__title')
const noRawKeys = () => cy.get('.v-application').should(($app) => expect($app.text()).not.to.match(rawKey))
const menu = () => cy.get('.shell-home-menu')
const column = (number: number) => cy.get(`.shell-home [data-column="${number}"]`)
const blocksIn = (number: number, check: (ids: string[]) => void) =>
    column(number).should(($column) =>
        check(
            $column
                .find('[data-block]')
                .toArray()
                .map((block) => block.getAttribute('data-block') ?? '')
        )
    )
const tabsIn = (number: number, check: (ids: string[]) => void) =>
    column(number).should(($column) =>
        check(
            $column
                .find('[role="tab"]')
                .toArray()
                .map((tab) => tab.getAttribute('data-tab') ?? '')
        )
    )
const startEdit = () => {
    menu().click()
    cy.get('.menuable__content__active .shell-home-menu__edit').click()
    cy.get('.shell-home-editor')
}
const finishEdit = () => cy.get('.shell-home-editor__done').click()
const editState = (name: string) => cy.contains('.shell-home-editor__bar [role="tab"]', name).click()
const addBlock = (number: number, id: string) => {
    column(number).find('.shell-edit-col__add').click()
    cy.get(`.menuable__content__active [data-block="${id}"]`).click()
}
const editedBlocks = (number: number, check: (ids: string[]) => void) => blocksIn(number, check)
const switchTo = (name: string) => {
    menu().click()
    cy.contains('.menuable__content__active .shell-home-menu__layout', name).click()
    menu().should('contain', name)
}
const layoutRow = (name: string) => cy.contains('.layout-list__item', name)
const layoutNames = (check: (names: string[]) => void) =>
    cy
        .get('.layout-list__select .text-truncate')
        .should(($names) => check($names.toArray().map((name) => name.innerText.trim())))

// the large numerals of the heat block reach 2px below their line box, in the approved default as well
const INK_OVERFLOW = 2

const homeDoesNotScroll = () => {
    cy.window().should((win) => {
        const doc = win.document
        const shell = doc.querySelector('.shell') as HTMLElement
        const page = doc.querySelector('.shell__main > *') as HTMLElement

        expect(doc.documentElement.scrollHeight, 'document height').to.be.at.most(win.innerHeight)
        expect(doc.documentElement.scrollWidth, 'document width').to.be.at.most(win.innerWidth)
        expect(shell.scrollHeight, 'shell height').to.be.at.most(win.innerHeight)
        expect(page.getBoundingClientRect().bottom, 'page bottom').to.be.at.most(win.innerHeight + 1)

        doc.querySelectorAll<HTMLElement>('.sh-col:not(.sh-col--scroll)').forEach((element) => {
            const name = element.getAttribute('data-column') ?? element.className
            expect(element.scrollHeight, `column ${name}`).to.be.at.most(element.clientHeight + 1)
            expect(element.scrollWidth, `column ${name} width`).to.be.at.most(element.clientWidth + 1)
        })
        doc.querySelectorAll<HTMLElement>('.shell-block:not(.shell-block--scrolls)').forEach((block) => {
            const name = block.getAttribute('data-block')
            const slot = (block.closest('.shell-slot') as HTMLElement).getBoundingClientRect()

            expect(block.scrollHeight, `block ${name}`).to.be.at.most(block.clientHeight + INK_OVERFLOW)
            expect(block.getBoundingClientRect().bottom, `block ${name} bottom`).to.be.at.most(slot.bottom + 1)
            expect(block.clientHeight, `block ${name} is shown`).to.be.greaterThan(40)
        })
    })
}

const saveArrangement = (state: HomeLayoutState, columns: HomeArrangement) =>
    cy.window().then((win) => {
        const app = win.document.querySelector('#app') as unknown as {
            __vue__: { $store: { dispatch: (name: string, payload: unknown) => Promise<boolean> } }
        }

        return app.__vue__.$store.dispatch('gui/saveHomeArrangement', { state, columns })
    })

const arrangementWith = (state: HomeLayoutState, position: number, entry: HomeColumn): HomeArrangement => {
    const others = [
        ...requiredBlocks(state),
        ...blocksForState(state)
            .filter((block) => block.grows)
            .map((block) => block.id),
        ...blocksForState(state).map((block) => block.id),
    ].filter((id, index, list) => !entry.blocks.includes(id) && list.indexOf(id) === index)
    const columns: HomeArrangement = [0, 1, 2].map((index) =>
        index === position ? entry : { mode: 'split', blocks: [others.shift() as HomeBlockId] }
    )
    const missing = requiredBlocks(state).filter((id) => !columns.some((current) => current.blocks.includes(id)))
    expect(missing, 'required blocks have a column').to.deep.equal([])
    expect(checkArrangement(state, columns), JSON.stringify(columns)).to.equal(null)

    return columns
}

const tabGroups = (state: HomeLayoutState): HomeBlockId[][] => {
    const ids = blocksForState(state)
        .map((block) => block.id)
        .filter((id) => !requiredBlocks(state).includes(id))
    const groups: HomeBlockId[][] = []
    for (let start = 0; start < ids.length; start += 4) groups.push(ids.slice(start, start + 4))

    return groups.map((group) => (group.length > 1 ? group : [...group, ids[0]]))
}

const seeds: Record<HomeLayoutState, string[]> = {
    idle: ['spool'],
    printing: ['spool', 'print'],
    finished: ['spool', 'print', 'finish'],
    error: ['spool', 'print', 'fail/heater'],
}
describe('Home layouts: the approved default', () => {
    it('shows Home as before, with a quiet Customize menu', () => {
        openShell('/', ['spool'])
        menu().should('have.text', 'Customize')
        cy.get('.shell-home .shell-slot').should('not.exist')
        cy.get('.shell-home .sh-col').should('have.length', 3)
        cy.get('.shell-start__file').should('have.length', 5)
        cy.get('.shell-ready [data-action="home"]').should('be.visible')
        cy.get('.shell-last .shell-camera').should('be.visible')
        cy.get('.shell-last__again').should('be.visible')
        noRawKeys()

        menu().click()
        cy.get('.menuable__content__active .shell-home-menu__layout').should('have.length', 1)
        noRawKeys()
    })

    it('keeps the default while printing, with the four approved actions', () => {
        openShell('/', ['spool', 'print'])
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        cy.get('.shell-home .shell-slot').should('not.exist')
        cy.get('.shell-while .sh-btn').should(($buttons) =>
            expect($buttons.toArray().map((button) => button.getAttribute('data-action'))).to.deep.equal([
                'nudge',
                'speed',
                'filament',
                'queue',
            ])
        )
    })
})

describe('Home layouts: edit mode', () => {
    beforeEach(() => {
        openShell('/', ['spool'])
    })

    it('shows the default arrangement as slots and how much room each column uses', () => {
        startEdit()
        editedBlocks(1, (ids) => expect(ids).to.deep.equal(['start']))
        editedBlocks(2, (ids) => expect(ids).to.deep.equal(['ready']))
        editedBlocks(3, (ids) => expect(ids).to.deep.equal(['camera', 'spool', 'last']))
        cy.get('.shell-home-editor__reset').should('be.disabled')
        cy.get('.shell-edit-col__room').should('have.length', 3).first().should('contain', '%')
        homeDoesNotScroll()
        noRawKeys()

        editState('Printing')
        editedBlocks(1, (ids) => expect(ids).to.deep.equal(['job']))
        column(1).find('.shell-edit-block').should('contain', 'Always shown')
        column(1).find('.shell-edit-block__remove').should('not.exist')
        cy.get('.shell-edit-actions__action').should('have.length', 4)
        homeDoesNotScroll()
        noRawKeys()
    })

    it('adds a block as a stacked block when it fits and as a tab when it does not', () => {
        startEdit()
        addBlock(1, 'heat')
        column(1)
            .should('have.attr', 'data-column', '1')
            .find('[role="tab"][aria-selected="true"]')
            .should('contain', 'Stacked')

        addBlock(2, 'macros')
        column(2).find('[role="tab"]').should('have.length', 1).and('contain', 'Tabs')
        finishEdit()

        blocksIn(1, (ids) => expect(ids).to.deep.equal(['start', 'heat']))
        tabsIn(2, (ids) => expect(ids).to.deep.equal(['ready', 'macros']))
        blocksIn(2, (ids) => expect(ids).to.deep.equal(['ready']))
        column(2).find('[data-tab="macros"]').click()
        blocksIn(2, (ids) => expect(ids).to.deep.equal(['macros']))
        column(2).find('.shell-slot__head .sh-h2').should('have.text', 'Macros')
        column(2).find('.shell-block .sh-h2').should('not.be.visible')
        column(2).find('.shell-macros__all').should('be.visible')
        cy.contains('.shell-macros__macro', /load filament/i).should('be.visible')
        homeDoesNotScroll()
        noRawKeys()

        cy.reload()
        cy.get('.shell .shell-rail', { timeout: 15000 })
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['start', 'heat']))
    })

    it('does not offer a block that is on Home already and refuses what cannot fit', () => {
        startEdit()
        column(1).find('.shell-edit-col__add').click()
        cy.get('.menuable__content__active [data-block]').should(($options) =>
            expect($options.toArray().map((option) => option.getAttribute('data-block'))).to.deep.equal([
                'console',
                'heat',
                'macros',
            ])
        )
        cy.get('body').type('{esc}')

        editState('Printing')
        column(1).find('.shell-edit-col__add').click()
        cy.get('.menuable__content__active [data-block="macros"]')
            .should('have.class', 'v-list-item--disabled')
            .and('contain', 'No room in this column')
    })

    it('swaps a block from its menu, removes a block and resets the screen', () => {
        startEdit()
        column(2).find('.shell-edit-block__name').click()
        cy.get('.menuable__content__active [data-block="macros"]').click()
        editedBlocks(2, (ids) => expect(ids).to.deep.equal(['macros']))
        column(2).find('.shell-edit-block__remove').should('be.disabled')

        column(3).find('.shell-edit-block[data-block="spool"] .shell-edit-block__remove').click()
        editedBlocks(3, (ids) => expect(ids).to.deep.equal(['camera', 'last']))
        finishEdit()
        blocksIn(2, (ids) => expect(ids).to.deep.equal(['macros']))
        blocksIn(3, (ids) => expect(ids).to.deep.equal(['camera', 'last']))
        homeDoesNotScroll()

        startEdit()
        cy.get('.shell-home-editor__reset').click()
        cy.get('.v-dialog--active').should('contain', 'Put the Idle screen of "Default" back to the default?')
        cy.contains('.v-dialog--active .v-btn', 'Cancel').click()
        editedBlocks(2, (ids) => expect(ids).to.deep.equal(['macros']))
        cy.get('.shell-home-editor__reset').click()
        cy.contains('.v-dialog--active .v-btn', 'Reset this screen').click()
        editedBlocks(3, (ids) => expect(ids).to.deep.equal(['camera', 'spool', 'last']))
        cy.get('.shell-home-editor__reset').should('be.disabled')
        finishEdit()
        cy.get('.shell-home .shell-slot').should('not.exist')
        cy.get('.shell-ready').should('be.visible')
    })

    it('reorders the blocks of a column by dragging and switches between tabs and stacked', () => {
        startEdit()
        column(3)
            .find('.shell-edit-block[data-block="camera"]')
            .then(($target) => {
                const rect = $target[0].getBoundingClientRect()
                const pointer = { pointerType: 'mouse', force: true, scrollBehavior: false } as const
                const x = rect.left + rect.width / 2

                column(3)
                    .find('.shell-edit-block[data-block="last"] .shell-edit-block__handle')
                    .trigger('pointerdown', { button: 0, ...pointer })
                cy.get('body').trigger('pointermove', { clientX: x, clientY: rect.top + 30, ...pointer })
                cy.wait(100)
                cy.get('body').trigger('pointermove', { clientX: x, clientY: rect.top + 4, ...pointer })
                cy.wait(300)
                cy.get('body').trigger('pointerup', { clientX: x, clientY: rect.top + 4, ...pointer })
                cy.get('body').trigger('mouseup', {
                    clientX: x,
                    clientY: rect.top + 4,
                    force: true,
                    scrollBehavior: false,
                })
            })
        editedBlocks(3, (ids) => expect(ids).to.deep.equal(['last', 'camera', 'spool']))

        cy.contains('[data-column="3"] [role="tab"]', 'Tabs').click()
        finishEdit()
        tabsIn(3, (ids) => expect(ids).to.deep.equal(['last', 'camera', 'spool']))
        column(3).find('[data-tab="camera"]').click()
        column(3).find('.shell-camera img').should('be.visible')
        homeDoesNotScroll()
    })

    it('edits the printing Home while idle, with its own actions', () => {
        startEdit()
        editState('Printing')
        addBlock(2, 'macros')
        cy.get('.shell-edit-actions__action[data-position="1"]').click()
        cy.get('.menuable__content__active [data-action="macros"]').click()
        cy.get('.shell-edit-actions__action[data-position="3"]').click()
        cy.get('.menuable__content__active [data-action="queue"]').click()
        cy.get('.shell-edit-actions__action').should(($buttons) =>
            expect($buttons.toArray().map((button) => button.innerText.trim())).to.deep.equal([
                'Run a macro',
                'Speed and flow',
                'Queue next print',
                'Change filament',
            ])
        )
        finishEdit()
        cy.get('.shell-home .shell-slot').should('not.exist')

        cy.request(`${Cypress.env('demoUrl')}/print`)
        cy.get('.shell-home').should('have.attr', 'data-state', 'printing')
        tabsIn(2, (ids) => expect(ids).to.deep.equal(['camera', 'console', 'macros']))
        cy.get('.shell-job__pause').should('be.visible')
        cy.get('.shell-while .sh-btn').should(($buttons) =>
            expect($buttons.toArray().map((button) => button.getAttribute('data-action'))).to.deep.equal([
                'macros',
                'speed',
                'queue',
                'filament',
            ])
        )
        homeDoesNotScroll()

        cy.get('.shell-while [data-action="speed"]').click()
        cy.get('.v-dialog--active').should('contain', 'Speed factor')
        cy.get('body').type('{esc}')
        cy.get('.shell-while [data-action="macros"]').click()
        cy.location('pathname').should('eq', '/tune/macros')
    })
})

describe('Home layouts: named layouts', () => {
    it('saves, switches, renames, duplicates and deletes layouts in the settings', () => {
        openShell('/settings/home')
        noRawKeys()
        layoutNames((names) => expect(names).to.deep.equal(['Default']))
        layoutRow('Default').find('.layout-list__delete').should('be.disabled')

        cy.get('.layout-list__new').click()
        cy.get('.layout-name-dialog input').type('Workshop{enter}')
        layoutNames((names) => expect(names).to.deep.equal(['Default', 'Workshop']))
        layoutRow('Workshop').should('have.class', 'layout-list__item--active')

        cy.get('.home-settings__edit').click()
        cy.location('pathname').should('eq', '/')
        cy.get('.shell-home-editor__title').should('contain', 'Workshop')
        addBlock(1, 'heat')
        finishEdit()
        menu().should('contain', 'Workshop')
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['start', 'heat']))

        switchTo('Default')
        cy.get('.shell-home .shell-slot').should('not.exist')
        switchTo('Workshop')
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['start', 'heat']))

        menu().click()
        cy.get('.menuable__content__active .shell-home-menu__manage').click()
        cy.location('pathname').should('eq', '/settings/home')
        layoutRow('Workshop').find('.layout-list__rename').click()
        cy.get('.layout-name-dialog input').clear().type('default{enter}')
        layoutNames((names) => expect(names).to.deep.equal(['Default', 'default 2']))
        layoutRow('default 2').find('.layout-list__rename').click()
        cy.get('.layout-name-dialog input').clear().type('Bench{enter}')
        layoutRow('Bench').find('.layout-list__duplicate').click()
        cy.get('.layout-name-dialog input').should('have.value', 'Bench copy').type('{enter}')
        layoutNames((names) => expect(names).to.deep.equal(['Default', 'Bench', 'Bench copy']))
        layoutRow('Bench').should('have.class', 'layout-list__item--active')

        layoutRow('Bench').find('.layout-list__delete').click()
        cy.get('.layout-list__delete-dialog').should('be.visible').type('{esc}')
        cy.get('.layout-list__delete-dialog').should('not.exist')
        layoutNames((names) => expect(names).to.deep.equal(['Default', 'Bench', 'Bench copy']))
        layoutRow('Bench').find('.layout-list__delete').click()
        cy.contains('.layout-list__delete-dialog button', 'Delete').click()
        layoutNames((names) => expect(names).to.deep.equal(['Default', 'Bench copy']))
        layoutRow('Bench copy').should('have.class', 'layout-list__item--active')

        cy.visit('/')
        cy.get('.shell .shell-rail', { timeout: 15000 })
        menu().should('contain', 'Bench copy')
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['start', 'heat']))
    })

    it('exports a layout and imports it again', () => {
        openShell('/', ['home-layouts/named'])
        switchTo('Workshop')
        cy.visit('/settings/home')
        layoutRow('Workshop').find('.layout-list__export').click()
        cy.readFile('dist-demo/downloads/mainsail-home-workshop.json').then((file) => {
            expect(file.format).to.equal('mainsail-home-layout')
            expect(file.layout.actions).to.deep.equal(['temperatures', 'speed', 'macros', 'console'])
        })

        cy.get('.home-settings input[type=file]').selectFile('dist-demo/downloads/mainsail-home-workshop.json', {
            force: true,
        })
        cy.contains('.v-toast', 'imported')
        layoutNames((names) => expect(names).to.deep.equal(['Everyday', 'Workshop', 'At a glance', 'Workshop 2']))
        layoutRow('Workshop 2').should('have.class', 'layout-list__item--active')
    })

    it('refuses a file that is not a valid Home layout', () => {
        openShell('/settings/home')
        const select = (contents: unknown) =>
            cy
                .get('.home-settings input[type=file]')
                .selectFile(
                    { contents: Cypress.Buffer.from(JSON.stringify(contents)), fileName: 'layout.json' },
                    { force: true }
                )
        const column = (...blocks: string[]) => ({ mode: 'split', blocks })
        const states = {
            idle: [column('start'), column('ready', 'spool'), column('camera')],
            printing: [column('job'), column('camera'), column('heat')],
            finished: [column('job'), column('camera'), column('heat')],
            error: [column('problem'), column('camera'), column('heat')],
        }

        select({ format: 'mainsail-dashboard-layout', version: 1, name: 'Classic', layout: {} })
        cy.contains('.v-toast', 'not a Mainsail Home layout')

        select({
            format: 'mainsail-home-layout',
            version: 1,
            name: 'Scrolls',
            layout: { states, actions: ['nudge', 'speed', 'filament', 'queue'] },
        })
        cy.contains('.v-toast', 'an arrangement is not valid (idle: too-tall)')
        layoutNames((names) => expect(names).to.deep.equal(['Default']))
    })

    it('switches layouts from the command palette and opens the editor from it', () => {
        openShell('/tune/move', ['home-layouts/named'])
        cy.get('body').type(`${mod}k`)
        cy.get('.v-dialog--active.command-palette .command-palette__input').type('At a glance')
        cy.contains('.v-dialog--active.command-palette .command-palette-row--selected', 'Home layout: At a glance')
        cy.get('.v-dialog--active.command-palette .command-palette__input').type('{enter}')
        cy.location('pathname').should('eq', '/')
        menu().should('contain', 'At a glance')
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['camera']))
        homeDoesNotScroll()

        cy.get('body').type(`${mod}k`)
        cy.get('.v-dialog--active.command-palette .command-palette__input').type('Edit Home')
        cy.contains('.v-dialog--active.command-palette .command-palette-row--selected', 'Edit Home')
        cy.get('.v-dialog--active.command-palette .command-palette__input').type('{enter}')
        cy.get('.shell-home-editor__title').should('contain', 'At a glance')

        cy.get('body').type(`${mod}k`)
        cy.get('.v-dialog--active.command-palette .command-palette__input').type('Dashboard layout')
        cy.get('.v-dialog--active.command-palette').should('not.contain', 'Dashboard layout:')
    })

    it('changes the actions below a print and hides the menu in the settings', () => {
        openShell('/settings/home', ['spool', 'print'])
        cy.get('.home-settings__action').eq(1).find('.v-select__slot').click()
        cy.contains('.menuable__content__active .v-list-item', 'Open the console').click()
        cy.get('.home-settings__show-menu .v-input--selection-controls__ripple').click()

        cy.get('.shell-rail [data-page="home"]').click()
        cy.get('.shell-while .sh-btn').should(($buttons) =>
            expect($buttons.toArray().map((button) => button.getAttribute('data-action'))).to.deep.equal([
                'nudge',
                'console',
                'filament',
                'queue',
            ])
        )
        cy.get('.shell-home-menu').should('not.exist')
        cy.get('.shell-job__pause').should('be.visible')
        homeDoesNotScroll()
    })

    it('reloads instead of saving when another window switched the layout', () => {
        openShell('/', ['spool', 'home-layouts/named'])
        switchTo('Workshop')
        cy.request(`${Cypress.env('demoUrl')}/home-layouts/named`)

        startEdit()
        cy.get('.shell-home-editor__title').should('contain', 'Workshop')
        addBlock(1, 'spool')
        cy.contains('.v-toast', 'switched in another window')
        cy.get('.shell-home-editor__title').should('contain', 'Everyday')
        editedBlocks(1, (ids) => expect(ids).to.deep.equal(['start']))
        finishEdit()

        switchTo('Workshop')
        blocksIn(1, (ids) => expect(ids).to.deep.equal(['ready']))
    })

    it('repairs corrupt stored layouts and turns a stored split that cannot fit into tabs', () => {
        openShell('/', ['spool', 'home-layouts/corrupt'])
        headline().should('have.text', 'Ready to print')
        menu().should('contain', 'Kept')
        cy.get('.shell-home .shell-slot').should('not.exist')

        switchTo('Too tall')
        tabsIn(2, (ids) => expect(ids).to.deep.equal(['ready', 'spool', 'heat']))
        blocksIn(3, (ids) => expect(ids).to.deep.equal(['camera']))
        homeDoesNotScroll()
    })

    it('keeps the classic dashboard settings apart from the Home layouts', () => {
        openShell('/settings/home')
        cy.get('.shell-settings__tabs [data-tab="home"]').should('contain', 'Home layouts')
        cy.get('.home-settings').should('not.contain', 'Adapt layout to printer state')

        cy.get('.shell-settings__tabs [data-tab="dashboard"]').click()
        cy.get('.dashboard-classic-note').should('contain', 'classic interface').find('a').click()
        cy.location('pathname').should('eq', '/settings/home')
        cy.get('.home-settings').should('be.visible')
    })
})

describe('Home layouts: nothing scrolls, whatever is chosen', () => {
    const sizes: [number, number][] = [
        [1280, 720],
        [1440, 900],
    ]
    const states: HomeLayoutState[] = ['idle', 'printing', 'finished', 'error']

    sizes.forEach(([width, height]) => {
        states.forEach((state) => {
            it(`fits every stacked column the editor allows in a ${width}x${height} window while ${state}`, () => {
                cy.viewport(width, height)
                openShell('/', seeds[state])
                cy.get('.shell-home').should('have.attr', 'data-state', state)

                const choices = listColumnChoices(state, 'split')
                expect(choices.length).to.be.greaterThan(3)
                choices.forEach((blocks) => {
                    ;[0, 1, 2].forEach((position) => {
                        saveArrangement(state, arrangementWith(state, position, { mode: 'split', blocks }))
                        blocksIn(position + 1, (ids) => expect(ids).to.deep.equal(blocks))
                        homeDoesNotScroll()
                    })
                })
            })

            it(`fits every block as a tab in a ${width}x${height} window while ${state}`, () => {
                cy.viewport(width, height)
                openShell('/', seeds[state])
                cy.get('.shell-home').should('have.attr', 'data-state', state)

                tabGroups(state).forEach((blocks) => {
                    ;[0, 1, 2].forEach((position) => {
                        saveArrangement(state, arrangementWith(state, position, { mode: 'tabs', blocks }))
                        blocks.forEach((id) => {
                            column(position + 1)
                                .find(`[data-tab="${id}"]`)
                                .click()
                            blocksIn(position + 1, (ids) => expect(ids).to.deep.equal([id]))
                            homeDoesNotScroll()
                        })
                    })
                })
            })

            it(`fits every block alone in a column in a ${width}x${height} window while ${state}`, () => {
                cy.viewport(width, height)
                openShell('/', seeds[state])
                cy.get('.shell-home').should('have.attr', 'data-state', state)

                blocksForState(state).forEach((block) => {
                    ;[0, 1, 2].forEach((position) => {
                        saveArrangement(state, arrangementWith(state, position, { mode: 'split', blocks: [block.id] }))
                        blocksIn(position + 1, (ids) => expect(ids).to.deep.equal([block.id]))
                        homeDoesNotScroll()
                    })
                })
            })
        })
    })

    it('keeps the approved default out of the slot renderer in every state', () => {
        states.forEach((state) => expect(checkArrangement(state, defaultHomeArrangement(state))).to.equal(null))
    })
})
