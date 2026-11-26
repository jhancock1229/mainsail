<template>
    <div ref="strip" class="column-widths" :class="{ 'column-widths--dragging': dragIndex !== null }">
        <template v-for="(width, index) in shownWidths">
            <div :key="'segment-' + index" class="column-widths__segment" :style="{ flexGrow: width }">
                {{ percent(width) }}
            </div>
            <div
                v-if="index < shownWidths.length - 1"
                :key="'divider-' + index"
                class="column-widths__divider"
                role="slider"
                tabindex="0"
                :aria-label="$t('Dashboard.Layouts.ColumnDivider', { left: index + 1, right: index + 2 })"
                :aria-valuenow="width"
                :aria-valuemin="minWidth"
                :aria-valuemax="width + shownWidths[index + 1] - minWidth"
                @pointerdown.prevent="startDrag(index, $event)"
                @keydown.left.prevent="nudge(index, -1)"
                @keydown.right.prevent="nudge(index, 1)"></div>
        </template>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Ref } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    COLUMN_WIDTH_UNITS,
    MIN_COLUMN_WIDTH_UNITS,
    columnWidthPercent,
    moveColumnDivider,
} from '@/plugins/dashboardNamedLayouts'

@Component
export default class DashboardColumnWidths extends Mixins(BaseMixin) {
    @Prop({ type: Array, required: true }) declare readonly widths: number[]

    @Ref() readonly strip!: HTMLElement

    minWidth = MIN_COLUMN_WIDTH_UNITS
    dragIndex: number | null = null
    dragStartX = 0
    dragStartWidths: number[] = []
    dragWidths: number[] | null = null

    get shownWidths(): number[] {
        return this.dragWidths ?? this.widths
    }

    beforeDestroy(): void {
        this.removeListeners()
    }

    percent(width: number): string {
        return `${Math.round(columnWidthPercent(width))}%`
    }

    nudge(index: number, delta: number): void {
        this.$emit('change', moveColumnDivider(this.widths, index, delta))
    }

    startDrag(index: number, event: PointerEvent): void {
        this.dragIndex = index
        this.dragStartX = event.clientX
        this.dragStartWidths = [...this.widths]
        this.dragWidths = [...this.widths]
        window.addEventListener('pointermove', this.onDrag)
        window.addEventListener('pointerup', this.endDrag)
        window.addEventListener('pointercancel', this.endDrag)
    }

    onDrag(event: PointerEvent): void {
        if (this.dragIndex === null) return

        const unit = this.strip.getBoundingClientRect().width / COLUMN_WIDTH_UNITS
        const delta = Math.round((event.clientX - this.dragStartX) / unit)
        const widths = moveColumnDivider(this.dragStartWidths, this.dragIndex, delta)
        if (widths.join() === this.dragWidths?.join()) return

        this.dragWidths = widths
        this.$emit('preview', widths)
    }

    endDrag(): void {
        const widths = this.dragWidths
        this.removeListeners()
        this.dragIndex = null
        this.dragWidths = null
        this.$emit('preview', null)
        if (widths !== null && widths.join() !== this.widths.join()) this.$emit('change', widths)
    }

    removeListeners(): void {
        window.removeEventListener('pointermove', this.onDrag)
        window.removeEventListener('pointerup', this.endDrag)
        window.removeEventListener('pointercancel', this.endDrag)
    }
}
</script>

<style scoped>
.column-widths {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 160px;
    height: 28px;
    user-select: none;
    touch-action: none;
}

.column-widths__segment {
    display: flex;
    flex-basis: 0;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.2);
    background: color-mix(in srgb, var(--v-primary-base) 18%, transparent);
}

.column-widths__divider {
    position: relative;
    flex: 0 0 12px;
    cursor: col-resize;
    outline: none;
}

.column-widths__divider::after {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: 4px;
    content: '';
    border-radius: 2px;
    background: currentColor;
    opacity: 0.35;
    transition: opacity 0.15s;
}

.column-widths__divider:hover::after,
.column-widths__divider:focus-visible::after,
.column-widths--dragging .column-widths__divider::after {
    opacity: 0.9;
}
</style>
