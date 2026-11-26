<template>
    <div class="kiosk-dashboard">
        <v-tabs
            v-model="selected"
            class="kiosk-dashboard__tabs"
            show-arrows
            center-active
            :height="tabsHeight"
            background-color="transparent">
            <v-tab
                v-for="name in shownPanels"
                :key="name"
                :tab-value="name"
                class="kiosk-dashboard__tab text-none"
                :data-panel="name">
                <v-icon left small>{{ convertPanelnameToIcon(name) }}</v-icon>
                {{ getPanelName(name) }}
            </v-tab>
        </v-tabs>
        <div
            ref="panelContainer"
            class="kiosk-dashboard__panels"
            @touchstart.passive="onTouchStart"
            @touchend.passive="onTouchEnd">
            <v-window v-model="selected" touchless>
                <v-window-item
                    v-for="name in panels"
                    :key="name"
                    :value="name"
                    :data-panel="name"
                    eager
                    class="kiosk-dashboard__panel">
                    <slot name="panel" :panel="name" />
                </v-window-item>
            </v-window>
        </div>
        <div class="kiosk-dashboard__position text-center text-caption text--secondary">
            {{ $t('Kiosk.Dashboard.Position', { current: selectedIndex + 1, total: shownPanels.length }) }}
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref, Watch } from 'vue-property-decorator'
import DashboardMixin from '@/components/mixins/dashboard'
import KioskMixin from '@/components/mixins/kiosk'
import { getViewportLayoutKeys } from '@/plugins/dashboardLayoutState'
import { kioskPanelSequence, resolveOpenPanel, swipeDirection } from '@/plugins/kiosk'
import { kioskSession } from '@/plugins/kioskSession'
import { GuiStateLayoutoption } from '@/store/gui/types'

const TABS_HEIGHT = 48
// a horizontal drag on these belongs to the control (or to the tabs inside a panel), not to the panel navigation
const SWIPE_IGNORED_TARGETS =
    '.v-slider, input, textarea, canvas, video, .v-data-table, .v-tabs, .cm-editor, .v-window .v-window'

@Component
export default class KioskDashboardFrame extends Mixins(DashboardMixin, KioskMixin) {
    @Ref() readonly panelContainer!: HTMLElement

    tabsHeight = TABS_HEIGHT
    touchStart: { x: number; y: number } | null = null
    emptyPanels: string[] = []
    contentObserver: MutationObserver | null = null

    get panels(): string[] {
        const columnCount = getViewportLayoutKeys(this.viewport).length
        const columns = columnCount === 1 ? [0] : Array.from({ length: columnCount }, (_, index) => index + 1)
        const names = columns.map((column) =>
            (
                this.$store.getters['gui/getPanels'](
                    this.viewport,
                    column,
                    true,
                    this.dashboardLayoutState
                ) as GuiStateLayoutoption[]
            ).map((panel) => panel.name)
        )

        return kioskPanelSequence(names, this.kioskSettings.hiddenPanels)
    }

    get shownPanels(): string[] {
        return this.panels.filter((name) => !this.emptyPanels.includes(name))
    }

    get selected(): string {
        return resolveOpenPanel(kioskSession.dashboardPanel, this.shownPanels, this.dashboardLayoutState)
    }

    set selected(name: string) {
        kioskSession.dashboardPanel = name
    }

    get selectedIndex(): number {
        return this.shownPanels.indexOf(this.selected)
    }

    @Watch('dashboardLayoutState')
    onLayoutStateChanged(): void {
        kioskSession.dashboardPanel = null
    }

    mounted(): void {
        this.contentObserver = new MutationObserver(this.findEmptyPanels)
        this.contentObserver.observe(this.panelContainer, { childList: true, subtree: true })
        this.findEmptyPanels()
    }

    beforeDestroy(): void {
        this.contentObserver?.disconnect()
    }

    findEmptyPanels(): void {
        const items = Array.from(this.panelContainer.querySelectorAll<HTMLElement>('.kiosk-dashboard__panel'))
        const empty = items.filter((item) => item.childElementCount === 0).map((item) => item.dataset.panel ?? '')
        if (empty.join() !== this.emptyPanels.join()) this.emptyPanels = empty
    }

    onTouchStart(event: TouchEvent): void {
        const target = event.target as HTMLElement | null
        if (event.touches.length !== 1 || target?.closest(SWIPE_IGNORED_TARGETS)) {
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

        const target = this.shownPanels[this.selectedIndex + (direction === 'next' ? 1 : -1)]
        if (target !== undefined) this.selected = target
    }
}
</script>

<style scoped>
.kiosk-dashboard {
    max-width: 760px;
    margin: 0 auto;
}

.kiosk-dashboard__tabs {
    position: sticky;
    top: 48px;
    z-index: 3;
    margin: 0 -12px 12px;
    width: auto;
    backdrop-filter: blur(10px);
}

.kiosk-dashboard__tabs.theme--dark {
    background-color: rgba(18, 18, 18, 0.88);
}

.kiosk-dashboard__tabs.theme--light {
    background-color: rgba(250, 250, 250, 0.88);
}

.kiosk-dashboard__tab {
    min-width: 0;
    font-size: 0.9rem;
    letter-spacing: normal;
}

.kiosk-dashboard__panels {
    min-height: 40vh;
    touch-action: pan-y;
}

.kiosk-dashboard__position {
    padding: 4px 0 8px;
}
</style>
