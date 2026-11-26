<template>
    <div class="shell-events">
        <h2 class="sh-h2">{{ $t('Shell.Events.Title') }}</h2>
        <div class="shell-events__list">
            <div v-for="(line, index) in lines" :key="index" class="shell-events__line">
                <span class="shell-events__time">{{ line.time }}</span>
                {{ line.text }}
            </div>
            <div v-if="lines.length === 0" class="sh-muted">{{ $t('Shell.Events.Empty') }}</div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { recordedPrintTimeline } from '@/plugins/printTimeline'
import { describePrintEvents } from '@/plugins/shellStatus'

@Component
export default class ShellEvents extends Mixins(BaseMixin) {
    get lines(): { time: string; text: string }[] {
        return describePrintEvents(recordedPrintTimeline.timeline).map((line) => ({
            time: line.at === null ? '' : this.formatTime(line.at),
            text: this.$t(`Shell.Events.${line.key}`, line.params).toString(),
        }))
    }
}
</script>

<style scoped>
.shell-events {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    flex: 1 1 0;
}

.shell-events__list {
    font-size: 14px;
    line-height: 1.9;
    color: var(--shell-text-2);
    min-height: 0;
    overflow: hidden;
}

.shell-events__line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.shell-events__time {
    display: inline-block;
    min-width: 46px;
    margin-right: 6px;
    color: var(--shell-muted);
}
</style>
