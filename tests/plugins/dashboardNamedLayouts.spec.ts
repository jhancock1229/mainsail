import { describe, expect, it } from 'vitest'
import {
    COLUMN_WIDTH_UNITS,
    applyDensityToHeight,
    layoutExportFilename,
    DashboardLayoutSnapshot,
    LAYOUT_EXPORT_FORMAT,
    MIN_COLUMN_WIDTH_UNITS,
    columnLimits,
    columnWidthPercent,
    getActiveColumnKeys,
    getAllColumnKeys,
    getColumnKey,
    getDefaultColumnWidths,
    getPanelDensityOptions,
    moveColumnDivider,
    nextPanelDensity,
    normalizeSnapshot,
    parseLayoutImport,
    redistributeColumns,
    resolveColumns,
    resolveNamedLayouts,
    resolvePanelDensity,
    sanitizeLayoutName,
    serializeLayoutExport,
    uniqueLayoutName,
} from '@/plugins/dashboardNamedLayouts'

const panel = (name: string, visible = true) => ({ name, visible })

const fallback: DashboardLayoutSnapshot = normalizeSnapshot(
    {
        panels: {
            mobileLayout: [panel('toolhead-control'), panel('temperature')],
            tabletLayout1: [panel('toolhead-control')],
            tabletLayout2: [panel('temperature')],
            desktopLayout1: [panel('toolhead-control')],
            desktopLayout2: [panel('temperature')],
            widescreenLayout1: [panel('toolhead-control')],
            widescreenLayout2: [panel('temperature')],
            widescreenLayout3: [panel('miniconsole')],
        },
    },
    null
)

describe('column keys', () => {
    it('keeps the stored key names of the fixed column model', () => {
        expect(getColumnKey('mobile', 1)).toBe('mobileLayout')
        expect(getColumnKey('desktop', 2)).toBe('desktopLayout2')
        expect(getAllColumnKeys('widescreen')).toEqual([
            'widescreenLayout1',
            'widescreenLayout2',
            'widescreenLayout3',
            'widescreenLayout4',
        ])
        expect(getAllColumnKeys('mobile')).toEqual(['mobileLayout'])
    })

    it('returns the stock columns when nothing is stored', () => {
        expect(getActiveColumnKeys('mobile', undefined)).toEqual(['mobileLayout'])
        expect(getActiveColumnKeys('tablet', undefined)).toEqual(['tabletLayout1', 'tabletLayout2'])
        expect(getActiveColumnKeys('desktop', {})).toEqual(['desktopLayout1', 'desktopLayout2'])
        expect(getActiveColumnKeys('widescreen', null)).toHaveLength(3)
        expect(getActiveColumnKeys('unknown', undefined)).toEqual([])
    })

    it('follows the stored column count', () => {
        expect(getActiveColumnKeys('desktop', { desktop: { count: 3 } })).toEqual([
            'desktopLayout1',
            'desktopLayout2',
            'desktopLayout3',
        ])
        expect(getActiveColumnKeys('widescreen', { widescreen: { count: 1 } })).toEqual(['widescreenLayout1'])
    })
})

describe('resolveColumns', () => {
    it('uses the stock widths by default', () => {
        expect(resolveColumns('tablet', undefined)).toEqual({ count: 2, widths: [12, 12] })
        expect(resolveColumns('desktop', undefined)).toEqual({ count: 2, widths: [10, 14] })
        expect(resolveColumns('widescreen', undefined)).toEqual({ count: 3, widths: [6, 10, 8] })
        expect(resolveColumns('mobile', undefined)).toEqual({ count: 1, widths: [24] })
    })

    it('clamps the count to the limits of the viewport', () => {
        expect(resolveColumns('desktop', { count: 9 }).count).toBe(columnLimits.desktop.max)
        expect(resolveColumns('desktop', { count: 0 }).count).toBe(1)
        expect(resolveColumns('mobile', { count: 3 }).count).toBe(1)
        expect(resolveColumns('desktop', { count: 'three' }).count).toBe(2)
        expect(resolveColumns('desktop', { count: 2.5 }).count).toBe(2)
    })

    it('accepts stored widths only when they fit the count and the grid', () => {
        expect(resolveColumns('desktop', { count: 2, widths: [8, 16] }).widths).toEqual([8, 16])
        expect(resolveColumns('desktop', { count: 2, widths: [8, 8] }).widths).toEqual([10, 14])
        expect(resolveColumns('desktop', { count: 2, widths: [2, 22] }).widths).toEqual([10, 14])
        expect(resolveColumns('desktop', { count: 3, widths: [8, 16] }).widths).toEqual([8, 8, 8])
        expect(resolveColumns('desktop', { count: 2, widths: [8.5, 15.5] }).widths).toEqual([10, 14])
        expect(resolveColumns('desktop', { count: 2, widths: 'wide' }).widths).toEqual([10, 14])
    })

    it('always returns widths that fill the grid', () => {
        for (const viewport of ['mobile', 'tablet', 'desktop', 'widescreen'] as const) {
            for (let count = columnLimits[viewport].min; count <= columnLimits[viewport].max; count++) {
                const widths = getDefaultColumnWidths(viewport, count)
                expect(widths).toHaveLength(count)
                expect(widths.reduce((sum, width) => sum + width, 0)).toBe(COLUMN_WIDTH_UNITS)
                expect(Math.min(...widths)).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH_UNITS)
            }
        }
    })

    it('converts units to a percentage', () => {
        expect(columnWidthPercent(12)).toBe(50)
        expect(columnWidthPercent(24)).toBe(100)
        expect(columnWidthPercent(6)).toBe(25)
    })
})

