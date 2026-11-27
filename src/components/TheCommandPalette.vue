<template>
    <div v-if="paletteSettings.enabled" class="command-palette-activator d-flex align-center">
        <button
            v-if="$vuetify.breakpoint.lgAndUp"
            type="button"
            class="command-palette-trigger mx-2"
            :aria-label="$t('CommandPalette.Open')"
            @click="open">
            <v-icon small class="mr-2">{{ mdiMagnify }}</v-icon>
            <span class="command-palette-trigger__label">{{ $t('CommandPalette.Trigger') }}</span>
            <span class="command-palette-trigger__keys">
                <kbd v-for="key in paletteShortcutKeys" :key="key" class="command-palette-key">{{ key }}</kbd>
            </span>
        </button>
        <v-btn
            v-else
            icon
            tile
            class="command-palette-trigger-icon"
            :aria-label="$t('CommandPalette.Open')"
            @click="open">
            <v-icon>{{ mdiMagnify }}</v-icon>
        </v-btn>
        <v-dialog
            v-model="show"
            :max-width="640"
            :fullscreen="isMobile"
            :transition="false"
            content-class="command-palette">
            <v-card v-if="show" class="command-palette__card d-flex flex-column">
                <div class="command-palette__inner d-flex flex-column" @keydown="onKeydown" @mousedown="keepFocus">
                    <template v-if="confirming">
                        <div class="command-palette__confirm pa-6">
                            <div class="d-flex align-center mb-4">
                                <div class="command-palette__confirm-icon mr-4" :class="confirmColor + '--text'">
                                    <v-icon :color="confirmColor">{{ confirming.icon }}</v-icon>
                                </div>
                                <div class="min-width-0">
                                    <div class="text-overline command-palette__muted">
                                        {{ $t('CommandPalette.Confirm.Headline') }}
                                    </div>
                                    <div class="text-h6 text-truncate">{{ confirming.title }}</div>
                                </div>
                            </div>
                            <p class="body-2 mb-6">{{ confirming.confirmText }}</p>
                            <div class="d-flex justify-end align-center">
                                <v-btn text class="mr-2 command-palette__back" @click="back">
                                    {{ $t('Buttons.Cancel') }}
                                    <kbd class="command-palette-key ml-2 d-none d-sm-inline-block">
                                        {{ $t('CommandPalette.Keys.Esc') }}
                                    </kbd>
                                </v-btn>
                                <v-btn
                                    ref="confirmButton"
                                    depressed
                                    :color="confirmColor"
                                    class="command-palette__confirm-button"
                                    @click="confirm">
                                    {{ confirming.title }}
                                    <kbd class="command-palette-key ml-2 d-none d-sm-inline-block">↵</kbd>
                                </v-btn>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <div class="command-palette__header d-flex align-center px-4">
                            <v-icon class="mr-3 command-palette__muted">{{ mdiMagnify }}</v-icon>
                            <input
                                ref="input"
                                v-model="query"
                                type="text"
                                class="command-palette__input"
                                autocomplete="off"
                                autocapitalize="off"
                                autocorrect="off"
                                spellcheck="false"
                                role="combobox"
                                aria-expanded="true"
                                aria-controls="command-palette-results"
                                :aria-label="$t('CommandPalette.Placeholder')"
                                :placeholder="$t('CommandPalette.Placeholder')" />
                            <v-btn v-if="isMobile" icon small :aria-label="$t('Buttons.Close')" @click="close">
                                <v-icon>{{ mdiClose }}</v-icon>
                            </v-btn>
                            <kbd v-else class="command-palette-key">{{ $t('CommandPalette.Keys.Esc') }}</kbd>
                        </div>
                        <v-divider />
                        <div
                            id="command-palette-results"
                            ref="results"
                            class="command-palette__results py-2"
                            role="listbox">
                            <template v-for="section in indexedSections">
                                <div
                                    :key="'section-' + section.key"
                                    class="command-palette__section d-flex align-center px-5">
                                    <span>{{ $t('CommandPalette.Sections.' + section.key) }}</span>
                                    <v-spacer />
                                    <span v-if="section.total > section.rows.length" class="command-palette__more">
                                        {{
                                            $t('CommandPalette.MoreResults', {
                                                count: section.total - section.rows.length,
                                            })
                                        }}
                                    </span>
                                </div>
                                <command-palette-row
                                    v-for="row in section.rows"
                                    :key="section.key + ':' + row.result.command.id"
                                    :ref="'row-' + row.index"
                                    :result="row.result"
                                    :selected="row.index === selectedIndex"
                                    @run="run(row.result.command)"
                                    @hover="hover(row.index, $event)"
                                    @pin="pin(row.result.command.id)" />
                            </template>
                            <div v-if="!flatResults.length" class="command-palette__empty text-center pa-8">
                                <v-icon large class="mb-2 command-palette__muted">{{ mdiMagnifyClose }}</v-icon>
                                <div class="body-2 command-palette__muted">
                                    {{ $t('CommandPalette.NoResults', { query: query.trim() }) }}
                                </div>
                            </div>
                        </div>
                        <template v-if="!isMobile">
                            <v-divider />
                            <div class="command-palette__footer d-flex align-center px-4">
                                <span class="mr-4">
                                    <kbd class="command-palette-key">↑</kbd>
                                    <kbd class="command-palette-key">↓</kbd>
                                    {{ $t('CommandPalette.Footer.Navigate') }}
                                </span>
                                <span class="mr-4">
                                    <kbd class="command-palette-key">↵</kbd>
                                    {{ $t('CommandPalette.Footer.Run') }}
                                </span>
                                <span>
                                    <kbd v-for="key in pinShortcutKeys" :key="key" class="command-palette-key">
                                        {{ key }}
                                    </kbd>
                                    {{ $t('CommandPalette.Footer.Pin') }}
                                </span>
                                <v-spacer />
                                <span>{{ $t('CommandPalette.Footer.Count', { count: paletteCommands.length }) }}</span>
                            </div>
                        </template>
                    </template>
                </div>
            </v-card>
        </v-dialog>
        <start-print-dialog
            v-if="printFile"
            ref="startPrintDialog"
            v-model="showStartPrint"
            :file="printFile"
            current-path="" />
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Mixins, Ref, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import CommandPaletteMixin from '@/components/mixins/commandPalette'
import CommandPaletteRow from '@/components/commandPalette/CommandPaletteRow.vue'
import StartPrintDialog from '@/components/dialogs/StartPrintDialog.vue'
import { FileStateGcodefile } from '@/store/files/types'
import {
    addRecentCommand,
    flattenPaletteSections,
    isEditorSearchTarget,
    keepSelection,
    matchesShortcut,
    nextSelectableIndex,
    PaletteCommand,
    PaletteResult,
    PaletteSection,
    searchPaletteCommands,
} from '@/plugins/commandPalette'
import { commandPaletteBus, OPEN_SETTINGS_TAB } from '@/plugins/commandPaletteBus'
import { EventBus } from '@/plugins/eventBus'
import { startDashboardEdit } from '@/plugins/dashboardEditBus'
import { startShellHomeEdit } from '@/plugins/shellHomeEdit'
import { homeLayoutStateFor } from '@/plugins/shellHomeLayout'
import { resolveShellHomeState } from '@/plugins/shellStatus'
import { resolveDashboardLayoutState } from '@/plugins/dashboardLayoutState'
import { mdiClose, mdiMagnify, mdiMagnifyClose } from '@mdi/js'

