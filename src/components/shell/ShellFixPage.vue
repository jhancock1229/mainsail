<template>
    <div class="sh-page sh-page--tabs shell-fix" :data-tab="tab">
        <shell-header :title="$t('Shell.Pages.fix')" :status="shellStatusLine" tabs />
        <shell-tabs
            class="sh-page__tabs"
            :tabs="tabs"
            :value="tab"
            :label="$t('Shell.Pages.fix')"
            @input="goTo('fix', $event)" />

        <div v-if="tab === 'status'" class="sh-columns sh-columns--2">
            <section
                :aria-label="$t('Shell.Error.Title')"
                data-section="status"
                class="sh-col sh-col--scroll shell-fix__status">
                <h2 class="sh-h2">{{ $t('Shell.Fix.WhatIsWrong') }}</h2>
                <klippy-state-panel v-if="klipperState !== 'ready'" />
                <error-explainer v-else-if="printExplanation" :explanation="printExplanation" color="error" />
                <template v-else>
                    <div class="sh-big">{{ $t('Shell.Fix.AllGood') }}</div>
                    <p class="sh-note">{{ $t('Shell.Fix.AllGoodHelp') }}</p>
                </template>
                <min-settings-panel />
                <div class="sh-spacer" />
                <h2 class="sh-h2">{{ $t('Shell.Fix.Restart') }}</h2>
                <div class="shell-fix__restart">
                    <button
                        type="button"
                        class="sh-btn"
                        data-action="firmware-restart"
                        :disabled="klipperState === 'disconnected'"
                        @click="showRestart = 'firmware'">
                        {{ $t('Shell.Fix.FirmwareRestart') }}
                    </button>
                    <button
                        type="button"
                        class="sh-btn"
                        data-action="restart"
                        :disabled="klipperState === 'disconnected'"
                        @click="showRestart = 'klipper'">
                        {{ $t('Shell.Fix.KlipperRestart') }}
                    </button>
                </div>
            </section>
            <div data-section="endstops" class="sh-host">
                <endstop-panel v-if="klipperState === 'ready'" />
                <p v-else class="sh-note">{{ $t('Shell.Fix.EndstopsLater') }}</p>
            </div>
        </div>

        <div v-else-if="tab === 'console'" class="sh-columns sh-columns--1">
            <div data-section="console" class="sh-host shell-fix__console">
                <console-page />
            </div>
        </div>

        <div v-else class="sh-columns sh-columns--1">
            <div data-section="logs" class="sh-host">
                <logfiles-panel />
            </div>
        </div>

        <confirmation-dialog
            :value="showRestart !== null"
            :title="restartTitle"
            :text="$t('Shell.Fix.RestartText')"
            :action-button-text="$t('Buttons.Yes')"
            :cancel-button-text="$t('Buttons.No')"
            @input="showRestart = null"
            @action="restart" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import KlippyStatePanel from '@/components/panels/KlippyStatePanel.vue'
import MinSettingsPanel from '@/components/panels/MinSettingsPanel.vue'
import EndstopPanel from '@/components/panels/Machine/EndstopPanel.vue'
import LogfilesPanel from '@/components/panels/Machine/LogfilesPanel.vue'
import ErrorExplainer from '@/components/ui/ErrorExplainer.vue'
import ConsolePage from '@/pages/Console.vue'
import { ErrorExplanation, explainError } from '@/plugins/errorExplainer'

@Component({
    components: {
        ConfirmationDialog,
        ConsolePage,
        EndstopPanel,
        ErrorExplainer,
        KlippyStatePanel,
        LogfilesPanel,
        MinSettingsPanel,
        ShellHeader,
        ShellTabs,
    },
})
export default class ShellFixPage extends Mixins(ShellMixin) {
    @Prop({ type: String, default: 'status' }) declare readonly tab: string

    showRestart: 'firmware' | 'klipper' | null = null

    get tabs(): ShellTabItem[] {
        return this.availableShellTabs('fix').map((tab) => ({
            id: tab.id,
            label: this.$t(`Shell.Tabs.fix.${tab.id}`).toString(),
        }))
    }

    get printExplanation(): ErrorExplanation | null {
        if (this.printer_state !== 'error') return null

        return explainError(this.$store.state.printer.print_stats?.message, { klipperState: this.klipperState })
    }

    get restartTitle(): string {
        const key = this.showRestart === 'klipper' ? 'Shell.Fix.KlipperRestart' : 'Shell.Fix.FirmwareRestart'

        return this.$t(key).toString()
    }

    restart(): void {
        if (this.showRestart === 'klipper') this.$socket.emit('printer.restart', {}, { loading: 'restart' })
        else this.$socket.emit('printer.firmware_restart', {}, { loading: 'firmwareRestart' })
        this.showRestart = null
    }
}
</script>

<style scoped>
.shell-fix__restart {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.shell-fix__console {
    --app-height: calc(100vh - 70px);
}

.shell-fix__status ::v-deep .v-alert {
    margin-bottom: 0 !important;
}
</style>
