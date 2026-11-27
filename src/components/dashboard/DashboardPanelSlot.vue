<template>
    <div :class="slotClasses" :data-panel="name" :data-density="density">
        <div v-if="editing" class="dashboard-slot__bar">
            <v-icon class="dashboard-slot__handle" :title="$t('Dashboard.Layouts.DragPanel')">{{ mdiDrag }}</v-icon>
            <v-icon small class="mr-2">{{ icon }}</v-icon>
            <span class="dashboard-slot__name text-truncate">{{ title }}</span>
            <v-spacer />
            <v-btn
                v-if="visible"
                class="dashboard-slot__density"
                text
                small
                :title="$t('Dashboard.Layouts.DensityHint')"
                @click="$emit('cycle-density')">
                <v-icon small left>{{ densityIcon }}</v-icon>
                {{ $t(`Dashboard.Layouts.Density.${density}`) }}
            </v-btn>
            <v-btn
                class="dashboard-slot__visibility"
                icon
                small
                :title="visible ? $t('Dashboard.Layouts.HidePanel') : $t('Dashboard.Layouts.ShowPanel')"
                @click="$emit('toggle-visible')">
                <v-icon small>{{ visible ? mdiEye : mdiEyeOff }}</v-icon>
            </v-btn>
        </div>
        <div v-if="visible" class="dashboard-slot__content">
            <slot />
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import DashboardMixin from '@/components/mixins/dashboard'
import { PanelDensity } from '@/plugins/dashboardNamedLayouts'
import { mdiArrowCollapseVertical, mdiArrowExpandVertical, mdiDrag, mdiEye, mdiEyeOff, mdiMinus } from '@mdi/js'
import { TranslateResult } from 'vue-i18n'

const selfSizedPanels = ['miniconsole', 'temperature', 'print-hero', 'webcam']

@Component({
    provide() {
        return { dashboardPanelSlot: this }
    },
})
export default class DashboardPanelSlot extends Mixins(DashboardMixin) {
    @Prop({ type: String, required: true }) declare readonly name: string
    @Prop({ type: Boolean, required: true }) declare readonly visible: boolean
    @Prop({ type: Boolean, required: true }) declare readonly editing: boolean
    @Prop({ type: String, required: true }) declare readonly density: PanelDensity

    mdiDrag = mdiDrag
    mdiEye = mdiEye
    mdiEyeOff = mdiEyeOff

    get title(): string | TranslateResult {
        return this.getPanelName(this.name)
    }

    get icon(): string {
        return this.convertPanelnameToIcon(this.name)
    }

    get densityIcon(): string {
        if (this.density === 'compact') return mdiArrowCollapseVertical
        if (this.density === 'expanded') return mdiArrowExpandVertical

        return mdiMinus
    }

    get slotClasses(): Record<string, boolean> {
        return {
            'dashboard-slot': true,
            [`dashboard-slot--${this.density}`]: true,
            'dashboard-slot--capped': this.density === 'compact' && !selfSizedPanels.includes(this.name),
            'dashboard-slot--editing': this.editing,
            'dashboard-slot--hidden': !this.visible,
        }
    }
}
</script>

<style scoped>
.dashboard-slot--editing {
    margin-bottom: 16px;
    border-radius: 6px;
    outline: 1px dashed rgba(128, 128, 128, 0.55);
    outline-offset: 3px;
}

.dashboard-slot--editing.dashboard-slot--hidden {
    opacity: 0.6;
}

.dashboard-slot__bar {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: 0 4px;
    font-size: 0.8125rem;
    font-weight: 500;
}

.dashboard-slot__density {
    text-transform: none;
    letter-spacing: normal;
}

.dashboard-slot__handle {
    padding: 4px;
    margin-right: 4px;
    cursor: grab;
    touch-action: none;
}

.dashboard-slot__name {
    min-width: 0;
}

.dashboard-slot--editing .dashboard-slot__content {
    pointer-events: none;
    user-select: none;
}

.dashboard-slot--editing ::v-deep .panel {
    margin-bottom: 0 !important;
}

.dashboard-slot--compact ::v-deep .panel {
    margin-bottom: 12px !important;
}

.dashboard-slot--capped ::v-deep .panel > .panel-toolbar ~ div {
    max-height: 220px;
    overflow-y: auto;
}

.dashboard-slot--compact ::v-deep .webcam-panel img,
.dashboard-slot--compact ::v-deep .webcam-panel video {
    max-height: 220px;
    object-fit: contain;
}

.dashboard-slot--compact ::v-deep .print-hero__stage {
    min-height: 220px;
}

.dashboard-slot--expanded ::v-deep .print-hero__stage {
    min-height: clamp(420px, 90cqw, 640px);
}
</style>
