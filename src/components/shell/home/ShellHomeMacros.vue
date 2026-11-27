<template>
    <div class="shell-macros">
        <div class="sh-row">
            <h2 class="sh-h2">{{ $t('Shell.Home.Blocks.macros') }}</h2>
            <router-link to="/tune/macros" class="shell-macros__all">{{ $t('Shell.Home.AllMacros') }}</router-link>
        </div>
        <div ref="grid" class="shell-macros__grid">
            <button
                v-for="macro in shownMacros"
                :key="macro.name"
                type="button"
                class="sh-btn sh-btn--44 shell-macros__macro text-truncate"
                :disabled="!klipperReadyForGui"
                :title="macro.name"
                @click="sendGcode(macro.name)">
                {{ label(macro.name) }}
            </button>
            <div v-if="macros.length === 0" class="sh-muted sh-small shell-macros__none">
                {{ $t('Shell.Home.NoMacros') }}
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import { PrinterStateMacro } from '@/store/printer/types'

const ROW_HEIGHT = 44
const ROW_GAP = 8
const COLUMNS = 2

@Component
export default class ShellHomeMacros extends Mixins(ShellMixin) {
    @Ref() readonly grid!: HTMLElement

    rows = 3
    observer: ResizeObserver | null = null

    get macros(): PrinterStateMacro[] {
        const hidden: string[] = (this.$store.state.gui.macros?.hiddenMacros ?? []).map((name: string) =>
            name.toLowerCase()
        )
        const macros: PrinterStateMacro[] = this.$store.getters['printer/getMacros'] ?? []

        return macros.filter((macro) => !hidden.includes(macro.name.toLowerCase()))
    }

    get shownMacros(): PrinterStateMacro[] {
        return this.macros.slice(0, this.rows * COLUMNS)
    }

    mounted(): void {
        this.observer = new ResizeObserver(() => this.measure())
        this.observer.observe(this.grid)
        this.measure()
    }

    beforeDestroy(): void {
        this.observer?.disconnect()
    }

    measure(): void {
        const rows = Math.floor((this.grid.clientHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP))
        if (rows !== this.rows) this.rows = Math.max(1, rows)
    }

    label(name: string): string {
        return name.replace(/_/g, ' ').toLowerCase()
    }
}
</script>

<style scoped>
.shell-macros {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1 1 0;
    min-height: 0;
}

.shell-macros__all {
    font-size: 13px;
    color: var(--shell-muted);
    text-decoration: none;
}

.shell-macros__all:hover {
    color: var(--shell-text);
    text-decoration: underline;
}

.shell-macros__grid {
    flex: 1 1 0;
    min-height: 44px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 44px;
    gap: 8px;
    align-content: start;
    overflow: hidden;
}

.shell-macros__macro {
    padding: 0 12px;
    text-transform: capitalize;
}

.shell-macros__none {
    grid-column: 1 / -1;
}
</style>
