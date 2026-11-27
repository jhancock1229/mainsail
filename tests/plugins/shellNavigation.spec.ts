import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    classicPathFor,
    featureClicks,
    featurePath,
    findShellFeature,
    getShellPage,
    isClassicForced,
    isShellTabAvailable,
    MAX_FEATURE_CLICKS,
    resolveInterfaceShell,
    resolveShellLocation,
    settingsTabNames,
    shellFeatures,
    shellPages,
    shellPath,
} from '@/plugins/shellNavigation'
import { allDashboardPanels } from '@/store/variables'

const source = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../src', file), 'utf8')
const names = (text: string): string[] => [...text.matchAll(/\bname: '([\w-]+)'/g)].map((match) => match[1])

const classicRoutes = names(source('routes/index.ts'))
const classicSettingsTabs = names(source('components/TheSettingsMenu.vue'))
const classicFixedPanels = ['status', 'klippy-state', 'min-settings', 'macrogroup']
const classicTopbar = [
    'emergency-stop',
    'command-palette',
    'mode-toggle',
    'notifications',
    'power-and-services',
    'printer-selector',
    'save-config',
    'settings',
    'upload-and-print',
]
const classicMachinePanels = ['config-files', 'update-manager', 'system-loads', 'endstops', 'logfiles']

const classicFeatures = [
    ...classicRoutes.map((name) => `route:${name}`),
    ...[...allDashboardPanels, ...classicFixedPanels].map((name) => `panel:${name}`),
    ...classicSettingsTabs.map((name) => `settings:${name}`),
    ...classicTopbar.map((name) => `topbar:${name}`),
    ...classicMachinePanels.map((name) => `machine:${name}`),
    'sidebar:about',
]

describe('the classic inventory used by these tests', () => {
    it('is read from the real route table, dashboard panels and settings dialog', () => {
        expect(classicRoutes).toEqual(expect.arrayContaining(['dashboard', 'gcodefiles', 'machine', 'heightmap']))
        expect(classicRoutes.length).toBeGreaterThanOrEqual(10)
        expect(classicSettingsTabs.length).toBeGreaterThanOrEqual(17)
        expect(allDashboardPanels.length).toBeGreaterThanOrEqual(13)
    })
})

describe('shellFeatures', () => {
    it('lists every feature of the classic interface', () => {
        const missing = classicFeatures.filter((id) => findShellFeature(id) === undefined)

        expect(missing).toEqual([])
    })

    it('reaches every feature in three clicks or fewer', () => {
        const tooDeep = shellFeatures.filter((feature) => featureClicks(feature) > MAX_FEATURE_CLICKS)

        expect(tooDeep).toEqual([])
        expect(MAX_FEATURE_CLICKS).toBe(3)
    })

    it('counts one click for the navigation, one for the tab and one for the control', () => {
        expect(featureClicks({ id: 'x', place: 'tune', tab: 'limits' })).toBe(3)
        expect(featureClicks({ id: 'x', place: 'home' })).toBe(2)
        expect(featureClicks({ id: 'x', place: 'home', steps: 2 })).toBe(3)
        expect(featureClicks({ id: 'x', place: 'rail' })).toBe(1)
        expect(featureClicks({ id: 'x', place: 'tune', tab: 'limits', steps: 2 })).toBe(4)
    })

    it('puts the emergency stop on the rail, one click from every screen', () => {
        const feature = findShellFeature('topbar:emergency-stop')

        expect(feature?.place).toBe('rail')
        expect(featureClicks(feature!)).toBe(1)
    })

    it('only points at pages and tabs that exist', () => {
        shellFeatures
            .filter((feature) => feature.place !== 'rail')
            .forEach((feature) => {
                const page = shellPages.find((entry) => entry.id === feature.place)

                expect(page, feature.id).toBeDefined()
                if (feature.tab !== undefined) {
                    expect(
                        page?.tabs.map((tab) => tab.id),
                        feature.id
                    ).toContain(feature.tab)
                }
            })
    })

    it('has no duplicate ids', () => {
        const ids = shellFeatures.map((feature) => feature.id)

        expect(new Set(ids).size).toBe(ids.length)
    })

    it('gives the path of the page and tab that holds a feature', () => {
        expect(featurePath(findShellFeature('panel:machine-settings')!)).toBe('/tune/limits')
        expect(featurePath(findShellFeature('panel:status')!)).toBe('/')
        expect(featurePath(findShellFeature('topbar:emergency-stop')!)).toBeNull()
    })
})