interface IndexedSection {
    key: PaletteSection['key']
    total: number
    rows: { index: number; result: PaletteResult }[]
}

const PIN_SHORTCUT = 'alt+p'
// the start print dialog focuses itself two ticks after it opened
const START_PRINT_FOCUS_DELAY = 100

@Component({
    components: { CommandPaletteRow, StartPrintDialog },
})
export default class TheCommandPalette extends Mixins(BaseMixin, CommandPaletteMixin) {
    mdiClose = mdiClose
    mdiMagnify = mdiMagnify
    mdiMagnifyClose = mdiMagnifyClose

    @Ref() readonly input!: HTMLInputElement | undefined
    @Ref() readonly results!: HTMLElement | undefined
    @Ref() readonly confirmButton!: Vue | undefined
    @Ref() readonly startPrintDialog!: Vue | undefined

    show = false
    query = ''
    selectedId: string | null = null
    selectedQuery = ''
    confirming: PaletteCommand | null = null
    pointerPosition = ''
    printFilename: string | null = null
    showStartPrint = false

    get sections(): PaletteSection[] {
        if (!this.show) return []

        return searchPaletteCommands(this.paletteCommands, this.query, {
            pinned: this.paletteSettings.pinned,
            recent: this.paletteSettings.recent,
        })
    }