describe('moveColumnDivider', () => {
    it('moves width between the two neighbouring columns', () => {
        expect(moveColumnDivider([10, 14], 0, 2)).toEqual([12, 12])
        expect(moveColumnDivider([6, 10, 8], 1, -3)).toEqual([6, 7, 11])
    })

    it('stops at the minimum width', () => {
        expect(moveColumnDivider([10, 14], 0, -20)).toEqual([4, 20])
        expect(moveColumnDivider([10, 14], 0, 20)).toEqual([20, 4])
    })

    it('ignores a divider that does not exist', () => {
        expect(moveColumnDivider([10, 14], 1, 2)).toEqual([10, 14])
        expect(moveColumnDivider([24], 0, 2)).toEqual([24])
    })

    it('does not change its input', () => {
        const widths = [10, 14]
        moveColumnDivider(widths, 0, 2)
        expect(widths).toEqual([10, 14])
    })
})

describe('redistributeColumns', () => {
    const columns = [[panel('a')], [panel('b')], [panel('c'), panel('d')]]

    it('moves the panels of removed columns to the end of the last column that stays', () => {
        expect(redistributeColumns(columns, 2)).toEqual([[panel('a')], [panel('b'), panel('c'), panel('d')]])
        expect(redistributeColumns(columns, 1)).toEqual([[panel('a'), panel('b'), panel('c'), panel('d')]])
    })

    it('adds empty columns', () => {
        expect(redistributeColumns([[panel('a')]], 3)).toEqual([[panel('a')], [], []])
    })

    it('keeps every panel exactly once', () => {
        const names = redistributeColumns(columns, 2)
            .flat()
            .map((entry) => entry.name)
        expect(names.sort()).toEqual(['a', 'b', 'c', 'd'])
    })
})

describe('panel density', () => {
    it('offers compact and normal for every panel, expanded only where a panel can use the room', () => {
        expect(getPanelDensityOptions('macros')).toEqual(['compact', 'normal'])
        expect(getPanelDensityOptions('miniconsole')).toEqual(['compact', 'normal', 'expanded'])
        expect(getPanelDensityOptions('temperature')).toEqual(['compact', 'normal', 'expanded'])
        expect(getPanelDensityOptions('macrogroup_abc')).toEqual(['compact', 'normal'])
    })

    it('falls back to normal for missing, unknown and unsupported values', () => {
        expect(resolvePanelDensity('macros', undefined)).toBe('normal')
        expect(resolvePanelDensity('macros', { macros: 'tiny' })).toBe('normal')
        expect(resolvePanelDensity('macros', { macros: 'expanded' })).toBe('normal')
        expect(resolvePanelDensity('macros', { macros: 'compact' })).toBe('compact')
        expect(resolvePanelDensity('miniconsole', { miniconsole: 'expanded' })).toBe('expanded')
        expect(resolvePanelDensity('macros', 'compact')).toBe('normal')
    })

    it('cycles through the options of the panel', () => {
        expect(nextPanelDensity('macros', 'normal')).toBe('compact')
        expect(nextPanelDensity('macros', 'compact')).toBe('normal')
        expect(nextPanelDensity('miniconsole', 'normal')).toBe('expanded')
        expect(nextPanelDensity('miniconsole', 'expanded')).toBe('compact')
    })
})

