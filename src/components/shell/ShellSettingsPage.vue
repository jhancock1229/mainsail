<template>
    <div class="sh-page shell-settings" :data-tab="tab">
        <shell-header :title="$t('Shell.Pages.settings')" :status="$t('Shell.Settings.Status')" />
        <div class="sh-columns shell-settings__columns">
            <nav
                data-section="sections"
                class="sh-col sh-col--scroll shell-settings__tabs"
                role="tablist"
                :aria-label="$t('Shell.Pages.settings')">
                <button
                    v-for="entry in tabs"
                    :key="entry.name"
                    type="button"
                    role="tab"
                    class="sh-tab shell-settings__tab"
                    :data-tab="entry.name"
                    :aria-selected="entry.name === tab ? 'true' : 'false'"
                    @click="goTo('settings', entry.name)">
                    {{ entry.title }}
                </button>
            </nav>
            <div
                ref="content"
                data-section="content"
                class="sh-host sh-host--flush shell-settings__content settings-tabs">
                <component :is="'settings-' + tab + '-tab'" @scrollToTop="scrollToTop" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Ref, Watch } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'
import ShellHeader from '@/components/shell/ShellHeader.vue'
import { buildShellSettingsTabs } from '@/components/shell/settingsTabs'
import { PaletteSettingsTab } from '@/plugins/commandPaletteBus'
import SettingsGeneralTab from '@/components/settings/SettingsGeneralTab.vue'
import SettingsWebcamsTab from '@/components/settings/SettingsWebcamsTab.vue'
import SettingsMacrosTab from '@/components/settings/SettingsMacrosTab.vue'
import SettingsControlTab from '@/components/settings/SettingsControlTab.vue'
import SettingsConsoleTab from '@/components/settings/SettingsConsoleTab.vue'
import SettingsPresetsTab from '@/components/settings/SettingsPresetsTab.vue'
import SettingsRemotePrintersTab from '@/components/settings/SettingsRemotePrintersTab.vue'
import SettingsUiSettingsTab from '@/components/settings/SettingsUiSettingsTab.vue'
import SettingsDashboardTab from '@/components/settings/SettingsDashboardTab.vue'
import SettingsGCodeViewerTab from '@/components/settings/SettingsGCodeViewerTab.vue'
import SettingsEditorTab from '@/components/settings/SettingsEditorTab.vue'
import SettingsTimelapseTab from '@/components/settings/SettingsTimelapseTab.vue'
import SettingsNavigationTab from '@/components/settings/SettingsNavigationTab.vue'
import SettingsNotificationsTab from '@/components/settings/SettingsNotificationsTab.vue'
import SettingsCommandPaletteTab from '@/components/settings/SettingsCommandPaletteTab.vue'
import SettingsMiscellaneousTab from '@/components/settings/SettingsMiscellaneousTab.vue'
import SettingsHeightmapTab from '@/components/settings/SettingsHeightmapTab.vue'
import SettingsKioskTab from '@/components/settings/SettingsKioskTab.vue'

@Component({
    components: {
        ShellHeader,
        SettingsUiSettingsTab,
        SettingsRemotePrintersTab,
        SettingsPresetsTab,
        SettingsConsoleTab,
        SettingsControlTab,
        SettingsMacrosTab,
        SettingsWebcamsTab,
        SettingsGeneralTab,
        SettingsDashboardTab,
        SettingsGCodeViewerTab,
        SettingsEditorTab,
        SettingsTimelapseTab,
        SettingsMiscellaneousTab,
        SettingsNavigationTab,
        SettingsNotificationsTab,
        SettingsHeightmapTab,
        SettingsCommandPaletteTab,
        SettingsKioskTab,
    },
})
export default class ShellSettingsPage extends Mixins(ShellMixin) {
    @Prop({ type: String, default: 'general' }) declare readonly tab: string

    @Ref() readonly content!: HTMLElement

    get tabs(): PaletteSettingsTab[] {
        const available = this.availableShellTabs('settings').map((entry) => entry.id)

        return buildShellSettingsTabs((key) => this.$t(key).toString()).filter((entry) =>
            available.includes(entry.name)
        )
    }

    @Watch('tab')
    onTabChanged(): void {
        this.scrollToTop()
    }

    scrollToTop(): void {
        this.content?.scrollTo({ top: 0 })
    }
}
</script>

<style scoped>
.shell-settings__columns {
    grid-template-columns: 232px minmax(0, 1fr);
}

.shell-settings__tabs {
    padding: 16px 12px;
    gap: 2px;
}

.shell-settings__tab {
    width: 100%;
    min-height: 34px;
    flex: 0 0 34px;
    justify-content: flex-start;
}

@media (min-height: 820px) {
    .shell-settings__tab {
        min-height: 40px;
        flex-basis: 40px;
    }
}

.shell-settings__tab[aria-selected='true'] {
    background: var(--shell-active);
    color: var(--shell-active-text);
    font-weight: 500;
}

.shell-settings__content {
    padding: 8px 12px 24px;
    height: auto;
}

.shell-settings__content ::v-deep .v-card {
    background: transparent !important;
    max-width: 860px;
}
</style>
