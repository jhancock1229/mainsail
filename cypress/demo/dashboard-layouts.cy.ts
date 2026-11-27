import { columnPanels, demo, openDashboard, openDashboardSettings } from './support'

const mod = Cypress.platform === 'darwin' ? '{meta}' : '{ctrl}'

const switcher = () => cy.get('.dashboard-layout-bar__switcher')
const columns = () => cy.get('.v-main .dashboard-column')
const slot = (name: string) => cy.get(`.dashboard-slot[data-panel="${name}"]`)
const startEdit = () => cy.get('.dashboard-layout-bar__edit').click()
const finishEdit = () => cy.get('.dashboard-layout-editor__done').click()
const noRawKeys = (selector: string) =>
    cy
        .get(selector)
        .invoke('text')
        .should('not.match', /Dashboard\.Layouts|Settings\.DashboardTab|Buttons\./)
const switchTo = (name: string) => {
    switcher().click()
    cy.contains('.menuable__content__active .dashboard-layout-menu__layout', name).click()
    switcher().should('contain', name)
}
const saveAs = (name: string) => {
    switcher().click()
    cy.contains('.menuable__content__active .v-list-item', 'Save as new layout').click()
    cy.get('.layout-name-dialog input').type(`${name}{enter}`)
    switcher().should('contain', name)
}
const openSeeded = (seed: string) => {
    demo('reset')
    demo(`layouts/${seed}`)
    cy.visit('/')
    cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
}
const layoutRow = (name: string) => cy.contains('.v-dialog--active .layout-list__item', name)
const layoutNames = (check: (names: string[]) => void) =>
    cy
        .get('.v-dialog--active .layout-list__select .text-truncate')
        .should(($names) => check($names.toArray().map((name) => name.innerText.trim())))
const columnWidths = (check: (widths: number[]) => void) =>
    columns().should(($columns) => {
        const total = $columns.toArray().reduce((sum, column) => sum + column.getBoundingClientRect().width, 0)
        check($columns.toArray().map((column) => Math.round((column.getBoundingClientRect().width / total) * 100)))
    })

// SortableJS in fallback mode follows pointer events and looks up the element below the pointer, so both
// panels have to be inside the window and the page must not scroll in between
const dragPanelOnto = (name: string, target: string) => {
    const pointer = { pointerType: 'mouse', force: true, scrollBehavior: false } as const

    cy.window().then((win) => win.scrollTo(0, 0))
    slot(name)
        .find('.dashboard-slot__handle')
        .trigger('pointerdown', { button: 0, ...pointer })
    slot(target).then(($target) => {
        const rect = $target[0].getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + 6

        cy.get('body').trigger('pointermove', { clientX: x, clientY: y + 30, ...pointer })
        cy.wait(100)
        cy.get('body').trigger('pointermove', { clientX: x, clientY: y, ...pointer })
        cy.wait(300)
        cy.get('body').trigger('pointerup', { clientX: x, clientY: y, ...pointer })
        cy.get('body').trigger('mouseup', { clientX: x, clientY: y, force: true, scrollBehavior: false })
    })
}

