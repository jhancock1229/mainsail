import { describe, expect, it } from 'vitest'
import {
    HOME_SPLIT_GAP,
    HOME_TAB_BAR_HEIGHT,
    HomeArrangement,
    HomeBlockId,
    HomeLayoutState,
    addBlock,
    blocksForState,
    checkArrangement,
    checkColumn,
    columnBudget,
    columnHeight,
    defaultHomeArrangement,
    defaultHomeLayout,
    defaultWhileActions,
    getHomeBlock,
    homeBlocks,
    homeLayoutFilename,
    homeLayoutStateFor,
    homeLayoutStates,
    isDefaultArrangement,
    listColumnChoices,
    normalizeArrangement,
    normalizeHomeLayout,
    normalizeWhileActions,
    parseHomeLayoutImport,
    removeBlock,
    reorderBlocks,
    replaceBlock,
    requiredBlocks,
    resolveHomeLayouts,
    serializeHomeLayout,
    setColumnMode,
    unusedBlocks,
    whileActionTargets,
    whileActions,
} from '@/plugins/shellHomeLayout'
import {
    MAX_FEATURE_CLICKS,
    featureClicks,
    featurePath,
    findShellFeature,
    getShellPage,
    settingsTabNames,
    shellOnlySettingsTabNames,
    shellPages,
} from '@/plugins/shellNavigation'
import { buildShellSettingsTabs } from '@/components/shell/settingsTabs'

const names = (columns: HomeArrangement | null): HomeBlockId[][] => (columns ?? []).map((column) => column.blocks)

describe('the approved default Home', () => {
    it('shows what the shell showed before Home could be arranged', () => {
        expect(defaultHomeArrangement('idle')).toEqual([
            { mode: 'split', blocks: ['start'] },
            { mode: 'split', blocks: ['ready'] },
            { mode: 'split', blocks: ['camera', 'spool', 'last'] },
        ])
        expect(defaultHomeArrangement('printing')).toEqual([
            { mode: 'split', blocks: ['job'] },
            { mode: 'tabs', blocks: ['camera', 'console'] },
            { mode: 'split', blocks: ['heat', 'spool', 'events'] },
        ])
        expect(defaultHomeArrangement('finished')).toEqual(defaultHomeArrangement('printing'))
        expect(defaultHomeArrangement('error')).toEqual([
            { mode: 'split', blocks: ['problem'] },
            { mode: 'tabs', blocks: ['console', 'camera'] },
            { mode: 'split', blocks: ['heat', 'events'] },
        ])
        expect(defaultWhileActions).toEqual(['nudge', 'speed', 'filament', 'queue'])
    })

    it('is valid in every state and fits without scrolling', () => {
        homeLayoutStates.forEach((state) => {
            expect(checkArrangement(state, defaultHomeArrangement(state)), state).toBeNull()
            expect(isDefaultArrangement(state, defaultHomeArrangement(state))).toBe(true)
        })
    })

    it('uses the printing arrangement while the print is paused', () => {
        expect(homeLayoutStateFor('paused')).toBe('printing')
        expect(homeLayoutStateFor('finished')).toBe('finished')
        expect(homeLayoutStateFor('nonsense')).toBe('idle')
    })
})

describe('the block catalogue', () => {
    it('offers every block in at least one state and none that is taller than a column', () => {
        homeBlocks.forEach((block) => {
            expect(block.states.length, block.id).toBeGreaterThan(0)
            block.states.forEach((state) => expect(block.height, block.id).toBeLessThanOrEqual(columnBudget(state)))
        })
    })

    it('keeps the controls a state cannot do without', () => {
        expect(requiredBlocks('printing')).toEqual(['job'])
        expect(requiredBlocks('finished')).toEqual(['job'])
        expect(requiredBlocks('error')).toEqual(['problem'])
        expect(requiredBlocks('idle')).toEqual([])
    })

    it('only offers a block where it has something to show', () => {
        const ids = (state: HomeLayoutState) => blocksForState(state).map((block) => block.id)

        expect(ids('idle')).not.toContain('job')
        expect(ids('printing')).not.toContain('start')
        expect(ids('error')).toContain('problem')
        expect(ids('idle')).toEqual(expect.arrayContaining(['camera', 'console', 'heat', 'spool', 'macros']))
    })
})

