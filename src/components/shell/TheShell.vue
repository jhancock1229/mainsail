<template>
    <div class="shell" :class="'shell--' + shellLocation.page">
        <shell-rail />
        <main class="shell__main">
            <component :is="pageComponent" :key="shellLocation.page" :tab="shellLocation.tab" />
        </main>
        <start-print-dialog
            v-if="uploadedFile"
            :value="true"
            :file="uploadedFile"
            current-path=""
            @input="closeUploadPrompt" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import SpoolTrackerMixin from '@/components/mixins/spoolTracker'
import StartPrintDialog from '@/components/dialogs/StartPrintDialog.vue'
import { shellUpload } from '@/plugins/shellUpload'
import { SpoolUsage } from '@/plugins/spoolTracker'
import ShellRail from '@/components/shell/ShellRail.vue'
import ShellHomePage from '@/components/shell/ShellHomePage.vue'
import ShellPrintPage from '@/components/shell/ShellPrintPage.vue'
import ShellTunePage from '@/components/shell/ShellTunePage.vue'
import ShellFixPage from '@/components/shell/ShellFixPage.vue'
import ShellMachinePage from '@/components/shell/ShellMachinePage.vue'
import ShellSettingsPage from '@/components/shell/ShellSettingsPage.vue'
import { buildShellSettingsTabs } from '@/components/shell/settingsTabs'
import { commandPaletteBus, OPEN_SETTINGS_TAB, PaletteSettingsTab } from '@/plugins/commandPaletteBus'
import { EventBus } from '@/plugins/eventBus'
import { shellPath } from '@/plugins/shellNavigation'

@Component({
    components: {
        ShellRail,
        ShellHomePage,
        ShellPrintPage,
        ShellTunePage,
        ShellFixPage,
        ShellMachinePage,
        ShellSettingsPage,
        StartPrintDialog,
    },
})
export default class TheShell extends Mixins(ShellMixin, SpoolTrackerMixin) {
    get pageComponent(): string {
        return `shell-${this.shellLocation.page}-page`
    }

    get settingsTabs(): PaletteSettingsTab[] {
        const available = this.availableShellTabs('settings').map((tab) => tab.id)

        return buildShellSettingsTabs((key) => this.$t(key).toString()).filter((tab) => available.includes(tab.name))
    }

    get uploadedFile(): { filename: string } | null {
        return shellUpload.uploadedFilename === null ? null : { filename: shellUpload.uploadedFilename }
    }

    get uploadFailed(): boolean {
        return shellUpload.failed
    }

    @Watch('spoolUsage', { immediate: true })
    persistSpoolUsage(usage: SpoolUsage): void {
        const stored = this.spoolSettings
        if (this.spoolSource !== 'builtin' || stored.loadedAt === null) return
        if (usage.usedLength === stored.usedLength && usage.lastJobId === stored.lastJobId) return

        this.$store.dispatch('gui/saveSetting', { name: 'spoolTracker', value: { ...stored, ...usage } })
    }

    @Watch('uploadedFile')
    onUploaded(file: { filename: string } | null): void {
        if (file === null) return

        this.$toast.success(this.$t('App.TopBar.UploadOfFileSuccessful', { file: file.filename }).toString())
    }

    @Watch('uploadFailed')
    onUploadFailed(failed: boolean): void {
        if (failed) this.$toast.error(this.$t('App.TopBar.CannotUploadTheFile').toString())
    }

    @Watch('settingsTabs', { immediate: true })
    publishTabsToCommandPalette(tabs: PaletteSettingsTab[]): void {
        commandPaletteBus.settingsTabs = tabs
    }

    mounted(): void {
        EventBus.$on(OPEN_SETTINGS_TAB, this.openSettingsTab)
    }

    beforeDestroy(): void {
        EventBus.$off(OPEN_SETTINGS_TAB, this.openSettingsTab)
    }

    closeUploadPrompt(): void {
        shellUpload.uploadedFilename = null
    }

    openSettingsTab(name: string): void {
        const path = shellPath('settings', name)
        if (this.$route.path !== path) this.$router.push(path)
    }
}
</script>
