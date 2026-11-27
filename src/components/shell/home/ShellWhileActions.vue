<template>
    <footer :aria-label="$t('Shell.Print.While')" class="shell-while">
        <div class="shell-while__label">{{ $t('Shell.Print.While') }}</div>
        <button
            v-for="action in actions"
            :key="action"
            type="button"
            class="sh-btn sh-btn--56"
            :data-action="action"
            @click="run(action)">
            {{ whileActionLabel(action) }}
        </button>
        <shell-speed-flow-dialog v-model="showSpeedAndFlow" />
    </footer>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import ShellSpeedFlowDialog from '@/components/shell/ShellSpeedFlowDialog.vue'
import { ShellPageId } from '@/plugins/shellNavigation'
import { WhileActionId, whileActionTargets } from '@/plugins/shellHomeLayout'

@Component({ components: { ShellSpeedFlowDialog } })
export default class ShellWhileActions extends Mixins(ShellHomeLayoutsMixin) {
    @Prop({ type: Array, required: true }) declare readonly actions: WhileActionId[]

    showSpeedAndFlow = false

    run(action: WhileActionId): void {
        const target = whileActionTargets[action]
        if (target === null) {
            this.showSpeedAndFlow = true
            return
        }

        this.goTo(target.page as ShellPageId, target.tab)
    }
}
</script>

<style scoped>
.shell-while {
    display: grid;
    grid-template-columns: auto repeat(4, minmax(0, 1fr));
    gap: 12px;
    align-items: center;
    padding: 16px 28px;
}

.shell-while__label {
    font-size: 13px;
    color: var(--shell-muted);
    padding-right: 8px;
}
</style>