    get flatResults(): PaletteResult[] {
        return flattenPaletteSections(this.sections)
    }

    get indexedSections(): IndexedSection[] {
        let index = 0

        return this.sections.map((section) => ({
            key: section.key,
            total: section.total,
            rows: section.results.map((result) => ({ index: index++, result })),
        }))
    }

    get selectedIndex(): number {
        if (this.selectedId === null) return -1

        return this.flatResults.findIndex((result) => result.command.id === this.selectedId)
    }

    get pinShortcutKeys(): string[] {
        return this.paletteKeyLabels(PIN_SHORTCUT)
    }

    get confirmColor(): string {
        return this.confirming?.danger ? 'error' : 'primary'
    }

    get printFile(): FileStateGcodefile | null {
        if (this.printFilename === null) return null

        const files: FileStateGcodefile[] = this.$store.getters['files/getAllGcodes'] ?? []

        return files.find((file) => file.filename === this.printFilename) ?? null
    }

    get enabled(): boolean {
        return this.paletteSettings.enabled
    }

    @Watch('show')
    onShowChanged(newVal: boolean): void {
        if (!newVal) return

        this.query = ''
        this.confirming = null
        this.selectFirst()
        this.focusInput()
    }

    @Watch('query')
    onQueryChanged(): void {
        if (this.results) this.results.scrollTop = 0
    }

    @Watch('flatResults')
    onResultsChanged(): void {
        if (this.query !== this.selectedQuery) return this.selectFirst()

        this.selectedId = keepSelection(this.flatResults, this.selectedId)
    }

    @Watch('showStartPrint')
    onShowStartPrintChanged(newVal: boolean): void {
        if (!newVal) this.printFilename = null
    }

    @Watch('enabled')
    onEnabledChanged(newVal: boolean): void {
        if (!newVal) this.show = false
    }

    mounted(): void {
        window.addEventListener('keydown', this.onGlobalKeydown, true)
    }

    beforeDestroy(): void {
        window.removeEventListener('keydown', this.onGlobalKeydown, true)
    }

    onGlobalKeydown(event: KeyboardEvent): void {
        if (!this.enabled || commandPaletteBus.recordingShortcut) return
        if (!matchesShortcut(event, this.paletteSettings.shortcut, this.isMac)) return
        if (isEditorSearchTarget(event.target)) return

        event.preventDefault()
        event.stopPropagation()
        if (event.repeat) return

        this.show = !this.show
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.isComposing) return
        if (this.confirming) return this.onConfirmKeydown(event)

