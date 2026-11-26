<style scoped>
.dashboard-rows-container /deep/ .v-list-item-group {
    min-height: 80px;
}

/* reserve the line, so the lists below do not jump when switching between states */
.state-layout-status {
    min-height: 20px;
}
</style>

<template>
    <v-card flat>
        <v-card-text>
            <settings-row
                :title="$t('Settings.DashboardTab.StateLayouts')"
                :sub-title="$t('Settings.DashboardTab.StateLayoutsDescription')"
                :dynamic-slot-width="true">
                <v-switch v-model="stateLayoutsEnabled" hide-details class="mt-0" />
            </settings-row>
            <v-divider class="my-2" />
            <v-row v-if="stateLayoutsEnabled">
                <v-col class="text-center pb-0">
                    <div class="text-overline text--secondary">{{ $t('Settings.DashboardTab.PrinterState') }}</div>
                    <v-btn-toggle v-model="currentLayoutState" class="mx-auto" mandatory>
                        <v-btn v-for="layoutState in layoutStates" :key="layoutState.value" :value="layoutState.value">
                            <span class="hidden-sm-and-down">{{ layoutState.text }}</span>
                            <v-icon right class="hidden-sm-and-down">{{ layoutState.icon }}</v-icon>
                            <v-icon class="hidden-md-and-up">{{ layoutState.icon }}</v-icon>
                        </v-btn>
                    </v-btn-toggle>
                    <div class="state-layout-status text-caption text--secondary mt-2">
                        <template v-if="activeLayoutState !== 'idle'">
                            <v-icon small class="mr-1">{{ isCustomized ? mdiPencil : mdiLinkVariant }}</v-icon>
                            {{
                                isCustomized
                                    ? $t('Settings.DashboardTab.StateLayoutCustomized')
                                    : $t('Settings.DashboardTab.StateLayoutHint')
                            }}
                        </template>
                    </div>
                </v-col>
            </v-row>
            <v-row>
                <v-col class="text-center">
                    <div v-if="stateLayoutsEnabled" class="text-overline text--secondary">
                        {{ $t('Settings.DashboardTab.ScreenSize') }}
                    </div>
                    <v-btn-toggle v-model="currentViewport" class="mx-auto" mandatory>
                        <v-btn value="mobile">
                            <span class="hidden-sm-and-down">{{ $t('Settings.DashboardTab.Mobile') }}</span>
                            <v-icon right class="hidden-sm-and-down">{{ mdiCellphone }}</v-icon>
                            <v-icon class="hidden-md-and-up">{{ mdiCellphone }}</v-icon>
                        </v-btn>

                        <v-btn value="tablet">
                            <span class="hidden-sm-and-down">{{ $t('Settings.DashboardTab.Tablet') }}</span>
                            <v-icon right class="hidden-sm-and-down">{{ mdiTablet }}</v-icon>
                            <v-icon class="hidden-md-and-up">{{ mdiTablet }}</v-icon>
                        </v-btn>

                        <v-btn value="desktop">
                            <span class="hidden-sm-and-down">{{ $t('Settings.DashboardTab.Desktop') }}</span>
                            <v-icon right class="hidden-sm-and-down">{{ mdiMonitorDashboard }}</v-icon>
                            <v-icon class="hidden-md-and-up">{{ mdiMonitorDashboard }}</v-icon>
                        </v-btn>

                        <v-btn value="widescreen">
                            <span class="hidden-sm-and-down">{{ $t('Settings.DashboardTab.Widescreen') }}</span>
                            <v-icon right class="hidden-sm-and-down">{{ mdiMonitorScreenshot }}</v-icon>
                            <v-icon class="hidden-md-and-up">{{ mdiMonitorScreenshot }}</v-icon>
                        </v-btn>
                    </v-btn-toggle>
                </v-col>
            </v-row>
            <v-row>
                <v-col class="dashboard-rows-container">
                    <component :is="currentTab" :layout-state="activeLayoutState"></component>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import SettingsDashboardTabMobile from '@/components/settings/Dashboard/Mobile.vue'
import SettingsDashboardTabTablet from '@/components/settings/Dashboard/Tablet.vue'
import SettingsDashboardTabDesktop from '@/components/settings/Dashboard/Desktop.vue'
import SettingsDashboardTabWidescreen from '@/components/settings/Dashboard/Widescreen.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import {
    mdiAlertCircleOutline,
    mdiCellphone,
    mdiLinkVariant,
    mdiMonitorScreenshot,
    mdiMonitorDashboard,
    mdiPencil,
    mdiPrinter3dNozzle,
    mdiSleep,
    mdiTablet,
} from '@mdi/js'
import { DashboardLayoutState } from '@/plugins/dashboardLayoutState'
import { TranslateResult } from 'vue-i18n'

@Component({
    components: {
        SettingsDashboardTabMobile,
        SettingsDashboardTabTablet,
        SettingsDashboardTabDesktop,
        SettingsDashboardTabWidescreen,
        SettingsRow,
    },
})
export default class SettingsDashboardTab extends Mixins(BaseMixin) {
    mdiCellphone = mdiCellphone
    mdiLinkVariant = mdiLinkVariant
    mdiPencil = mdiPencil
    mdiTablet = mdiTablet
    mdiMonitorDashboard = mdiMonitorDashboard
    mdiMonitorScreenshot = mdiMonitorScreenshot

    private currentViewport = 'desktop'
    private currentLayoutState: DashboardLayoutState = 'idle'

    mounted() {
        if (this.isMobile) this.currentViewport = 'mobile'
        else if (this.isTablet) this.currentViewport = 'tablet'
        else if (this.isDesktop) this.currentViewport = 'desktop'
        else if (this.isWidescreen) this.currentViewport = 'widescreen'
        else this.currentViewport = 'desktop'
    }

    get stateLayoutsEnabled(): boolean {
        return this.$store.state.gui.dashboard.stateLayouts?.enabled ?? true
    }

    set stateLayoutsEnabled(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'dashboard.stateLayouts.enabled', value: newVal })
    }

    get activeLayoutState(): DashboardLayoutState {
        return this.stateLayoutsEnabled ? this.currentLayoutState : 'idle'
    }

    get isCustomized(): boolean {
        return this.$store.getters['gui/hasCustomStateLayout'](this.currentViewport, this.activeLayoutState)
    }

    get layoutStates(): { value: DashboardLayoutState; text: TranslateResult; icon: string }[] {
        return [
            { value: 'idle', text: this.$t('Settings.DashboardTab.Idle'), icon: mdiSleep },
            { value: 'printing', text: this.$t('Settings.DashboardTab.Printing'), icon: mdiPrinter3dNozzle },
            { value: 'error', text: this.$t('Settings.DashboardTab.Error'), icon: mdiAlertCircleOutline },
        ]
    }

    get currentTab() {
        return 'settings-dashboard-tab-' + this.currentViewport
    }
}
</script>
