<template>
    <div class="sh-page shell-home" :class="pageClasses" :data-state="shellHomeState">
        <shell-header :title="shellHeadline" :status="statusLine">
            <shell-home-layout-menu v-if="showHomeLayoutMenu && !editing" />
        </shell-header>
        <shell-home-editor v-if="editing" />
        <shell-home-slots
            v-else-if="customized"
            :columns="arrangement"
            :state="currentHomeLayoutState"
            :actions="activeHomeLayout.actions"
            :show-actions="actionRow" />
        <shell-home-idle v-else-if="shellHomeState === 'idle'" />
        <shell-home-error v-else-if="shellHomeState === 'error'" />
        <shell-home-print v-else />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import ShellPrintMixin from '@/components/mixins/shellPrint'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import ShellHomeEditor from '@/components/shell/home/ShellHomeEditor.vue'
import ShellHomeLayoutMenu from '@/components/shell/home/ShellHomeLayoutMenu.vue'
import ShellHomeSlots from '@/components/shell/home/ShellHomeSlots.vue'
import { shellHomeEdit } from '@/plugins/shellHomeEdit'
import { HomeArrangement, isDefaultArrangement, isDefaultWhileActions } from '@/plugins/shellHomeLayout'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import ShellHomeIdle from '@/components/shell/ShellHomeIdle.vue'
import ShellHomePrint from '@/components/shell/ShellHomePrint.vue'
import ShellHomeError from '@/components/shell/ShellHomeError.vue'
import { resolveSpoolSource, resolveSpoolTrackerSettings } from '@/plugins/spoolTracker'

@Component({
    components: {
        ShellHeader,
        ShellHomeEditor,
        ShellHomeError,
        ShellHomeIdle,
        ShellHomeLayoutMenu,
        ShellHomePrint,
        ShellHomeSlots,
    },
})
export default class ShellHomePage extends Mixins(ShellPrintMixin, ShellHomeLayoutsMixin) {
    get editing(): boolean {
        return shellHomeEdit.editing
    }

    get actionRow(): boolean {
        return ['printing', 'paused'].includes(this.shellHomeState)
    }

    get arrangement(): HomeArrangement {
        return this.activeHomeLayout.states[this.currentHomeLayoutState]
    }

    get customized(): boolean {
        if (!isDefaultArrangement(this.currentHomeLayoutState, this.arrangement)) return true

        return this.actionRow && !isDefaultWhileActions(this.activeHomeLayout.actions)
    }

    get pageClasses(): Record<string, boolean> {
        return { 'sh-page--footer': this.actionRow && !this.editing }
    }

    get loadedMaterial(): string | null {
        const settings = resolveSpoolTrackerSettings(this.$store.state.gui.spoolTracker)
        const source = resolveSpoolSource({ components: this.moonrakerComponents, trackerEnabled: settings.enabled })
        if (source === 'spoolman') return this.$store.state.server.spoolman?.active_spool?.filament?.material ?? null
        if (source === 'none' || settings.loadedAt === null) return null

        return settings.material
    }

    get statusLine(): string {
        const state = this.shellHomeState
        if (state === 'idle') {
            const parts = [...this.shellTemperatureParts]
            if (this.loadedMaterial) {
                parts.push(this.$t('Shell.Status.Loaded', { material: this.loadedMaterial }).toString())
            }

            return parts.join(' · ')
        }
        if (this.klipperState !== 'ready') return this.$t('Shell.States.offline').toString()

        const parts = [this.printShortFilename]
        if (state === 'printing' && !this.printIsWarmingUp && this.printEta !== '--') {
            parts.push(this.$t('Shell.Status.DoneAt', { time: this.printEta }).toString())
        }
        if (state === 'finished') {
            parts.push(this.$t('Shell.Status.Took', { duration: this.printTotalDuration }).toString())
        }

        return parts.join(' · ')
    }
}
</script>
