<template>
    <nav class="shell-rail" :aria-label="$t('Shell.Rail.Main')">
        <div class="shell-rail__name">
            <span class="shell-rail__name-text">{{ printerName }}</span>
            <printer-selector v-if="countPrinters" />
        </div>
        <router-link
            v-for="page in pages"
            :key="page.id"
            :to="page.path"
            class="shell-rail__link"
            :class="{ 'shell-rail__link--active': page.id === shellLocation.page }"
            :data-page="page.id"
            :aria-current="page.id === shellLocation.page ? 'page' : null">
            {{ page.title }}
        </router-link>
        <div class="sh-spacer" />
        <div class="shell-rail__tools">
            <the-notification-menu />
            <v-tooltip v-if="showModeToggle" top>
                <template #activator="{ on, attrs }">
                    <v-btn
                        icon
                        class="mode-toggle-button"
                        :aria-label="modeToggleLabel"
                        v-bind="attrs"
                        v-on="on"
                        @click="toggleMode">
                        <v-icon>{{ $vuetify.theme.dark ? mdiWeatherSunny : mdiWeatherNight }}</v-icon>
                    </v-btn>
                </template>
                <span>{{ modeToggleLabel }}</span>
            </v-tooltip>
            <the-top-corner-menu />
            <span class="shell-rail__about"><about-dialog /></span>
        </div>
        <the-command-palette ref="palette" class="shell-rail__palette" />
        <button v-if="paletteSettings.enabled" type="button" class="shell-rail__search" @click="openPalette">
            <span>{{ $t('Shell.Rail.Search') }}</span>
            <span class="shell-rail__keys">{{ paletteShortcutKeys.join('') }}</span>
        </button>
        <button
            v-if="klippyIsConnected"
            type="button"
            class="shell-rail__stop emergency-button"
            :disabled="loadings.includes('topbarEmergencyStop')"
            @click="btnEmergencyStop">
            {{ $t('Shell.Rail.EmergencyStop') }}
        </button>
        <emergency-stop-dialog v-model="showEmergencyStopDialog" />
    </nav>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import { mdiWeatherNight, mdiWeatherSunny } from '@mdi/js'
import ShellMixin from '@/components/mixins/shell'
import CommandPaletteMixin from '@/components/mixins/commandPalette'
import TheCommandPalette from '@/components/TheCommandPalette.vue'
import TheNotificationMenu from '@/components/notifications/TheNotificationMenu.vue'
import TheTopCornerMenu from '@/components/TheTopCornerMenu.vue'
import AboutDialog from '@/components/dialogs/AboutDialog.vue'
import EmergencyStopDialog from '@/components/dialogs/EmergencyStopDialog.vue'
import PrinterSelector from '@/components/ui/PrinterSelector.vue'
import { shellPages } from '@/plugins/shellNavigation'
import { systemPrefersDarkQuery, toggledThemeMode } from '@/plugins/themeMode'

@Component({
    components: {
        AboutDialog,
        EmergencyStopDialog,
        PrinterSelector,
        TheCommandPalette,
        TheNotificationMenu,
        TheTopCornerMenu,
    },
})
export default class ShellRail extends Mixins(ShellMixin, CommandPaletteMixin) {
    mdiWeatherNight = mdiWeatherNight
    mdiWeatherSunny = mdiWeatherSunny

    showEmergencyStopDialog = false

    @Ref() readonly palette!: TheCommandPalette

    get pages(): { id: string; path: string; title: string }[] {
        return shellPages.map((page) => ({
            id: page.id,
            path: page.path,
            title: this.$t(`Shell.Pages.${page.id}`).toString(),
        }))
    }

    get printerName(): string {
        const name: string = this.$store.state.gui.general.printername ?? ''

        return name.length ? name : (this.$store.state.printer.hostname ?? '')
    }

    get showModeToggle(): boolean {
        return this.$store.state.gui.uiSettings.showModeToggle ?? true
    }

    get modeToggleLabel(): string {
        const key = this.$vuetify.theme.dark ? 'App.TopBar.SwitchToLightMode' : 'App.TopBar.SwitchToDarkMode'

        return this.$t(key).toString()
    }

    openPalette(): void {
        this.palette.open()
    }

    toggleMode(): void {
        const systemPrefersDark = window.matchMedia?.(systemPrefersDarkQuery).matches ?? true
        const mode = toggledThemeMode(this.$store.state.gui.uiSettings.mode, systemPrefersDark)

        this.$store.dispatch('gui/saveSetting', { name: 'uiSettings.mode', value: mode })
    }

    btnEmergencyStop(): void {
        if (this.$store.state.gui.uiSettings.confirmOnEmergencyStop) {
            this.showEmergencyStopDialog = true
            return
        }

        this.$socket.emit('printer.emergency_stop', {}, { loading: 'topbarEmergencyStop' })
    }
}
</script>

<style scoped>
.shell-rail {
    border-right: 1px solid var(--shell-line);
    padding: 20px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    min-width: 0;
}

.shell-rail__name {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.5;
    padding: 4px 12px 16px;
}

.shell-rail__name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.shell-rail__link {
    padding: 12px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 15px;
    line-height: 1.5;
    color: var(--shell-text-2);
}

.shell-rail__link:hover {
    background: var(--shell-hover);
    color: var(--shell-text);
}

.shell-rail__link--active,
.shell-rail__link--active:hover {
    background: var(--shell-active);
    color: var(--shell-active-text);
    font-weight: 500;
}

.shell-rail__tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 6px;
}

.shell-rail__tools ::v-deep .v-btn {
    width: 40px !important;
    height: 40px !important;
    border-radius: 8px;
    color: var(--shell-muted);
}

.shell-rail__tools ::v-deep .v-btn .v-icon {
    font-size: 20px;
    height: 20px;
    width: 20px;
}

.shell-rail__tools ::v-deep .v-btn .v-icon svg {
    height: 20px;
    width: 20px;
}

.shell-rail__about {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.shell-rail__about ::v-deep .v-icon {
    color: var(--shell-muted);
}

.shell-rail__about ::v-deep .v-icon svg {
    height: 20px;
    width: 20px;
}

.shell-rail__palette ::v-deep .command-palette-trigger,
.shell-rail__palette ::v-deep .command-palette-trigger-icon {
    display: none !important;
}

.shell-rail__search {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid var(--shell-border);
    background: var(--shell-surface);
    color: var(--shell-muted);
    font: 400 14px var(--shell-font);
    text-align: left;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.shell-rail__search:hover {
    color: var(--shell-text);
}

.shell-rail__keys {
    white-space: nowrap;
}

.shell-rail__stop {
    min-height: 48px;
    border-radius: 8px;
    border: 1px solid var(--shell-danger);
    background: transparent;
    color: var(--shell-danger);
    font: 600 14px var(--shell-font);
    cursor: pointer;
}

.shell-rail__stop:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
}

.shell-rail__stop:disabled {
    opacity: 0.5;
}
</style>
