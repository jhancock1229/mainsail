<template>
    <div class="shell" :class="'shell--' + shellLocation.page">
        <shell-rail />
        <main class="shell__main">
            <component :is="pageComponent" :key="shellLocation.page" :tab="shellLocation.tab" />
        </main>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
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
    },
})
export default class TheShell extends Mixins(ShellMixin) {
    get pageComponent(): string {
        return `shell-${this.shellLocation.page}-page`
    }

    get settingsTabs(): PaletteSettingsTab[] {
        const available = this.availableShellTabs('settings').map((tab) => tab.id)

        return buildShellSettingsTabs((key) => this.$t(key).toString()).filter((tab) => available.includes(tab.name))
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

    openSettingsTab(name: string): void {
        const path = shellPath('settings', name)
        if (this.$route.path !== path) this.$router.push(path)
    }
}
</script>
