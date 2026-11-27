<template>
    <div class="sh-page sh-page--tabs shell-machine" :data-tab="tab">
        <shell-header :title="$t('Shell.Pages.machine')" :status="shellStatusLine" tabs />
        <shell-tabs
            class="sh-page__tabs"
            :tabs="tabs"
            :value="tab"
            :label="$t('Shell.Pages.machine')"
            @input="goTo('machine', $event)" />
        <div class="sh-columns sh-columns--1">
            <div class="sh-host" :data-section="tab" :class="'shell-machine__' + tab">
                <config-files-panel v-if="tab === 'config'" />
                <update-panel v-else-if="tab === 'updates'" />
                <system-panel v-else-if="tab === 'system'" />
                <template v-else-if="tab === 'outputs'">
                    <miscellaneous-panel />
                    <led-effects-panel />
                    <p v-if="klipperState !== 'ready'" class="sh-note">{{ $t('Shell.Tune.NotReady') }}</p>
                </template>
                <history-page v-else-if="tab === 'history'" />
                <timelapse-page v-else-if="tab === 'timelapse'" />
                <webcam-panel v-else-if="tab === 'cameras'" current-page="page" />
                <farm-page v-else-if="tab === 'printers'" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ConfigFilesPanel from '@/components/panels/Machine/ConfigFilesPanel.vue'
import UpdatePanel from '@/components/panels/Machine/UpdatePanel.vue'
import SystemPanel from '@/components/panels/Machine/SystemPanel.vue'
import MiscellaneousPanel from '@/components/panels/MiscellaneousPanel.vue'
import LedEffectsPanel from '@/components/panels/LedEffectsPanel.vue'
import WebcamPanel from '@/components/panels/WebcamPanel.vue'
import HistoryPage from '@/pages/History.vue'
import TimelapsePage from '@/pages/Timelapse.vue'
import FarmPage from '@/pages/Farm.vue'

@Component({
    components: {
        ConfigFilesPanel,
        FarmPage,
        HistoryPage,
        LedEffectsPanel,
        MiscellaneousPanel,
        ShellHeader,
        ShellTabs,
        SystemPanel,
        TimelapsePage,
        UpdatePanel,
        WebcamPanel,
    },
})
export default class ShellMachinePage extends Mixins(ShellMixin) {
    @Prop({ type: String, default: 'config' }) declare readonly tab: string

    get tabs(): ShellTabItem[] {
        return this.availableShellTabs('machine').map((tab) => ({
            id: tab.id,
            label: this.$t(`Shell.Tabs.machine.${tab.id}`).toString(),
        }))
    }
}
</script>