describe('applyDensityToHeight', () => {
    it('shrinks and grows a height with the density', () => {
        expect(applyDensityToHeight(300, 'normal')).toBe(300)
        expect(applyDensityToHeight(300, 'compact')).toBe(210)
        expect(applyDensityToHeight(300, 'expanded')).toBe(480)
    })
})

describe('layoutExportFilename', () => {
    it('builds a safe file name from the layout name', () => {
        expect(layoutExportFilename('Tablet on the printer!')).toBe('mainsail-layout-tablet-on-the-printer.json')
        expect(layoutExportFilename('../../etc')).toBe('mainsail-layout-etc.json')
        expect(layoutExportFilename('')).toBe('mainsail-layout-dashboard.json')
    })
})

describe('layout names', () => {
    it('trims, collapses whitespace and limits the length', () => {
        expect(sanitizeLayoutName('  Farm   glance ')).toBe('Farm glance')
        expect(sanitizeLayoutName('x'.repeat(80))).toHaveLength(40)
        expect(sanitizeLayoutName(42)).toBe('')
        expect(sanitizeLayoutName('   ')).toBe('')
    })

    it('makes a name unique by numbering it', () => {
        expect(uniqueLayoutName('Calibration', [])).toBe('Calibration')
        expect(uniqueLayoutName('Calibration', ['Calibration'])).toBe('Calibration 2')
        expect(uniqueLayoutName('Calibration', ['calibration', 'Calibration 2'])).toBe('Calibration 3')
    })
})

describe('normalizeSnapshot', () => {
    it('falls back completely when the snapshot is missing or not an object', () => {
        expect(normalizeSnapshot(undefined, fallback)).toEqual(fallback)
        expect(normalizeSnapshot('broken', fallback)).toEqual(fallback)
        expect(normalizeSnapshot([], fallback)).toEqual(fallback)
    })

    it('returns a copy, never the fallback itself', () => {
        const result = normalizeSnapshot(undefined, fallback)
        expect(result).not.toBe(fallback)
        expect(result.panels.mobileLayout).not.toBe(fallback.panels.mobileLayout)
    })

    it('has every column key of every viewport', () => {
        expect(Object.keys(fallback.panels).sort()).toEqual(
            [
                'mobileLayout',
                'tabletLayout1',
                'tabletLayout2',
                'desktopLayout1',
                'desktopLayout2',
                'desktopLayout3',
                'widescreenLayout1',
                'widescreenLayout2',
                'widescreenLayout3',
                'widescreenLayout4',
            ].sort()
        )
        expect(fallback.panels.desktopLayout3).toEqual([])
    })

    it('keeps a valid viewport and replaces a corrupt one with the fallback', () => {
        const result = normalizeSnapshot(
            {
                panels: {
                    desktopLayout1: [panel('webcam'), panel('macros', false)],
                    desktopLayout2: [],
                    tabletLayout1: 'broken',
                    tabletLayout2: [panel('webcam')],
                },
            },
            fallback
        )

        expect(result.panels.desktopLayout1).toEqual([panel('webcam'), panel('macros', false)])
        expect(result.panels.desktopLayout2).toEqual([])
        expect(result.panels.tabletLayout1).toEqual(fallback.panels.tabletLayout1)
        expect(result.panels.tabletLayout2).toEqual(fallback.panels.tabletLayout2)
        expect(result.panels.mobileLayout).toEqual(fallback.panels.mobileLayout)
    })

    it('drops broken entries and panels that are listed twice in a viewport', () => {
        const result = normalizeSnapshot(
            {
                panels: {
                    desktopLayout1: [panel('webcam'), null, { name: 5 }, { name: 'macros' }, 'x'],
                    desktopLayout2: [panel('webcam'), panel('temperature')],
                },
            },
            fallback
        )

        expect(result.panels.desktopLayout1).toEqual([panel('webcam'), panel('macros')])
        expect(result.panels.desktopLayout2).toEqual([panel('temperature')])
    })

    it('keeps only customized columns of the printer states', () => {
        const result = normalizeSnapshot(
            {
                panels: fallback.panels,
                stateLayouts: {
                    enabled: false,
                    printing: { desktopLayout1: [panel('webcam')], desktopLayout2: 'x', nonsense: [panel('a')] },
                    error: 'broken',
                    paused: { desktopLayout1: [] },
                },
            },
            fallback
        )

        expect(result.stateLayouts).toEqual({ printing: { desktopLayout1: [panel('webcam')] }, error: {} })
    })

    it('resolves columns and keeps only meaningful densities', () => {
        const result = normalizeSnapshot(
            {
                panels: fallback.panels,
                columns: { desktop: { count: 3, widths: [6, 6, 12] }, tablet: { count: 7 } },
                density: { macros: 'compact', webcam: 'normal', miniconsole: 'expanded', temperature: 'huge', x: 1 },
            },
            fallback
        )

        expect(result.columns.desktop).toEqual({ count: 3, widths: [6, 6, 12] })
        expect(result.columns.tablet).toEqual({ count: 2, widths: [12, 12] })
        expect(result.columns.mobile).toEqual({ count: 1, widths: [24] })
        expect(result.density).toEqual({ macros: 'compact', miniconsole: 'expanded' })
    })
})

