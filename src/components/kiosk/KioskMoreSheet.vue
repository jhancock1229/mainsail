<template>
    <v-bottom-sheet :value="value" max-width="560" content-class="kiosk-more-sheet" @input="$emit('input', $event)">
        <v-sheet class="kiosk-more-sheet__content">
            <overlay-scrollbars class="kiosk-more-sheet__scroll">
                <v-list class="py-2">
                    <v-list-item
                        v-for="page in kioskMorePages"
                        :key="page.name"
                        :to="page.path"
                        class="kiosk-more-sheet__item"
                        :data-page="page.name"
                        @click="close">
                        <v-list-item-icon>
                            <v-icon>{{ page.icon }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ page.title }}</v-list-item-title>
                    </v-list-item>
                    <v-divider v-if="kioskMorePages.length" class="my-2" />
                    <v-list-item class="kiosk-more-sheet__item kiosk-more-sheet__theme" @click="toggleTheme">
                        <v-list-item-icon>
                            <v-icon>{{ $vuetify.theme.dark ? mdiWeatherSunny : mdiWeatherNight }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ themeLabel }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item
                        v-if="settingsRule !== 'block'"
                        class="kiosk-more-sheet__item kiosk-more-sheet__settings"
                        @click="openSettings">
                        <v-list-item-icon>
                            <v-icon>{{ mdiCogs }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>{{ $t('Settings.InterfaceSettings') }}</v-list-item-title>
                        <v-list-item-action v-if="settingsRule === 'pin'">
                            <v-icon small>{{ mdiLockOutline }}</v-icon>
                        </v-list-item-action>
                    </v-list-item>
                    <v-list-item class="kiosk-more-sheet__item kiosk-more-sheet__exit" @click="exit">
                        <v-list-item-icon>
                            <v-icon>{{ mdiExitToApp }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>{{ $t('Kiosk.Exit') }}</v-list-item-title>
                            <v-list-item-subtitle>{{ $t('Kiosk.ExitDescription') }}</v-list-item-subtitle>
                        </v-list-item-content>
                        <v-list-item-action v-if="kioskHasPin">
                            <v-icon small>{{ mdiLockOutline }}</v-icon>
                        </v-list-item-action>
                    </v-list-item>
                </v-list>
            </overlay-scrollbars>
        </v-sheet>
    </v-bottom-sheet>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import { mdiCogs, mdiExitToApp, mdiLockOutline, mdiWeatherNight, mdiWeatherSunny } from '@mdi/js'
import KioskNavigationMixin from '@/components/mixins/kioskNavigation'
import { effectiveActionRule, KioskActionRule } from '@/plugins/kiosk'
import { systemPrefersDarkQuery, toggledThemeMode } from '@/plugins/themeMode'
import { EventBus } from '@/plugins/eventBus'
import { OPEN_SETTINGS_TAB } from '@/plugins/commandPaletteBus'

@Component
export default class KioskMoreSheet extends Mixins(KioskNavigationMixin) {
    @Prop({ type: Boolean, required: true, default: false }) readonly value!: boolean

    mdiCogs = mdiCogs
    mdiExitToApp = mdiExitToApp
    mdiLockOutline = mdiLockOutline
    mdiWeatherNight = mdiWeatherNight
    mdiWeatherSunny = mdiWeatherSunny

    get settingsRule(): KioskActionRule {
        return effectiveActionRule('settings', this.kioskSettings)
    }

    get themeLabel(): string {
        return this.$vuetify.theme.dark
            ? this.$t('App.TopBar.SwitchToLightMode').toString()
            : this.$t('App.TopBar.SwitchToDarkMode').toString()
    }

    close(): void {
        this.$emit('input', false)
    }

    toggleTheme(): void {
        const systemPrefersDark = window.matchMedia?.(systemPrefersDarkQuery).matches ?? true
        const mode = toggledThemeMode(this.$store.state.gui.uiSettings.mode, systemPrefersDark)

        this.$store.dispatch('gui/saveSetting', { name: 'uiSettings.mode', value: mode })
    }

    async openSettings(): Promise<void> {
        this.close()
        if (await this.kioskAuthorize('settings')) EventBus.$emit(OPEN_SETTINGS_TAB, 'kiosk')
    }

    async exit(): Promise<void> {
        this.close()
        await this.leaveKiosk()
    }
}
</script>

<style scoped>
.kiosk-more-sheet__content {
    border-radius: 16px 16px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
}

.kiosk-more-sheet__scroll {
    max-height: calc(var(--app-height) - 96px);
}

.kiosk-more-sheet__item {
    min-height: 56px;
}
</style>