        if (matchesShortcut(event, PIN_SHORTCUT, this.isMac)) {
            event.preventDefault()
            if (this.selectedId !== null) this.pin(this.selectedId)
            return
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                this.move(1)
                break
            case 'ArrowUp':
                event.preventDefault()
                this.move(-1)
                break
            case 'Tab':
                event.preventDefault()
                this.move(event.shiftKey ? -1 : 1)
                break
            case 'Enter': {
                event.preventDefault()
                const selected = this.flatResults[this.selectedIndex]
                if (selected && !event.repeat) this.run(selected.command)
                break
            }
            case 'Escape':
                event.preventDefault()
                event.stopPropagation()
                this.close()
                break
        }
    }

    onConfirmKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            this.back()
            return
        }
        if (event.key !== 'Enter') return

        event.preventDefault()
        if (event.repeat) return
        if ((event.target as HTMLElement | null)?.closest('.command-palette__back')) return this.back()

        this.confirm()
    }

    open(): void {
        this.show = true
    }

    close(): void {
        this.show = false
    }

    back(): void {
        this.confirming = null
        this.focusInput()
    }

    focusInput(): void {
        this.$nextTick(() => window.setTimeout(() => this.input?.focus(), 0))
    }

    keepFocus(event: MouseEvent): void {
        if (event.target !== this.input) event.preventDefault()
    }

    select(index: number): void {
        const command = this.flatResults[index]?.command
        if (!command || command.disabledReason !== null) return

        this.selectedId = command.id
    }

    hover(index: number, event: MouseEvent): void {
        // browsers also send mousemove when the list scrolls below a resting pointer
        const position = `${event.screenX},${event.screenY}`
        if (position === this.pointerPosition) return

        this.pointerPosition = position
        this.select(index)
    }

    selectFirst(): void {
        this.selectedQuery = this.query
        this.selectedId = this.flatResults[nextSelectableIndex(this.flatResults, -1, 1)]?.command.id ?? null
    }

    move(delta: 1 | -1): void {
        this.select(nextSelectableIndex(this.flatResults, this.selectedIndex, delta))
        this.$nextTick(() => {
            const row = this.$refs['row-' + this.selectedIndex] as Vue[] | undefined
            row?.[0]?.$el.scrollIntoView({ block: 'nearest' })
        })
    }

    pin(id: string): void {
        this.togglePalettePin(id)
        this.focusInput()
    }

    startPrint(filename: string): void {
        this.printFilename = filename
        if (this.printFile === null) {
            this.printFilename = null
            this.$toast.error(this.$t('CommandPalette.NotAvailable').toString())
            return
        }

        this.$nextTick(() => {
            this.showStartPrint = true
            window.setTimeout(() => {
                const dialog = this.startPrintDialog?.$children[0]?.$refs.dialog as HTMLElement | undefined
                dialog?.querySelector<HTMLElement>('.v-card__actions .v-btn.primary--text')?.focus()
            }, START_PRINT_FOCUS_DELAY)
        })
    }

    run(command: PaletteCommand): void {
        if (command.disabledReason !== null) return

        if (command.confirmText !== null) {
            this.confirming = command
            this.$nextTick(() => (this.confirmButton?.$el as HTMLElement | undefined)?.focus())
            return
        }

        this.execute(command)
    }

    confirm(): void {
        const command = this.confirming
        if (command === null) return

        const current = this.paletteCommands.find((entry) => entry.id === command.id)
        if (!current || current.disabledReason !== null) {
            this.$toast.error(current?.disabledReason ?? this.$t('CommandPalette.NotAvailable').toString())
            this.back()
            return
        }

        this.execute(current)
    }

    execute(command: PaletteCommand): void {
        this.savePaletteSetting('recent', addRecentCommand(this.paletteSettings.recent, command.id))
        this.close()

        const run = command.run
        switch (run.type) {
            case 'route':
                if (this.$route.path !== run.to) this.$router.push(run.to)
                break
            case 'link':
                window.open(run.href, run.target ?? '_self')
                break
            case 'settings':
                EventBus.$emit(OPEN_SETTINGS_TAB, run.tab)
                break
            case 'setting':
                this.$store.dispatch('gui/saveSetting', { name: run.name, value: run.value })
                break
            case 'gcode':
                run.scripts.forEach((script) => {
                    this.$store.dispatch('server/addEvent', { message: script, type: 'command' })
                    this.$socket.emit('printer.gcode.script', { script })
                })
                this.$toast.info(this.$t('CommandPalette.Sent', { command: command.title }).toString())
                break
            case 'socket':
                this.$socket.emit(run.method, {}, { loading: run.loading })
                this.$toast.info(this.$t('CommandPalette.Sent', { command: command.title }).toString())
                break
            case 'print':
                this.startPrint(run.filename)
                break
            case 'dashboard-layout':
                this.$store.dispatch('gui/switchDashboardLayout', run.id)
                if (this.$route.path !== '/') this.$router.push('/')
                break
            case 'home-layout':
                this.$store.dispatch('gui/switchHomeLayout', run.id)
                if (this.$route.path !== '/') this.$router.push('/')
                break
            case 'home-layout-edit':
                if (this.$route.path !== '/') this.$router.push('/')
                startShellHomeEdit(
                    homeLayoutStateFor(
                        resolveShellHomeState({
                            klipperState: this.klipperState,
                            printerState: this.printer_state,
                            filename: this.$store.state.printer.print_stats?.filename ?? '',
                        })
                    )
                )
                break
            case 'dashboard-layout-edit':
                if (this.$route.path !== '/') this.$router.push('/')
                startDashboardEdit(
                    resolveDashboardLayoutState({
                        enabled: this.$store.state.gui.dashboard.stateLayouts?.enabled ?? true,
                        klipperState: this.klipperState,
                        printerState: this.printer_state,
                    })
                )
                break
        }
    }
}
</script>

