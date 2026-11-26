<template>
    <div
        class="command-palette-row"
        :class="rowClasses"
        role="option"
        :aria-selected="selected ? 'true' : 'false'"
        :aria-disabled="disabled ? 'true' : 'false'"
        :data-command="command.id"
        @click="$emit('run')"
        @mousemove="$emit('hover')">
        <div class="command-palette-row__icon" :class="{ 'command-palette-row__icon--danger': danger }">
            <v-icon small>{{ command.icon }}</v-icon>
        </div>
        <div class="command-palette-row__text">
            <div class="command-palette-row__title text-truncate">
                <span
                    v-for="(segment, index) in titleSegments"
                    :key="index"
                    :class="{ 'command-palette-row__match': segment.match }"
                    v-text="segment.text" />
            </div>
            <div v-if="secondLine" class="command-palette-row__subtitle text-truncate">{{ secondLine }}</div>
        </div>
        <span v-if="selected && !disabled" class="command-palette-row__hint d-none d-sm-flex">
            {{ hint }}
            <kbd class="command-palette-key ml-2">↵</kbd>
        </span>
        <v-btn
            icon
            small
            tabindex="-1"
            class="command-palette-row__pin"
            :class="{ 'command-palette-row__pin--active': result.pinned }"
            :title="pinTitle"
            :aria-label="pinTitle"
            @click.stop="$emit('pin')">
            <v-icon small>{{ result.pinned ? mdiPin : mdiPinOutline }}</v-icon>
        </v-btn>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { highlightSegments, PaletteCommand, PaletteResult } from '@/plugins/commandPalette'
import { mdiPin, mdiPinOutline } from '@mdi/js'

@Component
export default class CommandPaletteRow extends Mixins(BaseMixin) {
    mdiPin = mdiPin
    mdiPinOutline = mdiPinOutline

    @Prop({ type: Object, required: true }) readonly result!: PaletteResult
    @Prop({ type: Boolean, default: false }) readonly selected!: boolean

    get command(): PaletteCommand {
        return this.result.command
    }

    get disabled(): boolean {
        return this.command.disabledReason !== null
    }

    get danger(): boolean {
        return this.command.confirmText !== null && this.command.group === 'actions'
    }

    get rowClasses(): Record<string, boolean> {
        return {
            'command-palette-row--selected': this.selected,
            'command-palette-row--disabled': this.disabled,
        }
    }

    get titleSegments(): { text: string; match: boolean }[] {
        return highlightSegments(this.command.title, this.result.positions)
    }

    get secondLine(): string {
        return this.command.disabledReason ?? this.command.subtitle
    }

    get hint(): string {
        return this.$t(`CommandPalette.Hints.${this.command.group}`).toString()
    }

    get pinTitle(): string {
        return this.$t(this.result.pinned ? 'CommandPalette.Unpin' : 'CommandPalette.Pin').toString()
    }
}
</script>

<style scoped>
.command-palette-row {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 6px 8px 6px 10px;
    margin: 0 8px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
}

.command-palette-row::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    /*noinspection CssUnresolvedCustomProperty*/
    background-color: var(--color-primary);
    opacity: 0;
    pointer-events: none;
}

.command-palette-row--selected::before {
    opacity: 0.16;
}

.command-palette-row--disabled {
    cursor: default;
}

.command-palette-row--disabled .command-palette-row__title,
.command-palette-row--disabled .command-palette-row__icon {
    opacity: 0.45;
}

.command-palette-row__icon {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-right: 12px;
    border-radius: 8px;
    background-color: rgba(128, 128, 128, 0.16);
}

.command-palette-row__icon--danger .v-icon {
    color: var(--v-error-base);
}

.command-palette-row__text {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
}

.command-palette-row__title {
    font-size: 0.9375rem;
    line-height: 1.3;
}

.command-palette-row__match {
    /*noinspection CssUnresolvedCustomProperty*/
    color: var(--color-primary);
    font-weight: 700;
}

.command-palette-row__subtitle {
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.6;
}

.command-palette-row__hint {
    position: relative;
    flex: 0 0 auto;
    align-items: center;
    margin-left: 12px;
    font-size: 0.75rem;
    opacity: 0.7;
}

.command-palette-row__pin {
    position: relative;
    flex: 0 0 auto;
    margin-left: 4px;
    opacity: 0;
}

.command-palette-row--selected .command-palette-row__pin,
.command-palette-row:hover .command-palette-row__pin {
    opacity: 0.6;
}

.command-palette-row .command-palette-row__pin--active,
.command-palette-row .command-palette-row__pin:hover {
    opacity: 1;
}

/* no hover on touch screens, so the pin is always reachable */
@media (hover: none) {
    .command-palette-row__pin {
        opacity: 0.6;
    }
}
</style>