describe('the height of a column', () => {
    it('is the height of its only block', () => {
        expect(columnHeight({ mode: 'split', blocks: ['heat'] })).toBe(getHomeBlock('heat').height)
        expect(columnHeight({ mode: 'tabs', blocks: ['heat'] })).toBe(getHomeBlock('heat').height)
    })

    it('adds up the blocks of a split and the rules between them', () => {
        expect(columnHeight({ mode: 'split', blocks: ['heat', 'spool'] })).toBe(
            getHomeBlock('heat').height + getHomeBlock('spool').height + HOME_SPLIT_GAP
        )
    })

    it('is the tallest tab plus the tab bar', () => {
        expect(columnHeight({ mode: 'tabs', blocks: ['heat', 'console', 'events'] })).toBe(
            HOME_TAB_BAR_HEIGHT + getHomeBlock('console').height
        )
    })

    it('has less room while the action row is shown', () => {
        expect(columnBudget('printing')).toBeLessThan(columnBudget('idle'))
        expect(columnBudget('finished')).toBe(columnBudget('idle'))
    })
})

describe('checkColumn', () => {
    it('rejects a split that cannot fit at 1280x720', () => {
        expect(checkColumn('idle', { mode: 'split', blocks: ['ready', 'spool'] })).toBe('too-tall')
        expect(checkColumn('idle', { mode: 'tabs', blocks: ['ready', 'spool'] })).toBeNull()
    })

    it('judges the same split by the room of the state', () => {
        const blocks: HomeBlockId[] = ['camera', 'heat', 'spool']

        expect(checkColumn('idle', { mode: 'split', blocks })).toBeNull()
        expect(checkColumn('printing', { mode: 'split', blocks })).toBe('too-tall')
    })

    it('rejects empty, overfull and unknown columns', () => {
        expect(checkColumn('idle', { mode: 'split', blocks: [] })).toBe('empty')
        expect(
            checkColumn('idle', { mode: 'tabs', blocks: ['camera', 'console', 'heat', 'spool', 'macros', 'last'] })
        ).toBe('too-many')
        expect(checkColumn('idle', { mode: 'tabs', blocks: ['webcam' as HomeBlockId] })).toBe('unknown-block')
        expect(checkColumn('idle', { mode: 'split', blocks: ['job'] })).toBe('not-in-state')
    })

    it('never hides the controls of a print or of an error behind a tab', () => {
        expect(checkColumn('finished', { mode: 'tabs', blocks: ['job', 'camera'] })).toBe('required-in-tabs')
        expect(checkColumn('printing', { mode: 'split', blocks: ['job'] })).toBeNull()
        expect(checkColumn('error', { mode: 'tabs', blocks: ['problem', 'console'] })).toBe('scrolls-with-others')
    })
})

describe('checkArrangement', () => {
    it('needs three columns, each block once and the required blocks', () => {
        const idle = defaultHomeArrangement('idle')

        expect(checkArrangement('idle', idle.slice(0, 2))).toBe('column-count')
        expect(checkArrangement('idle', [idle[0], idle[1], { mode: 'split', blocks: ['start'] }])).toBe(
            'duplicate-block'
        )
        expect(
            checkArrangement('printing', [
                { mode: 'split', blocks: ['camera'] },
                { mode: 'split', blocks: ['console'] },
                { mode: 'split', blocks: ['heat'] },
            ])
        ).toBe('required-missing')
    })
})