describe('shellPages', () => {
    it('has the six task pages in order', () => {
        expect(shellPages.map((page) => page.id)).toEqual(['home', 'print', 'tune', 'fix', 'machine', 'settings'])
    })

    it('has the tune and calibrate tabs from the design', () => {
        expect(getShellPage('tune').tabs.map((tab) => tab.id)).toEqual([
            'move',
            'extruder',
            'bed-level',
            'heater-tuning',
            'resonance',
            'limits',
            'macros',
        ])
    })

    it('offers every tab of the classic settings dialog', () => {
        expect([...settingsTabNames].sort()).toEqual([...classicSettingsTabs].sort())
    })
})

describe('resolveShellLocation', () => {
    it('opens home for the root path', () => {
        expect(resolveShellLocation('/')).toEqual({ page: 'home', tab: null })
    })

    it('reads the page and tab from a shell path', () => {
        expect(resolveShellLocation('/tune/bed-level')).toEqual({ page: 'tune', tab: 'bed-level' })
        expect(resolveShellLocation('/settings/presets')).toEqual({ page: 'settings', tab: 'presets' })
    })

    it('opens the first tab when none or an unknown one is given', () => {
        expect(resolveShellLocation('/tune')).toEqual({ page: 'tune', tab: 'move' })
        expect(resolveShellLocation('/tune/nonsense/')).toEqual({ page: 'tune', tab: 'move' })
    })

    it('maps the paths of the classic pages to their new place', () => {
        expect(resolveShellLocation('/files')).toEqual({ page: 'print', tab: 'files' })
        expect(resolveShellLocation('/console')).toEqual({ page: 'fix', tab: 'console' })
        expect(resolveShellLocation('/config')).toEqual({ page: 'machine', tab: 'config' })
        expect(resolveShellLocation('/history?x=1')).toEqual({ page: 'machine', tab: 'history' })
        expect(resolveShellLocation('/heightmap')).toEqual({ page: 'tune', tab: 'bed-level' })
        expect(resolveShellLocation('/viewer')).toEqual({ page: 'print', tab: 'preview' })
        expect(resolveShellLocation('/cam')).toEqual({ page: 'machine', tab: 'cameras' })
        expect(resolveShellLocation('/timelapse')).toEqual({ page: 'machine', tab: 'timelapse' })
        expect(resolveShellLocation('/allPrinters')).toEqual({ page: 'machine', tab: 'printers' })
    })

    it('maps every classic route somewhere other than a dead end', () => {
        const paths = [...source('routes/index.ts').matchAll(/\bpath: '([^']+)'/g)].map((match) => match[1])
        const shellOnly = shellPages.map((page) => page.path)

        paths
            .filter((entry) => entry !== '/' && !shellOnly.some((base) => base !== '/' && entry.startsWith(base)))
            .forEach((entry) => expect(resolveShellLocation(entry).page, entry).not.toBe('home'))
    })

    describe('with what the printer offers', () => {
        const bare = { moonrakerComponents: [], klipperObjects: [], registeredDirectories: [], farm: false }
        const usual = { ...bare, moonrakerComponents: ['history', 'job_queue'], registeredDirectories: ['gcodes'] }

        it('keeps a tab whose requirements are met', () => {
            expect(resolveShellLocation('/print/queue', usual)).toEqual({ page: 'print', tab: 'queue' })
            expect(resolveShellLocation('/machine/history', usual)).toEqual({ page: 'machine', tab: 'history' })
        })

        it('opens the first available tab instead of one whose component is missing', () => {
            expect(resolveShellLocation('/print/queue', bare)).toEqual({ page: 'print', tab: 'preview' })
            expect(resolveShellLocation('/machine/updates', usual)).toEqual({ page: 'machine', tab: 'config' })
            expect(resolveShellLocation('/settings/timelapse', usual)).toEqual({ page: 'settings', tab: 'general' })
            expect(resolveShellLocation('/timelapse', usual)).toEqual({ page: 'machine', tab: 'config' })
        })

        it('does not open the files tab without a gcodes directory', () => {
            expect(resolveShellLocation('/print', bare)).toEqual({ page: 'print', tab: 'preview' })
            expect(resolveShellLocation('/files', bare)).toEqual({ page: 'print', tab: 'preview' })
        })
    })

    it('falls back to home for unknown paths', () => {
        expect(resolveShellLocation('/nowhere')).toEqual({ page: 'home', tab: null })
    })
})

