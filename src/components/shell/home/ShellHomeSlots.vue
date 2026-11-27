<template>
    <div class="shell-home-slots">
        <div class="sh-columns" :class="gridClasses">
            <shell-home-column
                v-for="(column, index) in columns"
                :key="index"
                :column="column"
                :state="state"
                :index="index" />
        </div>
        <shell-while-actions v-if="showActions" :actions="actions" />
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Prop } from 'vue-property-decorator'
import ShellHomeColumn from '@/components/shell/home/ShellHomeColumn.vue'
import ShellWhileActions from '@/components/shell/home/ShellWhileActions.vue'
import { HomeArrangement, HomeLayoutState, WhileActionId } from '@/plugins/shellHomeLayout'

@Component({ components: { ShellHomeColumn, ShellWhileActions } })
export default class ShellHomeSlots extends Vue {
    @Prop({ type: Array, required: true }) declare readonly columns: HomeArrangement
    @Prop({ type: String, required: true }) declare readonly state: HomeLayoutState
    @Prop({ type: Array, required: true }) declare readonly actions: WhileActionId[]
    @Prop({ type: Boolean, default: false }) declare readonly showActions: boolean

    get gridClasses(): Record<string, boolean> {
        const jobFirst = ['printing', 'finished'].includes(this.state)

        return {
            'sh-columns--757': jobFirst,
            'sh-columns--755': !jobFirst,
            'sh-columns--ruled-bottom': this.showActions,
        }
    }
}
</script>

<style scoped>
.shell-home-slots {
    display: contents;
}
</style>