describe('Dashboard layouts', () => {
    describe('with default settings', () => {
        beforeEach(() => {
            openDashboard()
        })

        it('shows the stored arrangement as the only layout', () => {
            switcher().should('contain', 'Default')
            columns().should('have.length', 2)
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures', 'Console']))
            noRawKeys('.v-main')

            switcher().click()
            cy.get('.menuable__content__active .dashboard-layout-menu__layout').should('have.length', 1)
            noRawKeys('.menuable__content__active')
        })

        it('saves a named layout, keeps each arrangement and remembers the active one', () => {
            saveAs('Calibration')

            startEdit()
            noRawKeys('.v-main')
            slot('extruder-control').find('.dashboard-slot__visibility').click()
            finishEdit()
            columnPanels(1, (titles) => expect(titles).not.to.include('Extruder'))

            switchTo('Default')
            columnPanels(1, (titles) => expect(titles).to.include('Extruder'))

            switchTo('Calibration')
            columnPanels(1, (titles) => expect(titles).not.to.include('Extruder'))

            cy.reload()
            cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
            switcher().should('contain', 'Calibration')
            columnPanels(1, (titles) => expect(titles).not.to.include('Extruder'))
        })

        it('hides and shows panels in edit mode', () => {
            startEdit()
            slot('toolhead-control').find('.dashboard-slot__visibility').click()
            slot('toolhead-control').should('have.class', 'dashboard-slot--hidden')
            slot('toolhead-control').find('.panel').should('not.exist')
            finishEdit()
            columnPanels(1, (titles) => expect(titles).not.to.include('Toolhead'))

            startEdit()
            slot('toolhead-control').find('.dashboard-slot__visibility').click()
            finishEdit()
            columnPanels(1, (titles) => expect(titles).to.include('Toolhead'))
        })

        it('moves a panel within a column and into another column by dragging', () => {
            startEdit()
            dragPanelOnto('miniconsole', 'temperature')
            finishEdit()
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Console', 'Temperatures']))

            startEdit()
            dragPanelOnto('miniconsole', 'webcam')
            finishEdit()
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures']))
            columnPanels(1, (titles) => expect(titles.indexOf('Console')).to.equal(titles.indexOf('Webcam') - 1))
        })

        it('changes the size of a panel', () => {
            let normalHeight = 0
            slot('miniconsole')
                .find('.panel')
                .then(($panel) => (normalHeight = $panel[0].getBoundingClientRect().height))

            startEdit()
            slot('miniconsole').find('.dashboard-slot__density').should('contain', 'Normal').click()
            slot('miniconsole').find('.dashboard-slot__density').should('contain', 'Expanded')
            slot('miniconsole')
                .find('.panel')
                .should(($panel) =>
                    expect($panel[0].getBoundingClientRect().height).to.be.greaterThan(normalHeight + 100)
                )

            slot('miniconsole').find('.dashboard-slot__density').click()
            slot('miniconsole').find('.dashboard-slot__density').should('contain', 'Compact')
            finishEdit()
            slot('miniconsole')
                .find('.panel')
                .should(($panel) => expect($panel[0].getBoundingClientRect().height).to.be.lessThan(normalHeight - 50))

            startEdit()
            slot('macros').find('.dashboard-slot__density').click()
            finishEdit()
            slot('macros')
                .find('.panel')
                .should(($panel) => expect($panel[0].getBoundingClientRect().height).to.be.lessThan(300))
            slot('macros').find('.panel .v-btn').first().should('be.visible')
        })

        it('changes the number of columns and their widths', () => {
            columnWidths((widths) => expect(widths).to.deep.equal([42, 58]))

            startEdit()
            cy.get('.dashboard-layout-editor .column-widths__divider').first().focus().type('{rightarrow}{rightarrow}')
            columnWidths((widths) => expect(widths).to.deep.equal([50, 50]))

            cy.get('.dashboard-layout-editor .column-controls__more').click()
            columns().should('have.length', 3)
            columns().eq(2).find('.dashboard-slot').should('not.exist')
            cy.get('.dashboard-layout-editor .column-controls__more').should('be.disabled')
            finishEdit()

            cy.reload()
            cy.contains('.panel-toolbar', 'Standby', { timeout: 15000 })
            columns().should('have.length', 3)

            startEdit()
            cy.get('.dashboard-layout-editor .column-controls__fewer').click().click()
            columns().should('have.length', 1)
            finishEdit()
            columnPanels(1, (titles) => {
                expect(titles).to.include.members(['Toolhead', 'Temperatures', 'Console'])
                expect(new Set(titles).size).to.equal(titles.length)
            })
        })

        it('resizes the columns by dragging the divider', () => {
            startEdit()
            cy.get('.dashboard-layout-editor .column-widths').then(($strip) => {
                const rect = $strip[0].getBoundingClientRect()
                const y = rect.top + rect.height / 2

                cy.get('.dashboard-layout-editor .column-widths__divider')
                    .first()
                    .trigger('pointerdown', { clientX: rect.left + rect.width * 0.42, clientY: y, button: 0 })
                cy.window().trigger('pointermove', { clientX: rect.left + rect.width * 0.67, clientY: y })
                columnWidths((widths) => expect(widths).to.deep.equal([67, 33]))
                cy.window().trigger('pointerup', { clientX: rect.left + rect.width * 0.67, clientY: y })
            })
            finishEdit()
            columnWidths((widths) => expect(widths).to.deep.equal([67, 33]))
        })

        it('edits the printing layout while the printer is idle', () => {
            startEdit()
            cy.contains('.dashboard-layout-editor__states button', 'Printing').click()
            cy.contains('.dashboard-layout-editor', 'Follows the idle layout')
            slot('toolhead-control').find('.dashboard-slot__visibility').click()
            cy.contains('.dashboard-layout-editor', 'Customized for this printer state')
            finishEdit()
            columnPanels(1, (titles) => expect(titles).to.include('Toolhead'))

            demo('print')
            cy.contains('.panel-toolbar', 'Printing')
            columnPanels(1, (titles) => expect(titles).not.to.include('Toolhead'))

            startEdit()
            cy.get('.dashboard-layout-editor__states .v-btn--active').should('contain', 'Printing')
            cy.get('.dashboard-layout-editor__reset').click()
            finishEdit()
            columnPanels(1, (titles) => expect(titles).to.include('Toolhead'))
        })

        it('renames, duplicates and deletes layouts in the settings', () => {
            openDashboardSettings()
            noRawKeys('.v-dialog--active')
            layoutRow('Default').find('.layout-list__delete').should('be.disabled')

            layoutRow('Default').find('.layout-list__rename').click()
            cy.get('.layout-name-dialog input').clear().type('Everyday{enter}')
            layoutNames((names) => expect(names).to.deep.equal(['Everyday']))

            layoutRow('Everyday').find('.layout-list__duplicate').click()
            cy.get('.layout-name-dialog input').should('have.value', 'Everyday copy')
            cy.get('.layout-name-dialog input').clear().type('Farm glance{enter}')
            layoutNames((names) => expect(names).to.deep.equal(['Everyday', 'Farm glance']))
            layoutRow('Everyday').should('have.class', 'layout-list__item--active')

            layoutRow('Farm glance').find('.layout-list__select').click()
            layoutRow('Farm glance').should('have.class', 'layout-list__item--active')

            layoutRow('Farm glance').find('.layout-list__delete').click()
            cy.contains('.layout-list__delete-dialog button', 'Delete').click()
            layoutNames((names) => expect(names).to.deep.equal(['Everyday']))
            layoutRow('Everyday').should('have.class', 'layout-list__item--active')
            cy.get('body').type('{esc}')
            switcher().should('contain', 'Everyday')
        })

        it('exports a layout and imports it again', () => {
            startEdit()
            slot('extruder-control').find('.dashboard-slot__visibility').click()
            slot('miniconsole').find('.dashboard-slot__density').click()
            finishEdit()

            openDashboardSettings()
            layoutRow('Default').find('.layout-list__export').click()
            cy.readFile('dist-demo/downloads/mainsail-layout-default.json').then((file) => {
                expect(file.format).to.equal('mainsail-dashboard-layout')
                expect(file.layout.density).to.deep.equal({ miniconsole: 'expanded' })
            })

            cy.contains('.v-dialog--active button', 'Reset Layout').click()
            cy.get('.v-dialog--active input[type=file]').selectFile(
                'dist-demo/downloads/mainsail-layout-default.json',
                {
                    force: true,
                }
            )
            cy.contains('.v-toast', 'imported')
            layoutNames((names) => expect(names).to.deep.equal(['Default', 'Default 2']))
            layoutRow('Default 2').should('have.class', 'layout-list__item--active')
            cy.contains('.v-dialog--active .settings-row-title', 'Layouts').click()
            cy.get('body').type('{esc}')

            columnPanels(1, (titles) => expect(titles).not.to.include('Extruder'))
            slot('miniconsole').should('have.attr', 'data-density', 'expanded')
            switchTo('Default')
            columnPanels(1, (titles) => expect(titles).to.include('Extruder'))
        })

        it('refuses a file that is not a valid layout', () => {
            openDashboardSettings()
            const select = (contents: unknown) =>
                cy
                    .get('.v-dialog--active input[type=file]')
                    .selectFile(
                        { contents: Cypress.Buffer.from(JSON.stringify(contents)), fileName: 'layout.json' },
                        { force: true }
                    )

            select({ hello: 'world' })
            cy.contains('.v-toast', 'not a Mainsail dashboard layout')

            select({
                format: 'mainsail-dashboard-layout',
                version: 1,
                name: 'Bad',
                layout: {
                    panels: { desktopLayout1: [{ name: 'evil-panel', visible: true }] },
                    stateLayouts: {},
                    columns: {},
                    density: {},
                },
            })
            cy.contains('.v-toast', 'the panel "evil-panel" is unknown')
            noRawKeys('.v-toast')
            layoutNames((names) => expect(names).to.deep.equal(['Default']))
        })

        it('changes columns and panel sizes in the settings too', () => {
            openDashboardSettings()
            cy.get('.v-dialog--active .dashboard-columns-row .column-controls__more').click()
            cy.get('.v-dialog--active .dashboard-rows-container .v-card.mx-auto').should('have.length', 3)
            cy.contains('.v-dialog--active .v-list-item', 'Console').find('.sortable-item__density').click()
            cy.get('body').type('{esc}')

            columns().should('have.length', 3)
            slot('miniconsole').should('have.attr', 'data-density', 'expanded')
        })

        it('hides the layout bar when it is switched off', () => {
            openDashboardSettings()
            cy.get('.v-dialog--active .dashboard-layouts__show-bar .v-input--selection-controls__ripple').click()
            cy.get('body').type('{esc}')

            cy.get('.dashboard-layout-bar').should('not.exist')
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures', 'Console']))
        })
    })

    describe('with stored settings', () => {
        it('loads an arrangement from before named layouts unchanged', () => {
            openSeeded('legacy')

            switcher().should('contain', 'Default')
            columnPanels(1, (titles) => expect(titles.slice(1)).to.deep.equal(['Temperatures', 'Macros']))
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Toolhead', 'Extruder', 'Webcam', 'Console']))

            demo('print')
            cy.contains('.panel-toolbar', 'Printing')
            columnPanels(1, (titles) => expect(titles.slice(1)).to.deep.equal(['Temperatures']))
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Console']))
        })

        it('switches between stored layouts, from the dashboard and from the command palette', () => {
            openSeeded('named')

            switcher().should('contain', 'Everyday')
            columns().should('have.length', 2)

            switchTo('Calibration')
            columns().should('have.length', 3)
            columnPanels(3, (titles) => expect(titles).to.deep.equal(['Macros', 'Machine']))
            slot('miniconsole').should('have.attr', 'data-density', 'expanded')

            cy.get('body').type(`${mod}k`)
            cy.get('.v-dialog--active.command-palette .command-palette__input').type('Farm glance')
            cy.contains(
                '.v-dialog--active.command-palette .command-palette-row--selected',
                'Dashboard layout: Farm glance'
            )
            cy.get('.v-dialog--active.command-palette .command-palette__input').type('{enter}')
            switcher().should('contain', 'Farm glance')
            columns().should('have.length', 2)
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures']))

            switchTo('Everyday')
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures', 'Console']))
        })

        it('reloads instead of saving when another window switched the layout', () => {
            openSeeded('named')
            switchTo('Calibration')
            columns().should('have.length', 3)
            demo('layouts/named')

            startEdit()
            slot('toolhead-control').find('.dashboard-slot__visibility').click()
            cy.contains('.v-toast', 'switched in another window')
            columns().should('have.length', 2)
            finishEdit()
            switcher().should('contain', 'Everyday')
            columnPanels(1, (titles) => expect(titles).to.include('Toolhead'))
        })

        it('survives corrupt layout settings', () => {
            openSeeded('corrupt')

            switcher().should('contain', 'Kept')
            columns().should('have.length', 3)
            columnPanels(1, (titles) => expect(titles).to.include('Macros'))
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures']))

            switchTo('Broken')
            columns().should('have.length', 2)
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures', 'Console']))

            switchTo('Kept')
            columnPanels(2, (titles) => expect(titles).to.deep.equal(['Temperatures']))
        })
    })
})
