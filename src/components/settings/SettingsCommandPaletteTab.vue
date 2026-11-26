<template>
    <div>
        <v-card flat>
            <v-card-text>
                <settings-row
                    :title="$t('Settings.CommandPaletteTab.Enable')"
                    :sub-title="$t('Settings.CommandPaletteTab.EnableDescription')"
                    :dynamic-slot-width="true">
                    <v-switch v-model="enabled" hide-details class="mt-0 command-palette-enable" />
                </settings-row>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.CommandPaletteTab.Shortcut')"
                    :sub-title="shortcutDescription"
                    :dynamic-slot-width="true">
                    <v-btn
                        v-if="!isDefaultShortcut && !recording"
                        small
                        text
                        class="mr-2 command-palette-shortcut-reset"
                        :disabled="!enabled"
                        @click="resetShortcut">
                        {{ $t('Settings.CommandPaletteTab.ResetShortcut') }}
                    </v-btn>
                    <v-btn
                        ref="shortcutButton"
                        small
                        outlined
                        class="command-palette-shortcut text-none"
                        :color="recording ? 'primary' : undefined"
                        :disabled="!enabled"
                        @click="toggleRecording">
                        <template v-if="recording">{{ $t('Settings.CommandPaletteTab.ShortcutPressKeys') }}</template>
                        <template v-else>
                            <kbd v-for="key in paletteShortcutKeys" :key="key" class="command-palette-key">
                                {{ key }}
                            </kbd>
                        </template>
                    </v-btn>
                </settings-row>
                <v-alert
                    v-if="shortcutError"
                    dense
                    text
                    type="warning"
                    class="mt-2 mb-0 command-palette-shortcut-error">
                    {{ $t('Settings.CommandPaletteTab.ShortcutErrors.' + shortcutError) }}
                </v-alert>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.CommandPaletteTab.Favourites')"
                    :sub-title="$t('Settings.CommandPaletteTab.FavouritesDescription')"
                    :mobile-second-row="true">
                    <v-autocomplete
                        v-model="commandToAdd"
                        :items="addableCommands"
                        :label="$t('Settings.CommandPaletteTab.AddFavourite')"
                        :disabled="!enabled"
                        item-text="title"
                        item-value="id"
                        hide-details
                        outlined
                        dense
                        class="command-palette-add-favourite"
                        @change="addFavourite">
                        <template #item="{ item }">
                            <v-list-item-icon class="mr-3">
                                <v-icon small>{{ item.icon }}</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title>{{ item.title }}</v-list-item-title>
                                <v-list-item-subtitle>{{ item.kind }}</v-list-item-subtitle>
                            </v-list-item-content>
                        </template>
                    </v-autocomplete>
                </settings-row>
                <draggable
                    v-if="favourites.length"
                    v-model="favourites"
                    handle=".handle"
                    ghost-class="ghost"
                    :force-fallback="true"
                    class="command-palette-favourites mt-2">
                    <div
                        v-for="favourite in favourites"
                        :key="favourite.id"
                        class="command-palette-favourite d-flex align-center my-2 px-2 py-1"
                        :style="draggableBgStyle">
                        <v-icon class="handle mr-2">{{ mdiDragVertical }}</v-icon>
                        <v-icon small class="mr-3">{{ favourite.icon }}</v-icon>
                        <div class="command-palette-favourite__text">
                            <div class="text-truncate">{{ favourite.title }}</div>
                            <div class="text-caption text-truncate command-palette-favourite__kind">
                                {{ favourite.kind }}
                            </div>
                        </div>
                        <v-btn
                            icon
                            small
                            :title="$t('Settings.CommandPaletteTab.RemoveFavourite')"
                            :aria-label="$t('Settings.CommandPaletteTab.RemoveFavourite')"
                            @click="togglePalettePin(favourite.id)">
                            <v-icon small>{{ mdiClose }}</v-icon>
                        </v-btn>
                    </div>
                </draggable>
                <p v-else class="text-caption mt-3 mb-0 command-palette-no-favourites">
                    {{ $t('Settings.CommandPaletteTab.NoFavourites') }}
                </p>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.CommandPaletteTab.Recent')"
                    :sub-title="$t('Settings.CommandPaletteTab.RecentDescription', { count: recentCount })"
                    :dynamic-slot-width="true">
                    <v-btn
                        small
                        outlined
                        class="command-palette-clear-recent"
                        :disabled="recentCount === 0"
                        @click="clearRecent">
                        {{ $t('Settings.CommandPaletteTab.ClearRecent') }}
                    </v-btn>
                </settings-row>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from '@/components/mixins/theme'
import CommandPaletteMixin from '@/components/mixins/commandPalette'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import draggable from 'vuedraggable'
import { DEFAULT_PALETTE_SHORTCUT, ShortcutError, shortcutFromEvent, validateShortcut } from '@/plugins/commandPalette'
import { commandPaletteBus } from '@/plugins/commandPaletteBus'
import { mdiClose, mdiDragVertical, mdiHelpCircleOutline } from '@mdi/js'

