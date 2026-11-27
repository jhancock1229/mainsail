<template>
    <div class="sh-page sh-page--tabs shell-print" :data-tab="tab">
        <shell-header :title="$t('Shell.Pages.print')" :status="shellStatusLine" tabs />
        <shell-tabs
            class="sh-page__tabs"
            :tabs="tabs"
            :value="tab"
            :label="$t('Shell.Pages.print')"
            @input="goTo('print', $event)" />
        <div class="sh-columns sh-columns--1">
            <div v-if="tab === 'files'" data-section="files" class="sh-host">
                <gcodefiles-panel />
            </div>
            <div v-else-if="tab === 'queue'" data-section="queue" class="sh-host">
                <jobqueue-panel />
            </div>
            <div v-else-if="tab === 'preview'" data-section="preview" class="sh-host shell-print__viewer">
                <viewer-page />
            </div>
            <section v-else class="sh-col">
                <p class="sh-note">{{ $t('Files.GcodesRootDirectoryDoesntExists') }}</p>
            </section>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import GcodefilesPanel from '@/components/panels/GcodefilesPanel.vue'
import JobqueuePanel from '@/components/panels/JobqueuePanel.vue'

@Component({
    components: {
        GcodefilesPanel,
        JobqueuePanel,
        ShellHeader,
        ShellTabs,
        ViewerPage: () => import('@/pages/Viewer.vue'),
    },
})
export default class ShellPrintPage extends Mixins(ShellMixin) {
    @Prop({ type: String, default: 'files' }) declare readonly tab: string

    get tabs(): ShellTabItem[] {
        return this.availableShellTabs('print').map((tab) => ({
            id: tab.id,
            label: this.$t(`Shell.Tabs.print.${tab.id}`).toString(),
        }))
    }
}
</script>

<style scoped>
.shell-print__viewer {
    --app-height: calc(100vh - 110px);
}
</style>
