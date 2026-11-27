<template>
    <div class="shell-block" :class="blockClasses" :data-block="id" :style="blockStyle">
        <shell-home-idle v-if="idleSection" :block="id" />
        <shell-home-print v-else-if="id === 'job'" block="job" />
        <shell-home-error v-else-if="id === 'problem'" block="problem" />
        <template v-else-if="id === 'camera'">
            <h2 v-if="!tabbed" class="sh-h2">{{ homeBlockLabel(id) }}</h2>
            <shell-camera />
        </template>
        <template v-else-if="id === 'console'">
            <h2 v-if="!tabbed" class="sh-h2">{{ homeBlockLabel(id) }}</h2>
            <shell-console />
        </template>
        <template v-else-if="id === 'heat'">
            <shell-heat v-if="klipperState === 'ready'" />
            <template v-else>
                <h2 class="sh-h2">{{ homeBlockLabel(id) }}</h2>
                <div class="sh-muted sh-small">{{ $t('Shell.Home.NotWhileOffline') }}</div>
            </template>
        </template>
        <template v-else-if="id === 'spool'">
            <shell-spool v-if="tracksSpool" :printing="jobState" />
            <template v-else>
                <h2 class="sh-h2">{{ homeBlockLabel(id) }}</h2>
                <div class="sh-muted sh-small">{{ $t('Shell.Home.SpoolOff') }}</div>
            </template>
        </template>
        <shell-events v-else-if="id === 'events'" />
        <shell-home-macros v-else-if="id === 'macros'" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import ShellHomeIdle from '@/components/shell/ShellHomeIdle.vue'
import ShellHomePrint from '@/components/shell/ShellHomePrint.vue'
import ShellHomeError from '@/components/shell/ShellHomeError.vue'
import ShellCamera from '@/components/shell/ShellCamera.vue'
import ShellConsole from '@/components/shell/ShellConsole.vue'
import ShellHeat from '@/components/shell/ShellHeat.vue'
import ShellSpool from '@/components/shell/ShellSpool.vue'
import ShellEvents from '@/components/shell/ShellEvents.vue'
import ShellHomeMacros from '@/components/shell/home/ShellHomeMacros.vue'
import { HomeBlockId, HomeLayoutState, getHomeBlock } from '@/plugins/shellHomeLayout'
import { resolveSpoolSource, resolveSpoolTrackerSettings } from '@/plugins/spoolTracker'

@Component({
    components: {
        ShellCamera,
        ShellConsole,
        ShellEvents,
        ShellHeat,
        ShellHomeError,
        ShellHomeIdle,
        ShellHomeMacros,
        ShellHomePrint,
        ShellSpool,
    },
})
export default class ShellHomeBlock extends Mixins(ShellHomeLayoutsMixin) {
    @Prop({ type: String, required: true }) declare readonly id: HomeBlockId
    @Prop({ type: String, required: true }) declare readonly state: HomeLayoutState
    @Prop({ type: Boolean, default: false }) declare readonly tabbed: boolean
    @Prop({ type: Boolean, default: false }) declare readonly alone: boolean

    get idleSection(): boolean {
        return ['start', 'ready', 'last'].includes(this.id)
    }

    get jobState(): boolean {
        return ['printing', 'finished'].includes(this.state)
    }

    get tracksSpool(): boolean {
        const settings = resolveSpoolTrackerSettings(this.$store.state.gui.spoolTracker)

        return resolveSpoolSource({ components: this.moonrakerComponents, trackerEnabled: settings.enabled }) !== 'none'
    }

    get grows(): boolean {
        return this.alone || this.tabbed || getHomeBlock(this.id).grows
    }

    get blockClasses(): Record<string, boolean> {
        return {
            ['shell-block--' + this.id]: true,
            'shell-block--grows': this.grows,
            'shell-block--tabbed': this.tabbed,
            'shell-block--scrolls': getHomeBlock(this.id).scrolls,
        }
    }

    get blockStyle(): Record<string, string> {
        const block = getHomeBlock(this.id)
        if (this.alone || this.tabbed || !block.grows) return {}

        return { minHeight: `${block.height}px` }
    }
}
</script>

<style scoped>
.shell-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 0 0 auto;
    min-height: 0;
    min-width: 0;
}

.shell-block--grows {
    flex: 1 1 0;
    overflow: hidden;
}

.shell-block--tabbed ::v-deep .sh-h2 {
    display: none;
}

.shell-block--scrolls {
    overflow-y: auto;
}

.shell-block ::v-deep .sh-block-host {
    display: contents;
}

.shell-block ::v-deep .sh-block-host > .sh-col {
    flex: 1 1 auto;
    padding: 0;
    background: transparent;
    overflow: visible;
}
</style>
