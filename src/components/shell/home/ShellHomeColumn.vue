<template>
    <section
        class="sh-col sh-col--gap-16 shell-slot"
        :class="{ 'sh-col--scroll': scrolls }"
        :aria-label="label"
        :data-column="index + 1"
        :data-mode="tabbed ? 'tabs' : 'split'">
        <template v-if="tabbed">
            <div class="sh-row shell-slot__head">
                <h2 class="sh-h2">{{ activeHeading }}</h2>
                <shell-tabs
                    :value="active"
                    :tabs="tabs"
                    :label="$t('Shell.Print.View')"
                    small
                    @input="selected = $event" />
            </div>
            <shell-home-block :id="active" :key="active" :state="state" tabbed />
        </template>
        <template v-else>
            <template v-for="(id, position) in column.blocks">
                <div v-if="position > 0" :key="id + '-rule'" class="sh-rule" />
                <shell-home-block :id="id" :key="id" :state="state" :alone="column.blocks.length === 1" />
            </template>
        </template>
    </section>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ShellHomeBlock from '@/components/shell/home/ShellHomeBlock.vue'
import { HomeBlockId, HomeColumn, HomeLayoutState, getHomeBlock } from '@/plugins/shellHomeLayout'

@Component({ components: { ShellHomeBlock, ShellTabs } })
export default class ShellHomeColumn extends Mixins(ShellHomeLayoutsMixin) {
    @Prop({ type: Object, required: true }) declare readonly column: HomeColumn
    @Prop({ type: String, required: true }) declare readonly state: HomeLayoutState
    @Prop({ type: Number, required: true }) declare readonly index: number

    selected = ''

    get tabbed(): boolean {
        return this.column.mode === 'tabs' && this.column.blocks.length > 1
    }

    get active(): HomeBlockId {
        return this.column.blocks.find((id) => id === this.selected) ?? this.column.blocks[0]
    }

    get tabs(): ShellTabItem[] {
        return this.column.blocks.map((id) => ({ id, label: this.homeBlockLabel(id) }))
    }

    get activeHeading(): string {
        return this.homeBlockLabel(this.active)
    }

    get label(): string {
        return this.column.blocks.map((id) => this.homeBlockLabel(id)).join(', ')
    }

    get scrolls(): boolean {
        return this.column.blocks.some((id) => getHomeBlock(id).scrolls)
    }
}
</script>

<style scoped>
.shell-slot__head {
    align-items: center;
    min-height: 44px;
}

.shell-slot__head .sh-tabs {
    overflow: hidden;
}
</style>