describe('resolveNamedLayouts', () => {
    it('has one unnamed default layout when nothing is stored', () => {
        const expected = { activeId: 'default', layouts: [{ id: 'default', name: '', order: 0 }] }

        expect(resolveNamedLayouts(undefined)).toEqual(expected)
        expect(resolveNamedLayouts({})).toEqual(expected)
        expect(resolveNamedLayouts({ active: 'gone', items: {} })).toEqual(expected)
        expect(resolveNamedLayouts('broken')).toEqual(expected)
    })

    it('lists the stored layouts in their order', () => {
        const result = resolveNamedLayouts({
            active: 'b',
            items: {
                a: { name: 'Calibration', order: 2 },
                b: { name: 'Farm glance', order: 1 },
                default: { name: '', order: 0 },
            },
        })

        expect(result.activeId).toBe('b')
        expect(result.layouts.map((layout) => layout.id)).toEqual(['default', 'b', 'a'])
        expect(result.layouts[1].name).toBe('Farm glance')
    })

    it('falls back to the first layout when the active one is missing', () => {
        const result = resolveNamedLayouts({ active: 'gone', items: { a: { name: 'A', order: 1 } } })

        expect(result.activeId).toBe('a')
    })

    it('skips corrupt entries but keeps a layout whose snapshot is corrupt', () => {
        const result = resolveNamedLayouts({
            active: 'a',
            items: { a: { name: 'A', order: 1, snapshot: 'broken' }, b: null, c: 'x', d: { name: 7 } },
        })

        expect(result.layouts.map((layout) => layout.id)).toEqual(['d', 'a'])
        expect(result.layouts[0].name).toBe('')
    })
})

interface ExportFile {
    format: string
    version: number
    name: unknown
    layout: {
        panels: Record<string, unknown>
        stateLayouts: Record<string, unknown>
        columns: Record<string, unknown>
        density: Record<string, unknown>
        surprise?: unknown
    }
}