describe('normalizeArrangement', () => {
    it('falls back to the default for missing and broken data', () => {
        expect(normalizeArrangement('idle', undefined)).toEqual(defaultHomeArrangement('idle'))
        expect(normalizeArrangement('idle', 'broken')).toEqual(defaultHomeArrangement('idle'))
        expect(normalizeArrangement('idle', [{ blocks: ['start'] }])).toEqual(defaultHomeArrangement('idle'))
        expect(normalizeArrangement('printing', [{ blocks: ['camera'] }, { blocks: ['heat'] }, {}])).toEqual(
            defaultHomeArrangement('printing')
        )
    })

    it('keeps a valid arrangement', () => {
        const custom = [
            { mode: 'split', blocks: ['ready'] },
            { mode: 'tabs', blocks: ['start', 'macros', 'console'] },
            { mode: 'split', blocks: ['camera', 'heat'] },
        ]

        expect(normalizeArrangement('idle', custom)).toEqual(custom)
    })

    it('turns a split that does not fit into tabs instead of letting the column scroll', () => {
        const result = normalizeArrangement('idle', [
            { mode: 'split', blocks: ['start'] },
            { mode: 'split', blocks: ['ready', 'spool', 'heat'] },
            { mode: 'split', blocks: ['camera'] },
        ])

        expect(result[1]).toEqual({ mode: 'tabs', blocks: ['ready', 'spool', 'heat'] })
    })

    it('drops unknown blocks and blocks listed twice in a column', () => {
        const result = normalizeArrangement('idle', [
            { mode: 'split', blocks: ['start', 'nonsense', 'start'] },
            { mode: 'split', blocks: ['ready'] },
            { mode: 'split', blocks: ['camera'] },
        ])

        expect(names(result)).toEqual([['start'], ['ready'], ['camera']])
    })
})

describe('editing an arrangement', () => {
    const idle = defaultHomeArrangement('idle')

    it('lists the blocks that are not on Home yet', () => {
        expect(unusedBlocks('idle', idle)).toEqual(['console', 'heat', 'macros'])
        expect(unusedBlocks('error', defaultHomeArrangement('error'))).toEqual(['spool', 'macros'])
    })

    it('adds a block as a split when it fits and as tabs when it does not', () => {
        expect(addBlock('idle', idle, 0, 'heat')?.[0]).toEqual({ mode: 'split', blocks: ['start', 'heat'] })
        expect(addBlock('idle', idle, 1, 'heat')?.[1]).toEqual({ mode: 'tabs', blocks: ['ready', 'heat'] })
        expect(addBlock('idle', idle, 2, 'heat')?.[2]).toEqual({
            mode: 'tabs',
            blocks: ['camera', 'spool', 'last', 'heat'],
        })
    })

    it('refuses a block that is already used, unknown here or cannot fit at all', () => {
        expect(addBlock('idle', idle, 0, 'camera')).toBeNull()
        expect(addBlock('idle', idle, 0, 'job')).toBeNull()
        expect(addBlock('printing', defaultHomeArrangement('printing'), 0, 'macros')).toBeNull()
        expect(addBlock('idle', idle, 7, 'heat')).toBeNull()
    })

    it('removes a block but never the last one of a column or a required one', () => {
        expect(names(removeBlock('idle', idle, 2, 'spool'))[2]).toEqual(['camera', 'last'])
        expect(removeBlock('idle', idle, 0, 'start')).toBeNull()
        expect(removeBlock('printing', defaultHomeArrangement('printing'), 0, 'job')).toBeNull()
    })

    it('swaps one block for another', () => {
        expect(names(replaceBlock('idle', idle, 1, 'ready', 'macros'))[1]).toEqual(['macros'])
        expect(replaceBlock('idle', idle, 1, 'ready', 'start')).toBeNull()
        expect(replaceBlock('printing', defaultHomeArrangement('printing'), 0, 'job', 'macros')).toBeNull()
    })

    it('reorders the blocks of a column and nothing else', () => {
        expect(names(reorderBlocks('idle', idle, 2, ['last', 'camera', 'spool']))[2]).toEqual([
            'last',
            'camera',
            'spool',
        ])
        expect(reorderBlocks('idle', idle, 2, ['last', 'camera'])).toBeNull()
        expect(reorderBlocks('idle', idle, 2, ['last', 'camera', 'heat'])).toBeNull()
    })

    it('switches between tabs and split only when the split fits', () => {
        const printing = defaultHomeArrangement('printing')

        expect(setColumnMode('printing', printing, 1, 'split')?.[1].mode).toBe('split')
        expect(setColumnMode('printing', printing, 2, 'tabs')?.[2].mode).toBe('tabs')

        const crowded = addBlock('idle', idle, 2, 'heat') as HomeArrangement
        expect(setColumnMode('idle', crowded, 2, 'split')).toBeNull()
    })

    it('never produces an arrangement that fails the check', () => {
        homeLayoutStates.forEach((state) => {
            let columns = defaultHomeArrangement(state)
            unusedBlocks(state, columns).forEach((id, index) => {
                columns = addBlock(state, columns, index % 3, id) ?? columns
                expect(checkArrangement(state, columns), `${state} ${id}`).toBeNull()
            })
        })
    })
})

