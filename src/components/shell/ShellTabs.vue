<template>
    <div role="tablist" :aria-label="label" class="sh-tabs" :class="{ 'sh-tabs--small': small }">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="sh-tab"
            :data-tab="tab.id"
            :aria-selected="tab.id === value ? 'true' : 'false'"
            @click="$emit('input', tab.id)">
            {{ tab.label }}
        </button>
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Prop } from 'vue-property-decorator'

export interface ShellTabItem {
    id: string
    label: string
}

@Component
export default class ShellTabs extends Vue {
    @Prop({ type: Array, required: true }) declare readonly tabs: ShellTabItem[]
    @Prop({ type: String, default: '' }) declare readonly value: string
    @Prop({ type: String, required: true }) declare readonly label: string
    @Prop({ type: Boolean, default: false }) declare readonly small: boolean
}
</script>
