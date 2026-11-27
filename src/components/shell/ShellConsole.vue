<template>
    <div class="shell-console">
        <div class="shell-console__input">
            <console-textarea ref="gcodeCommandField" />
        </div>
        <div ref="scroller" class="shell-console__log">
            <console-table :events="events" :is-mini="true" @command-click="commandClick" />
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ConsoleMixin from '@/components/mixins/console'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import ConsoleTextarea from '@/components/inputs/ConsoleTextarea.vue'

@Component({ components: { ConsoleTable, ConsoleTextarea } })
export default class ShellConsole extends Mixins(BaseMixin, ConsoleMixin) {
    @Ref() readonly gcodeCommandField!: ConsoleTextarea

    get events(): unknown[] {
        return this.$store.getters['server/getConsoleEvents'](true, 250)
    }

    commandClick(message: string): void {
        this.gcodeCommandField.setGcode(message)
    }
}
</script>

<style scoped>
.shell-console {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.shell-console__log {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
}
</style>