describe('listColumnChoices', () => {
    it('lists only combinations that pass the check', () => {
        homeLayoutStates.forEach((state) => {
            const splits = listColumnChoices(state, 'split')
            const tabs = listColumnChoices(state, 'tabs')

            expect(splits.length, state).toBeGreaterThan(3)
            expect(tabs.length, state).toBeGreaterThan(splits.length)
            splits.forEach((blocks) => expect(checkColumn(state, { mode: 'split', blocks })).toBeNull())
            tabs.forEach((blocks) => expect(checkColumn(state, { mode: 'tabs', blocks })).toBeNull())
        })
    })

    it('contains the splits of the default Home', () => {
        expect(listColumnChoices('idle', 'split').map((blocks) => [...blocks].sort().join())).toContain(
            'camera,last,spool'
        )
        expect(listColumnChoices('printing', 'split').map((blocks) => [...blocks].sort().join())).toContain(
            'events,heat,spool'
        )
    })
})

describe('the action row', () => {
    it('needs exactly four different known actions', () => {
        expect(normalizeWhileActions(['macros', 'speed', 'console', 'limits'])).toEqual([
            'macros',
            'speed',
            'console',
            'limits',
        ])
        expect(normalizeWhileActions(['macros', 'speed', 'console'])).toEqual(defaultWhileActions)
        expect(normalizeWhileActions(['macros', 'macros', 'console', 'limits'])).toEqual(defaultWhileActions)
        expect(normalizeWhileActions(['macros', 'speed', 'console', 'explode'])).toEqual(defaultWhileActions)
        expect(normalizeWhileActions('nudge')).toEqual(defaultWhileActions)
    })
})

describe('resolveHomeLayouts', () => {
    it('has the default layout when nothing is stored', () => {
        const expected = {
            activeId: 'default',
            layouts: [{ id: 'default', name: '', order: 0, layout: defaultHomeLayout() }],
        }

        expect(resolveHomeLayouts(undefined)).toEqual(expected)
        expect(resolveHomeLayouts({ active: 'gone', items: {} })).toEqual(expected)
        expect(resolveHomeLayouts('broken')).toEqual(expected)
    })

    it('lists stored layouts in order and repairs broken ones', () => {
        const result = resolveHomeLayouts({
            active: 'b',
            items: {
                b: { name: 'Calibration', order: 2, layout: 'broken' },
                a: { name: 'Everyday', order: 1, layout: { actions: ['macros', 'speed', 'console', 'limits'] } },
                junk: 4,
            },
        })

        expect(result.activeId).toBe('b')
        expect(result.layouts.map((layout) => layout.name)).toEqual(['Everyday', 'Calibration'])
        expect(result.layouts[1].layout).toEqual(defaultHomeLayout())
        expect(result.layouts[0].layout.actions).toEqual(['macros', 'speed', 'console', 'limits'])
        expect(result.layouts[0].layout.states.idle).toEqual(defaultHomeArrangement('idle'))
    })

    it('falls back to the first layout when the active one is missing', () => {
        expect(resolveHomeLayouts({ active: 'gone', items: { a: { name: 'A', order: 1 } } }).activeId).toBe('a')
    })
})

