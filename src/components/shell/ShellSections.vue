<template>
    <nav v-if="entries.length > 1" class="shell-sections" role="tablist" :aria-label="$t('Shell.Compact.Sections')">
        <button
            v-for="entry in entries"
            :key="entry.key"
            type="button"
            role="tab"
            class="sh-tab shell-sections__tab"
            :data-entry="entry.key"
            :aria-selected="current && entry.key === current.key ? 'true' : 'false'"
            @click="open(entry)">
            {{ label(entry) }}
        </button>
    </nav>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import { buildShellSettingsTabs } from '@/components/shell/settingsTabs'
import { adjacentSection, shellPath, ShellSectionEntry, shellSectionEntries } from '@/plugins/shellNavigation'
import { shellCompactState } from '@/plugins/shellCompactState'
import { SWIPE_IGNORED_TARGETS, swipeDirection } from '@/plugins/kiosk'

const COLUMN_SELECTOR = '.sh-col, .sh-host'
const BARS_HEIGHT_PROPERTY = '--shell-compact-bars'
const SWIPE_IGNORED = `${SWIPE_IGNORED_TARGETS}, .v-window, .sh-jog`

@Component
export default class ShellSections extends Mixins(ShellMixin) {
    chosenKey: string | null = null
    chosenPath: string | null = null
    renderedColumns: string[] = []
    touchStart: { x: number; y: number } | null = null
    observer: MutationObserver | null = null
    frame: number | null = null
    main: HTMLElement | null = null

    get entries(): ShellSectionEntry[] {
        const { page, tab } = this.shellLocation
        const all = shellSectionEntries(page, {
            available: this.shellAvailability,
            homeState: this.shellHomeState,
            tab,
        })
        if (this.renderedColumns.length === 0) return all

        return all.filter((entry) => entry.tab !== tab || this.renderedColumns.includes(entry.column))
    }

    get current(): ShellSectionEntry | null {
        const here = this.entries.filter((entry) => entry.tab === this.shellLocation.tab)
        const chosen = this.chosenPath === this.$route.path ? here.find((entry) => entry.key === this.chosenKey) : null
        if (chosen) return chosen
        if (this.shellLocation.page === 'settings' && this.settingsTabInPath) return here[1] ?? null

        return here[0] ?? null
    }

    get settingsTabInPath(): boolean {
        return this.$route.path.replace(/\/+$/, '') !== shellPath('settings')
    }

    get settingsTabTitle(): string {
        const tabs = buildShellSettingsTabs((key) => this.$t(key).toString())

        return tabs.find((entry) => entry.name === this.shellLocation.tab)?.title ?? ''
    }

    @Watch('current', { immediate: true })
    onCurrentChanged(entry: ShellSectionEntry | null): void {
        if (entry?.view) shellCompactState.homeView = entry.view
        this.$nextTick(this.apply)
    }

    mounted(): void {
        this.main = document.querySelector<HTMLElement>('.shell__main')
        if (this.main === null) return

        this.observer = new MutationObserver(this.schedule)
        this.observer.observe(this.main, { childList: true, subtree: true })
        this.main.addEventListener('touchstart', this.onTouchStart, { passive: true })
        this.main.addEventListener('touchend', this.onTouchEnd, { passive: true })
        this.apply()
    }

    beforeDestroy(): void {
        this.observer?.disconnect()
        if (this.frame !== null) window.cancelAnimationFrame(this.frame)
        this.main?.removeEventListener('touchstart', this.onTouchStart)
        this.main?.removeEventListener('touchend', this.onTouchEnd)
        shellCompactState.homeView = null
        document.documentElement.style.removeProperty(BARS_HEIGHT_PROPERTY)
    }

    label(entry: ShellSectionEntry): string {
        if (this.shellLocation.page === 'settings' && entry.id === 'content') return this.settingsTabTitle
        if (entry.split) return this.$t(`Shell.Sections.${entry.id}`).toString()

        return this.$t(`Shell.Tabs.${this.shellLocation.page}.${entry.tab}`).toString()
    }

    open(entry: ShellSectionEntry): void {
        const { page, tab } = this.shellLocation
        const path = entry.tab === tab ? this.$route.path : shellPath(page, entry.tab)

        this.chosenKey = entry.key
        this.chosenPath = path
        if (path !== this.$route.path) this.$router.push(path)
    }

    schedule(): void {
        if (this.frame !== null) return

        this.frame = window.requestAnimationFrame(() => {
            this.frame = null
            this.apply()
        })
    }

    apply(): void {
        this.reserveBars()

        const container = this.main?.querySelector<HTMLElement>('.sh-columns')
        if (!container) return

        const columns = Array.from(container.children).filter((child): child is HTMLElement =>
            child.matches(COLUMN_SELECTOR)
        )
        const rendered = columns.map((column) => column.dataset.section ?? '').filter((name) => name !== '')
        if (rendered.join() !== this.renderedColumns.join()) this.renderedColumns = rendered

        const active = columns.find((column) => column.dataset.section === this.current?.column) ?? columns[0]
        columns.forEach((column) => {
            const state = column === active ? 'active' : 'idle'
            if (column.dataset.compact !== state) column.dataset.compact = state
        })

        const page = this.main?.querySelector<HTMLElement>('.sh-page')
        const section = active?.dataset.section ?? ''
        if (page && page.dataset.compactSection !== section) page.dataset.compactSection = section
    }

    reserveBars(): void {
        if (this.main === null) return

        const height = Math.max(0, Math.round(window.innerHeight - this.main.getBoundingClientRect().bottom))
        document.documentElement.style.setProperty(BARS_HEIGHT_PROPERTY, `${height}px`)
    }

    onTouchStart(event: TouchEvent): void {
        const target = event.target as HTMLElement | null
        if (event.touches.length !== 1 || target?.closest(SWIPE_IGNORED)) {
            this.touchStart = null
            return
        }

        this.touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }

    onTouchEnd(event: TouchEvent): void {
        const start = this.touchStart
        const end = event.changedTouches[0]
        this.touchStart = null
        if (start === null || end === undefined) return

        const direction = swipeDirection({ dx: end.clientX - start.x, dy: end.clientY - start.y })
        if (direction === null) return

        const neighbour = adjacentSection(this.entries, this.current?.key ?? null, direction)
        if (neighbour !== null) this.open(neighbour)
    }
}
</script>
