<template>
    <div class="settings-kiosk-tab">
        <v-card flat>
            <v-card-text>
                <div class="text-overline text--secondary">{{ $t('Settings.KioskTab.ThisScreen') }}</div>
                <settings-row
                    :title="$t('Settings.KioskTab.Enable')"
                    :sub-title="enableDescription"
                    :dynamic-slot-width="true">
                    <v-switch
                        :input-value="kioskActive"
                        readonly
                        hide-details
                        class="mt-0 kiosk-enable-switch"
                        @click.native.stop="toggleDevice" />
                </settings-row>
                <div class="text-caption text--secondary mt-2 kiosk-url-hint">
                    {{ $t('Settings.KioskTab.UrlHint') }}
                    <code>{{ kioskUrl }}</code>
                </div>
                <v-divider class="my-4" />
                <div class="text-overline text--secondary">{{ $t('Settings.KioskTab.AllScreens') }}</div>
                <div class="text-caption text--secondary mb-2">{{ $t('Settings.KioskTab.AllScreensDescription') }}</div>
                <settings-row
                    :title="$t('Settings.KioskTab.SmallScreens')"
                    :sub-title="smallScreensDescription"
                    :mobile-second-row="true">
                    <v-select
                        v-model="smallScreens"
                        :items="smallScreenItems"
                        hide-details
                        outlined
                        dense
                        attach
                        class="kiosk-small-screens" />
                </settings-row>
                <v-alert v-if="lockoutRisk" dense text type="warning" class="mt-3 mb-0 kiosk-lockout-warning">
                    {{ $t('Settings.KioskTab.LockoutWarning') }}
                </v-alert>
                <template v-if="newShell">
                    <v-divider class="my-4" />
                    <div class="kiosk-section-title">{{ $t('Settings.KioskTab.ShellPages') }}</div>
                    <div class="kiosk-section-subtitle">{{ $t('Settings.KioskTab.ShellPagesDescription') }}</div>
                    <div v-for="page in shellExposure" :key="page.id" class="kiosk-shell-page">
                        <v-checkbox
                            :input-value="page.exposed"
                            :label="page.title"
                            :data-shell="page.id"
                            hide-details
                            class="kiosk-shell-checkbox mt-2"
                            @change="setShellExposed(page.id, $event)" />
                        <div v-if="page.tabs.length > 1" class="d-flex flex-wrap kiosk-shell-tabs">
                            <v-checkbox
                                v-for="tab in page.tabs"
                                :key="tab.id"
                                :input-value="tab.exposed"
                                :label="tab.title"
                                :data-shell="tab.id"
                                :disabled="!page.exposed"
                                hide-details
                                dense
                                class="kiosk-exposure-checkbox mt-1"
                                @change="setShellExposed(tab.id, $event)" />
                        </div>
                    </div>
                </template>
                <template v-else>
                    <v-divider class="my-2" />
                    <settings-row
                        :title="$t('Settings.KioskTab.BottomBar')"
                        :sub-title="$t('Settings.KioskTab.BottomBarDescription', { max: bottomBarMax })"
                        :mobile-second-row="true">
                        <v-select
                            v-model="bottomBar"
                            :items="bottomBarItems"
                            item-text="title"
                            item-value="name"
                            multiple
                            small-chips
                            hide-details
                            outlined
                            dense
                            attach
                            class="kiosk-bottom-bar-select" />
                    </settings-row>
                    <v-divider class="my-2" />
                    <div class="kiosk-section-title mt-3">{{ $t('Settings.KioskTab.Pages') }}</div>
                    <div class="kiosk-section-subtitle">{{ $t('Settings.KioskTab.PagesDescription') }}</div>
                    <div class="d-flex flex-wrap kiosk-pages">
                        <v-checkbox
                            v-for="page in hideablePages"
                            :key="page.name"
                            :input-value="!kioskSettings.hiddenPages.includes(page.name)"
                            :label="page.title"
                            :data-page="page.name"
                            hide-details
                            class="kiosk-exposure-checkbox mt-2"
                            @change="setExposed('hiddenPages', page.name, $event)" />
                    </div>
                    <v-divider class="my-4" />
                    <div class="kiosk-section-title">{{ $t('Settings.KioskTab.Panels') }}</div>
                    <div class="kiosk-section-subtitle">{{ $t('Settings.KioskTab.PanelsDescription') }}</div>
                    <div class="d-flex flex-wrap kiosk-panels">
                        <v-checkbox
                            v-for="panel in hideablePanels"
                            :key="panel.name"
                            :input-value="!kioskSettings.hiddenPanels.includes(panel.name)"
                            :label="panel.title"
                            :data-panel="panel.name"
                            hide-details
                            class="kiosk-exposure-checkbox mt-2"
                            @change="setExposed('hiddenPanels', panel.name, $event)" />
                    </div>
                </template>
                <v-divider class="my-4" />
                <div class="kiosk-section-title">{{ $t('Settings.KioskTab.Actions') }}</div>
                <div class="kiosk-section-subtitle mb-2">{{ $t('Settings.KioskTab.ActionsDescription') }}</div>
                <settings-row
                    v-for="action in actionRows"
                    :key="action.name"
                    :title="action.title"
                    :sub-title="action.description"
                    :data-action="action.name"
                    class="kiosk-action-row"
                    :mobile-second-row="true">
                    <v-select
                        :value="action.rule"
                        :items="ruleItems"
                        hide-details
                        outlined
                        dense
                        attach
                        :class="'kiosk-action-select kiosk-action-' + action.name"
                        @change="setRule(action.name, $event)" />
                </settings-row>
                <v-alert v-if="pinRuleWithoutPin" dense text type="warning" class="mt-3 mb-0 kiosk-pin-missing">
                    {{ $t('Settings.KioskTab.PinMissing') }}
                </v-alert>
                <v-divider class="my-4" />
                <settings-row
                    :title="$t('Settings.KioskTab.Pin')"
                    :sub-title="kioskHasPin ? $t('Settings.KioskTab.PinIsSet') : $t('Settings.KioskTab.PinNotSet')"
                    :mobile-second-row="true">
                    <v-btn v-if="kioskHasPin" small text color="error" class="mr-2 kiosk-pin-remove" @click="removePin">
                        {{ $t('Settings.KioskTab.RemovePin') }}
                    </v-btn>
                    <v-btn small outlined class="kiosk-pin-set" @click="startSetPin">
                        {{ kioskHasPin ? $t('Settings.KioskTab.ChangePin') : $t('Settings.KioskTab.SetPin') }}
                    </v-btn>
                </settings-row>
                <v-alert dense text type="info" class="mt-3 mb-0 kiosk-pin-honesty">
                    {{ $t('Kiosk.Pin.Honesty') }}
                    {{ $t('Settings.KioskTab.PinRecovery') }}
                </v-alert>
            </v-card-text>
        </v-card>
        <v-dialog v-model="showSetPin" max-width="340" persistent content-class="kiosk-set-pin-dialog">
            <v-card v-if="showSetPin">
                <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
                    {{ firstPin === null ? $t('Settings.KioskTab.ChoosePin') : $t('Settings.KioskTab.RepeatPin') }}
                </v-card-title>
                <v-card-text class="pb-2">
                    <kiosk-pin-pad
                        :key="firstPin === null ? 'choose' : 'repeat'"
                        :error="setPinError"
                        :hint="$t('Settings.KioskTab.PinFormat', { min: pinMin, max: pinMax })"
                        @input="setPinError = ''"
                        @submit="onPinEntered" />
                </v-card-text>
                <v-card-actions class="pt-0">
                    <v-btn block text large @click="showSetPin = false">{{ $t('Buttons.Cancel') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import DashboardMixin from '@/components/mixins/dashboard'
import { KioskPage } from '@/components/mixins/kiosk'
import KioskNavigationMixin from '@/components/mixins/kioskNavigation'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import KioskPinPad from '@/components/kiosk/KioskPinPad.vue'
import {
    BOTTOM_BAR_MAX,
    createPinRecord,
    KIOSK_HOME_PAGE,
    KioskAction,
    KioskActionRule,
    kioskActionRules,
    kioskActions,
    KioskSmallScreens,
    kioskSmallScreenOptions,
    canRecoverOnSmallScreen,
    PIN_MAX_LENGTH,
    PIN_MIN_LENGTH,
} from '@/plugins/kiosk'
import { createPinSalt, requestKioskPin, setKioskDeviceMode } from '@/plugins/kioskSession'
import { resolveInterfaceShell, shellPages, shellTabKey } from '@/plugins/shellNavigation'

interface ShellExposure {
    id: string
    title: string
    exposed: boolean
    tabs: { id: string; title: string; exposed: boolean }[]
}

const FIXED_SHELL_PAGES = ['home', 'settings']

interface ActionRow {
    name: KioskAction
    title: string
    description: string
    rule: KioskActionRule
}

@Component({
    components: { KioskPinPad, SettingsRow },
})
export default class SettingsKioskTab extends Mixins(KioskNavigationMixin, DashboardMixin) {
    bottomBarMax = BOTTOM_BAR_MAX
    pinMin = PIN_MIN_LENGTH
    pinMax = PIN_MAX_LENGTH

    showSetPin = false
    firstPin: string | null = null
    setPinError = ''

    get kioskUrl(): string {
        return `${window.location.origin}/?kiosk=1`
    }

    get newShell(): boolean {
        return resolveInterfaceShell(this.$store.state.gui.uiSettings.interfaceShell) === 'new'
    }

    get enableDescription(): string {
        const key = this.newShell ? 'EnableDescriptionShell' : 'EnableDescription'

        return this.$t(`Settings.KioskTab.${key}`).toString()
    }

    get smallScreensDescription(): string {
        const key = this.newShell ? 'SmallScreensDescriptionShell' : 'SmallScreensDescription'

        return this.$t(`Settings.KioskTab.${key}`).toString()
    }

    get lockoutRisk(): boolean {
        return this.kioskHasPin && !canRecoverOnSmallScreen(this.kioskSettings)
    }

    get shellExposure(): ShellExposure[] {
        const hidden = this.kioskSettings.hiddenShell

        return shellPages
            .filter((page) => !FIXED_SHELL_PAGES.includes(page.id))
            .map((page) => ({
                id: page.id,
                title: this.$t(`Shell.Pages.${page.id}`).toString(),
                exposed: !hidden.includes(page.id),
                tabs: page.tabs.map((tab) => ({
                    id: shellTabKey(page.id, tab.id),
                    title: this.$t(`Shell.Tabs.${page.id}.${tab.id}`).toString(),
                    exposed: !hidden.includes(shellTabKey(page.id, tab.id)),
                })),
            }))
    }

    get smallScreens(): KioskSmallScreens {
        return this.kioskSettings.smallScreens
    }

    set smallScreens(value: KioskSmallScreens) {
        this.save('smallScreens', value)
    }

    get smallScreenItems(): { value: KioskSmallScreens; text: string }[] {
        return kioskSmallScreenOptions.map((value) => ({
            value,
            text: this.$t(`Settings.KioskTab.SmallScreenOptions.${value}`).toString(),
        }))
    }

    get bottomBarItems(): (KioskPage & { disabled: boolean })[] {
        const full = this.bottomBar.length >= BOTTOM_BAR_MAX

        return this.kioskAvailablePages
            .filter((page) => page.name === KIOSK_HOME_PAGE || !this.kioskSettings.hiddenPages.includes(page.name))
            .map((page) => ({
                ...page,
                disabled: page.name === KIOSK_HOME_PAGE || (full && !this.bottomBar.includes(page.name)),
            }))
    }

    get bottomBar(): string[] {
        return this.kioskBottomPageNames
    }

    set bottomBar(value: string[]) {
        this.save('bottomBar', value.slice(0, BOTTOM_BAR_MAX))
    }

    get hideablePages(): KioskPage[] {
        return this.kioskAvailablePages.filter((page) => page.name !== KIOSK_HOME_PAGE)
    }

    get hideablePanels(): { name: string; title: string }[] {
        const panels: string[] = this.$store.getters['gui/getAllPossiblePanels'] ?? []

        return panels.map((name) => ({ name, title: this.getPanelName(name).toString() }))
    }

    get ruleItems(): { value: KioskActionRule; text: string }[] {
        return kioskActionRules.map((value) => ({
            value,
            text: this.$t(`Settings.KioskTab.Rules.${value}`).toString(),
        }))
    }

    get actionRows(): ActionRow[] {
        return kioskActions.map((name) => ({
            name,
            title: this.$t(`Kiosk.Actions.${name}`).toString(),
            description: this.$t(`Settings.KioskTab.ActionDescriptions.${name}`).toString(),
            rule: this.kioskSettings.actions[name],
        }))
    }

    get pinRuleWithoutPin(): boolean {
        return !this.kioskHasPin && kioskActions.some((action) => this.kioskSettings.actions[action] === 'pin')
    }

    save(name: string, value: unknown): void {
        this.$store.dispatch('gui/saveSetting', { name: `kiosk.${name}`, value })
    }

    async toggleDevice(): Promise<void> {
        if (this.kioskActive) await this.leaveKiosk()
        else setKioskDeviceMode('on')
    }

    setExposed(list: 'hiddenPages' | 'hiddenPanels', name: string, exposed: boolean): void {
        const hidden = this.kioskSettings[list].filter((entry) => entry !== name)
        if (!exposed) hidden.push(name)

        this.save(list, hidden)
    }

    setShellExposed(id: string, exposed: boolean): void {
        const hidden = this.kioskSettings.hiddenShell.filter((entry) => entry !== id)
        if (!exposed) hidden.push(id)

        this.save('hiddenShell', hidden)
    }

    setRule(action: KioskAction, rule: KioskActionRule): void {
        this.save(`actions.${action}`, rule)
    }

    async startSetPin(): Promise<void> {
        if (this.kioskHasPin && !(await requestKioskPin('changePin'))) return

        this.firstPin = null
        this.setPinError = ''
        this.showSetPin = true
    }

    onPinEntered(pin: string): void {
        if (this.firstPin === null) {
            this.firstPin = pin
            return
        }

        if (pin !== this.firstPin) {
            this.firstPin = null
            this.setPinError = this.$t('Settings.KioskTab.PinMismatch').toString()
            return
        }

        this.save('pin', createPinRecord(pin, createPinSalt()))
        this.showSetPin = false
        this.$toast.success(this.$t('Settings.KioskTab.PinSaved').toString())
    }

    async removePin(): Promise<void> {
        if (!(await requestKioskPin('changePin'))) return

        this.$store.dispatch('gui/removeKioskPin')
    }
}
</script>

<style scoped>
.kiosk-section-title {
    font-weight: bold;
}

.kiosk-section-subtitle {
    font-size: 0.8em;
    line-height: 1.3;
    margin-top: 3px;
}

.kiosk-exposure-checkbox {
    width: 50%;
    min-width: 160px;
}

.kiosk-shell-tabs {
    padding-left: 32px;
}

.kiosk-url-hint code {
    word-break: break-all;
}
</style>