<style scoped>
.command-palette-trigger {
    display: flex;
    align-items: center;
    height: 32px;
    min-width: 230px;
    padding: 0 8px 0 12px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 16px;
    background-color: rgba(128, 128, 128, 0.1);
    color: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background-color 0.15s;
}

.command-palette-trigger:hover,
.command-palette-trigger:focus-visible {
    /*noinspection CssUnresolvedCustomProperty*/
    border-color: var(--color-primary);
    background-color: rgba(128, 128, 128, 0.18);
    outline: none;
}

.command-palette-trigger__label {
    flex: 1 1 auto;
    text-align: left;
    opacity: 0.7;
}

.command-palette-trigger__keys {
    margin-left: 12px;
    white-space: nowrap;
}

.command-palette__card {
    border-radius: 12px !important;
    overflow: hidden;
}

.command-palette__inner {
    min-height: 0;
    flex: 1 1 auto;
}

.command-palette__header {
    flex: 0 0 auto;
    height: 56px;
}

.command-palette__input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font-size: 1.0625rem;
}

.command-palette__input::placeholder {
    color: inherit;
    opacity: 0.45;
}

.command-palette__results {
    flex: 1 1 auto;
    min-height: 0;
    max-height: min(444px, calc(var(--app-height) - 260px));
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
}

.command-palette__section {
    height: 28px;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.55;
}

.command-palette__more {
    letter-spacing: normal;
    text-transform: none;
}

.command-palette__section:not(:first-child) {
    margin-top: 6px;
}

.command-palette__muted {
    opacity: 0.55;
}

.command-palette__footer {
    flex: 0 0 auto;
    height: 36px;
    font-size: 0.75rem;
}

.command-palette__footer > span {
    opacity: 0.7;
}

.command-palette__confirm-icon {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background-color: rgba(128, 128, 128, 0.16);
}

.min-width-0 {
    min-width: 0;
}
</style>

<style>
.v-dialog.command-palette:not(.v-dialog--fullscreen) {
    align-self: flex-start;
    margin-top: 12vh;
    border-radius: 12px;
}

.v-dialog--fullscreen.command-palette .command-palette__results {
    max-height: none;
}

.v-dialog--fullscreen.command-palette .command-palette__card {
    height: 100%;
    border-radius: 0 !important;
}

.command-palette-key {
    display: inline-block;
    min-width: 20px;
    padding: 1px 5px;
    margin: 0 1px;
    border: 1px solid rgba(128, 128, 128, 0.4);
    border-bottom-width: 2px;
    border-radius: 5px;
    background-color: rgba(128, 128, 128, 0.14) !important;
    color: inherit !important;
    font-family: inherit;
    font-size: 0.6875rem !important;
    font-weight: 500 !important;
    line-height: 1.4;
    text-align: center;
    text-transform: none;
    box-shadow: none !important;
}
</style>