describe('export and import', () => {
    const layout = normalizeHomeLayout({
        states: {
            idle: [
                { mode: 'split', blocks: ['ready'] },
                { mode: 'tabs', blocks: ['start', 'macros'] },
                { mode: 'split', blocks: ['camera', 'heat'] },
            ],
        },
        actions: ['macros', 'speed', 'console', 'limits'],
    })
    const exported = () => JSON.parse(serializeHomeLayout('Calibration', layout))
    const importOf = (data: unknown) => parseHomeLayoutImport(JSON.stringify(data))

    it('round-trips a layout', () => {
        expect(parseHomeLayoutImport(serializeHomeLayout('Calibration', layout))).toEqual({
            ok: true,
            name: 'Calibration',
            layout,
        })
    })

    it('builds a safe file name', () => {
        expect(homeLayoutFilename('Farm glance!')).toBe('mainsail-home-farm-glance.json')
        expect(homeLayoutFilename('../..')).toBe('mainsail-home-layout.json')
    })

    it('rejects files that are not a Home layout', () => {
        expect(parseHomeLayoutImport('{ nope')).toMatchObject({ ok: false, error: 'not-json' })
        expect(parseHomeLayoutImport(' '.repeat(200000))).toMatchObject({ ok: false, error: 'too-large' })
        expect(importOf({ format: 'mainsail-dashboard-layout', version: 1 })).toMatchObject({ error: 'not-a-layout' })
        expect(importOf({ ...exported(), version: 2 })).toMatchObject({ error: 'unsupported-version' })
        expect(importOf({ ...exported(), name: ' ' })).toMatchObject({ error: 'invalid-name' })
    })

    it('rejects unknown keys and missing parts', () => {
        expect(importOf({ ...exported(), extra: 1 })).toMatchObject({ error: 'invalid-structure' })

        const data = exported()
        data.layout.theme = 'dark'
        expect(importOf(data)).toMatchObject({ error: 'invalid-structure', detail: 'layout' })

        const data2 = exported()
        delete data2.layout.states.error
        expect(importOf(data2)).toMatchObject({ error: 'invalid-structure', detail: 'layout.states' })
    })

    it('rejects an arrangement that would not pass the check, instead of repairing it', () => {
        const tooTall = exported()
        tooTall.layout.states.idle[0] = { mode: 'split', blocks: ['ready', 'spool'] }
        expect(importOf(tooTall)).toMatchObject({ error: 'invalid-arrangement', detail: 'idle: too-tall' })

        const unknown = exported()
        unknown.layout.states.idle[0] = { mode: 'split', blocks: ['<script>'] }
        expect(importOf(unknown)).toMatchObject({ error: 'invalid-arrangement' })

        const extraKey = exported()
        extraKey.layout.states.idle[0] = { mode: 'split', blocks: ['ready'], onclick: 'x' }
        expect(importOf(extraKey)).toMatchObject({ error: 'invalid-arrangement' })

        const missingJob = exported()
        missingJob.layout.states.printing[0] = { mode: 'split', blocks: ['macros'] }
        expect(importOf(missingJob)).toMatchObject({
            error: 'invalid-arrangement',
            detail: 'printing: required-missing',
        })
    })

    it('rejects an invalid action row', () => {
        const data = exported()
        data.layout.actions = ['macros', 'macros', 'console', 'limits']

        expect(importOf(data)).toMatchObject({ error: 'invalid-actions' })
    })
})

describe('Home layouts in the navigation of the shell', () => {
    it('reaches switching, editing and managing layouts in three clicks or fewer', () => {
        const ids = [
            'home:layout-menu',
            'home:switch-layout',
            'home:edit-layout',
            'home:macros-block',
            'settings:home',
            'settings:home-layouts',
            'settings:while-it-prints',
        ]

        ids.forEach((id) => {
            const feature = findShellFeature(id)

            expect(feature, id).toBeDefined()
            expect(featureClicks(feature!), id).toBeLessThanOrEqual(MAX_FEATURE_CLICKS)
        })
        expect(featurePath(findShellFeature('settings:home-layouts')!)).toBe('/settings/home')
        expect(featurePath(findShellFeature('home:edit-layout')!)).toBe('/')
    })

    it('has its own settings tab in the new shell only', () => {
        expect(shellOnlySettingsTabNames).toEqual(['home'])
        expect(settingsTabNames).not.toContain('home')
        expect(getShellPage('settings').tabs.map((tab) => tab.id)).toContain('home')
    })

    it('gives the Home tab its own title next to the dashboard tab of the classic interface', () => {
        const tabs = buildShellSettingsTabs((key) => key)

        expect(tabs.find((tab) => tab.name === 'home')?.title).toBe('Shell.Home.Layouts')
        expect(tabs.find((tab) => tab.name === 'dashboard')?.title).toBe('Settings.DashboardTab.Dashboard')
    })

    it('sends every action below a print to a page and tab that exist', () => {
        whileActions.forEach((id) => {
            const target = whileActionTargets[id]
            if (target === null) return

            const page = shellPages.find((entry) => entry.id === target.page)
            expect(
                page?.tabs.map((tab) => tab.id),
                id
            ).toContain(target.tab)
        })
        expect(whileActions.filter((id) => whileActionTargets[id] === null)).toEqual(['speed'])
    })
})