describe('layout export and import', () => {
    const snapshot = normalizeSnapshot(
        {
            panels: fallback.panels,
            stateLayouts: { printing: { desktopLayout1: [panel('temperature')], desktopLayout2: [] } },
            columns: { desktop: { count: 2, widths: [8, 16] } },
            density: { miniconsole: 'expanded' },
        },
        fallback
    )
    const exported = (): ExportFile => JSON.parse(serializeLayoutExport('Calibration', snapshot))
    const importOf = (data: unknown) => parseLayoutImport(JSON.stringify(data), fallback)

    it('round-trips a layout', () => {
        const result = parseLayoutImport(serializeLayoutExport('Calibration', snapshot), fallback)

        expect(result).toEqual({ ok: true, name: 'Calibration', snapshot })
    })

    it('marks the file with a format and a version', () => {
        expect(exported().format).toBe(LAYOUT_EXPORT_FORMAT)
        expect(exported().version).toBe(1)
    })

    it('rejects text that is not JSON, and files that are too large', () => {
        expect(parseLayoutImport('{ not json', fallback)).toMatchObject({ ok: false, error: 'not-json' })
        expect(parseLayoutImport(' '.repeat(300000), fallback)).toMatchObject({ ok: false, error: 'too-large' })
    })

    it('rejects other JSON files', () => {
        expect(importOf({ hello: 'world' })).toMatchObject({ ok: false, error: 'not-a-layout' })
        expect(importOf([1, 2])).toMatchObject({ ok: false, error: 'not-a-layout' })
        expect(importOf({ ...exported(), format: 'something-else' })).toMatchObject({ error: 'not-a-layout' })
    })

    it('rejects an unknown version', () => {
        expect(importOf({ ...exported(), version: 2 })).toMatchObject({ ok: false, error: 'unsupported-version' })
    })

    it('rejects a missing or empty name', () => {
        expect(importOf({ ...exported(), name: '  ' })).toMatchObject({ ok: false, error: 'invalid-name' })
        expect(importOf({ ...exported(), name: 5 })).toMatchObject({ ok: false, error: 'invalid-name' })
    })

    it('rejects unknown keys on every level', () => {
        expect(importOf({ ...exported(), extra: 1 })).toMatchObject({ ok: false, error: 'invalid-structure' })

        const data = exported()
        data.layout.surprise = {}
        expect(importOf(data)).toMatchObject({ ok: false, error: 'invalid-structure', detail: 'layout.surprise' })

        const data2 = exported()
        data2.layout.panels.kioskLayout1 = []
        expect(importOf(data2)).toMatchObject({ ok: false, error: 'invalid-structure' })

        const data3 = exported()
        data3.layout.panels.desktopLayout1 = [{ name: 'webcam', visible: true, onclick: 'x' }]
        expect(importOf(data3)).toMatchObject({ ok: false, error: 'invalid-structure' })

        const data4 = exported()
        data4.layout.stateLayouts.paused = {}
        expect(importOf(data4)).toMatchObject({ ok: false, error: 'invalid-structure' })
    })

    it('rejects a missing section', () => {
        const data = exported()
        delete (data.layout as Record<string, unknown>).columns

        expect(importOf(data)).toMatchObject({ ok: false, error: 'invalid-structure', detail: 'layout.columns' })
    })

    it('rejects wrongly typed panel entries', () => {
        const data = exported()
        data.layout.panels.desktopLayout1 = [{ name: 'webcam', visible: 'yes' }]
        expect(importOf(data)).toMatchObject({ ok: false, error: 'invalid-structure' })

        const data2 = exported()
        data2.layout.panels.desktopLayout1 = { name: 'webcam' }
        expect(importOf(data2)).toMatchObject({ ok: false, error: 'invalid-structure' })
    })

    it('rejects unknown panels but accepts macro groups', () => {
        const data = exported()
        data.layout.panels.desktopLayout1 = [panel('<script>')]
        expect(importOf(data)).toMatchObject({ ok: false, error: 'unknown-panel', detail: '<script>' })

        const data2 = exported()
        data2.layout.panels.desktopLayout1 = [panel('macrogroup_3f2a-11')]
        expect(importOf(data2)).toMatchObject({ ok: true })
    })

    it('rejects a panel that is listed twice in a viewport', () => {
        const data = exported()
        data.layout.panels.desktopLayout1 = [panel('webcam')]
        data.layout.panels.desktopLayout2 = [panel('webcam')]

        expect(importOf(data)).toMatchObject({ ok: false, error: 'duplicate-panel', detail: 'webcam' })
    })

    it('rejects invalid columns', () => {
        const check = (columns: unknown) => {
            const data = exported()
            data.layout.columns.desktop = columns

            return importOf(data)
        }

        expect(check({ count: 5, widths: [4, 4, 4, 4, 8] })).toMatchObject({ ok: false, error: 'invalid-columns' })
        expect(check({ count: 2, widths: [12, 13] })).toMatchObject({ ok: false, error: 'invalid-columns' })
        expect(check({ count: 2, widths: [2, 22] })).toMatchObject({ ok: false, error: 'invalid-columns' })
        expect(check({ count: 2 })).toMatchObject({ ok: false, error: 'invalid-columns' })
        expect(check({ count: 2, widths: [12, 12], gap: 3 })).toMatchObject({ ok: false, error: 'invalid-columns' })
    })

    it('rejects panels in a column the layout does not have', () => {
        const data = exported()
        data.layout.panels.desktopLayout3 = [panel('webcam')]

        expect(importOf(data)).toMatchObject({ ok: false, error: 'invalid-columns' })
    })

    it('rejects an invalid density', () => {
        const data = exported()
        data.layout.density = { macros: 'tiny' }
        expect(importOf(data)).toMatchObject({ ok: false, error: 'invalid-density' })

        const data2 = exported()
        data2.layout.density = { 'not a panel': 'compact' }
        expect(importOf(data2)).toMatchObject({ ok: false, error: 'unknown-panel' })
    })
})
