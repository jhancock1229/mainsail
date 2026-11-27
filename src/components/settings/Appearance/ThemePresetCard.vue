<template>
    <button
        type="button"
        class="theme-preset-card"
        :class="{ 'theme-preset-card--active': active }"
        :data-preset="presetId"
        :aria-pressed="active ? 'true' : 'false'"
        :style="{ '--theme-preset-accent': accent }"
        @click="$emit('select', presetId)">
        <span class="theme-preset-card__preview" aria-hidden="true">
            <slot />
        </span>
        <span class="theme-preset-card__label">
            <span class="theme-preset-card__name" :style="{ fontFamily }">{{ name }}</span>
            <v-icon v-if="active" small class="theme-preset-card__check">{{ mdiCheckCircle }}</v-icon>
        </span>
        <span class="theme-preset-card__description">{{ description }}</span>
    </button>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiCheckCircle } from '@mdi/js'

@Component
export default class ThemePresetCard extends Mixins(BaseMixin) {
    mdiCheckCircle = mdiCheckCircle

    @Prop({ type: String, required: true }) declare readonly presetId: string
    @Prop({ type: String, required: true }) declare readonly name: string
    @Prop({ type: String, required: true }) declare readonly description: string
    @Prop({ type: String, required: true }) declare readonly accent: string
    @Prop({ type: String, required: true }) declare readonly fontFamily: string
    @Prop({ type: Boolean, default: false }) declare readonly active: boolean
}
</script>

<style scoped>
.theme-preset-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;
}

.theme-preset-card:hover,
.theme-preset-card:focus-visible {
    border-color: var(--theme-preset-accent);
    outline: none;
}

.theme-preset-card:focus-visible,
.theme-preset-card--active {
    border-color: var(--theme-preset-accent);
    box-shadow: 0 0 0 1px var(--theme-preset-accent);
}

.theme-preset-card__preview {
    display: block;
    overflow: hidden;
    border-radius: 5px;
    border: 1px solid rgba(128, 128, 128, 0.2);
}

.theme-preset-card__check {
    color: var(--theme-preset-accent) !important;
}

.theme-preset-card__label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-top: 8px;
}

.theme-preset-card__name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.theme-preset-card__description {
    display: block;
    margin-top: 2px;
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
    .theme-preset-card {
        transition: none;
    }
}
</style>