interface FavouriteEntry {
    id: string
    title: string
    icon: string
    kind: string
}

@Component({
    components: { SettingsRow, draggable },
})
export default class SettingsCommandPaletteTab extends Mixins(BaseMixin, ThemeMixin, CommandPaletteMixin) {
    mdiClose = mdiClose
    mdiDragVertical = mdiDragVertical

    @Ref() readonly shortcutButton!: Vue | undefined

    recording = false
    shortcutError: ShortcutError | null = null
    commandToAdd: string | null = null

    get enabled(): boolean {
        return this.paletteSettings.enabled
    }

    set enabled(newVal: boolean) {
        this.stopRecording()
        this.savePaletteSetting('enabled', newVal)
    }

    get isDefaultShortcut(): boolean {
        return this.paletteSettings.shortcut === DEFAULT_PALETTE_SHORTCUT
    }

    get shortcutDescription(): string {
        const key = this.recording ? 'ShortcutRecording' : 'ShortcutDescription'

        return this.$t(`Settings.CommandPaletteTab.${key}`).toString()
    }

    get commandEntries(): FavouriteEntry[] {
        return this.paletteCommands.map((command) => ({
            id: command.id,
            title: command.title,
            icon: command.icon,
            kind: this.$t(`CommandPalette.Sections.${command.group}`).toString(),
        }))
    }

    get addableCommands(): FavouriteEntry[] {
        return this.commandEntries.filter((entry) => !this.paletteSettings.pinned.includes(entry.id))
    }

    get favourites(): FavouriteEntry[] {
        return this.paletteSettings.pinned.map((id) => {
            const entry = this.commandEntries.find((command) => command.id === id)
            if (entry) return entry

            // e.g. a macro or file that was removed from the printer, it can come back
            return {
                id,
                title: id.slice(id.indexOf(':') + 1),
                icon: mdiHelpCircleOutline,
                kind: this.$t('Settings.CommandPaletteTab.Unavailable').toString(),
            }
        })
    }

    set favourites(newVal: FavouriteEntry[]) {
        this.savePaletteSetting(
            'pinned',
            newVal.map((entry) => entry.id)
        )
    }

    get recentCount(): number {
        return this.paletteSettings.recent.length
    }

    beforeDestroy(): void {
        this.stopRecording()
    }

    addFavourite(id: string | null): void {
        if (id && !this.paletteSettings.pinned.includes(id)) this.togglePalettePin(id)

        // empty the field for the next command
        this.$nextTick(() => (this.commandToAdd = null))
    }

    clearRecent(): void {
        this.savePaletteSetting('recent', [])
    }

    resetShortcut(): void {
        this.shortcutError = null
        this.savePaletteSetting('shortcut', DEFAULT_PALETTE_SHORTCUT)
    }

    toggleRecording(): void {
        if (this.recording) return this.stopRecording()

        this.recording = true
        this.shortcutError = null
        commandPaletteBus.recordingShortcut = true
        // capture phase, so the keys do not reach the settings dialog or the page
        window.addEventListener('keydown', this.onRecordKeydown, true)
        window.addEventListener('mousedown', this.onRecordMousedown, true)
    }

    stopRecording(): void {
        if (!this.recording) return

        this.recording = false
        commandPaletteBus.recordingShortcut = false
        window.removeEventListener('keydown', this.onRecordKeydown, true)
        window.removeEventListener('mousedown', this.onRecordMousedown, true)
    }

    onRecordKeydown(event: KeyboardEvent): void {
        event.preventDefault()
        event.stopImmediatePropagation()

        if (event.key === 'Escape') return this.stopRecording()

        const shortcut = shortcutFromEvent(event, this.isMac)
        // a modifier alone, the combination is not complete yet
        if (shortcut === null) return

        this.shortcutError = validateShortcut(shortcut)
        if (this.shortcutError !== null) return

        this.savePaletteSetting('shortcut', shortcut)
        this.stopRecording()
    }

    // a click anywhere else ends the recording
    onRecordMousedown(event: MouseEvent): void {
        if (this.shortcutButton?.$el.contains(event.target as Node)) return

        this.stopRecording()
    }
}
</script>

<style scoped>
.command-palette-shortcut {
    min-width: 96px !important;
}

.command-palette-favourite {
    border-radius: 6px;
}

.command-palette-favourite .handle {
    cursor: grab;
}

.command-palette-favourite__text {
    flex: 1 1 auto;
    min-width: 0;
}

.command-palette-favourite__kind {
    opacity: 0.6;
}

.command-palette-no-favourites {
    opacity: 0.7;
}

.ghost {
    opacity: 0.5;
}
</style>