describe('shellPath and classicPathFor', () => {
    it('builds paths for pages and tabs', () => {
        expect(shellPath('home')).toBe('/')
        expect(shellPath('tune')).toBe('/tune')
        expect(shellPath('tune', 'macros')).toBe('/tune/macros')
    })

    it('sends a shell path to the matching classic page', () => {
        expect(classicPathFor('/print/files')).toBe('/files')
        expect(classicPathFor('/fix/console')).toBe('/console')
        expect(classicPathFor('/machine')).toBe('/config')
        expect(classicPathFor('/tune/move')).toBe('/')
        expect(classicPathFor('/settings/presets')).toBe('/')
    })

    it('leaves classic paths alone', () => {
        expect(classicPathFor('/files')).toBeNull()
        expect(classicPathFor('/')).toBeNull()
    })
})

describe('isShellTabAvailable', () => {
    const available = {
        moonrakerComponents: ['history'],
        klipperObjects: ['bed_mesh'],
        registeredDirectories: ['gcodes'],
        farm: false,
    }

    it('hides tabs whose component, object or directory is missing', () => {
        expect(isShellTabAvailable({ moonrakerComponent: 'history' }, available)).toBe(true)
        expect(isShellTabAvailable({ moonrakerComponent: 'timelapse' }, available)).toBe(false)
        expect(isShellTabAvailable({ klipperObject: 'input_shaper' }, available)).toBe(false)
        expect(isShellTabAvailable({ registeredDirectory: 'gcodes' }, available)).toBe(true)
        expect(isShellTabAvailable({ farm: true }, available)).toBe(false)
        expect(isShellTabAvailable({}, available)).toBe(true)
    })
})

describe('isClassicForced', () => {
    it('is true below the width the new shell needs', () => {
        expect(isClassicForced(400)).toBe(true)
        expect(isClassicForced(959)).toBe(true)
        expect(isClassicForced(960)).toBe(false)
    })
})

describe('resolveInterfaceShell', () => {
    it('defaults to the new shell on desktop and laptop windows', () => {
        expect(resolveInterfaceShell(undefined, 1440)).toBe('new')
        expect(resolveInterfaceShell('new', 1280)).toBe('new')
        expect(resolveInterfaceShell('something else', 1280)).toBe('new')
    })

    it('follows the setting back to the classic shell', () => {
        expect(resolveInterfaceShell('classic', 1440)).toBe('classic')
    })

    it('keeps the classic shell on phone-width screens', () => {
        expect(resolveInterfaceShell('new', 400)).toBe('classic')
        expect(resolveInterfaceShell('new', 959)).toBe('classic')
        expect(resolveInterfaceShell('new', 960)).toBe('new')
    })
})
