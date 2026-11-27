<template>
    <div class="appearance-tab" :class="{ 'appearance-tab--shell': isShell }">
        <v-card flat>
            <v-card-text>
                <div class="d-flex align-center mb-1">
                    <span class="text-subtitle-1 font-weight-medium">
                        {{ $t('Settings.AppearanceTab.PresetsTitle') }}
                    </span>
                    <v-spacer />
                    <v-chip small outlined class="appearance-current-theme">{{ currentThemeName }}</v-chip>
                </div>
                <p class="text-body-2 text--secondary mb-3">{{ $t('Settings.AppearanceTab.PresetsDescription') }}</p>
                <div class="appearance-presets">
                    <theme-preset-card
                        v-for="preset in presetCards"
                        :key="preset.id"
                        :preset-id="preset.id"
                        :name="preset.name"
                        :description="preset.description"
                        :accent="preset.accent"
                        :font-family="preset.fontFamily"
                        :active="preset.id === activePreset"
                        @select="applyPreset">
                        <theme-shell-preview
                            v-if="isShell"
                            :preset="preset.preset"
                            :accent="preset.accent"
                            :default-accent="defaultAccent" />
                        <theme-classic-preview v-else :preset="preset.preset" :accent="preset.accent" />
                    </theme-preset-card>
                </div>

                <div class="text-subtitle-1 font-weight-medium mt-5">
                    {{ $t('Settings.AppearanceTab.CustomizeTitle') }}
                </div>
                <p class="text-body-2 text--secondary mb-1">{{ $t('Settings.AppearanceTab.CustomizeDescription') }}</p>

                <div class="appearance-tokens">
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Accent')"
                            :sub-title="$t('Settings.AppearanceTab.AccentDescription')"
                            :dynamic-slot-width="true">
                            <v-btn
                                v-if="!isDefault('accent')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="accent"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('accent')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <v-menu bottom left offset-y :close-on-content-click="false">
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        v-bind="attrs"
                                        :color="tokens.accent"
                                        class="minwidth-0 px-5 appearance-accent"
                                        :aria-label="$t('Settings.AppearanceTab.Accent')"
                                        small
                                        v-on="on" />
                                </template>
                                <v-color-picker
                                    :value="tokens.accent"
                                    hide-mode-switch
                                    mode="hexa"
                                    class="appearance-accent-picker"
                                    @update:color="updateAccent" />
                            </v-menu>
                        </settings-row>
                        <v-alert
                            v-if="accentNotes.length"
                            dense
                            text
                            :type="isShell ? 'info' : 'warning'"
                            class="mt-1 mb-2 text-body-2 appearance-contrast-warning">
                            <div v-for="note in accentNotes" :key="note">{{ note }}</div>
                        </v-alert>
                    </div>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Radius')"
                            :sub-title="$t('Settings.AppearanceTab.RadiusDescription')">
                            <v-btn
                                v-if="!isDefault('radius')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="radius"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('radius')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <v-slider
                                :value="tokens.radius"
                                hide-details
                                class="appearance-radius"
                                :min="minRadius"
                                :max="maxRadius"
                                :step="1"
                                :label="tokens.radius + 'px'"
                                @input="previewRadius"
                                @change="saveRadius" />
                        </settings-row>
                    </div>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Density')"
                            :sub-title="$t('Settings.AppearanceTab.DensityDescription')"
                            :mobile-second-row="true">
                            <v-btn
                                v-if="!isDefault('density')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="density"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('density')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <v-btn-toggle
                                :value="tokens.density"
                                mandatory
                                dense
                                class="appearance-density"
                                @change="setToken('density', $event)">
                                <v-btn v-for="option in densityOptions" :key="option.value" small :value="option.value">
                                    {{ option.text }}
                                </v-btn>
                            </v-btn-toggle>
                        </settings-row>
                    </div>
                    <div v-if="isShell" class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Tone')"
                            :sub-title="$t('Settings.AppearanceTab.ToneDescription')">
                            <v-btn
                                v-if="!isDefault('tone')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="tone"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('tone')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <v-select
                                :value="tokens.tone"
                                :items="toneOptions"
                                class="mt-0 appearance-tone"
                                hide-details
                                outlined
                                dense
                                @change="setToken('tone', $event)">
                                <template #item="{ item }">
                                    <div class="d-flex align-center justify-space-between" style="width: 100%">
                                        <span>{{ item.text }}</span>
                                        <span class="appearance-swatches appearance-swatches--tone ml-3">
                                            <span :style="{ background: item.color }" />
                                        </span>
                                    </div>
                                </template>
                            </v-select>
                        </settings-row>
                    </div>
                    <template v-else>
                        <div class="appearance-token">
                            <settings-row
                                :title="$t('Settings.AppearanceTab.Surface')"
                                :sub-title="$t('Settings.AppearanceTab.SurfaceDescription')">
                                <v-btn
                                    v-if="!isDefault('surface')"
                                    small
                                    text
                                    class="minwidth-0 appearance-reset"
                                    data-token="surface"
                                    :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                    @click="resetToken('surface')">
                                    <v-icon small>{{ mdiRestart }}</v-icon>
                                </v-btn>
                                <v-select
                                    :value="tokens.surface"
                                    :items="surfaceOptions"
                                    class="mt-0 appearance-surface"
                                    hide-details
                                    outlined
                                    dense
                                    @change="setToken('surface', $event)" />
                            </settings-row>
                        </div>
                        <div class="appearance-token">
                            <settings-row
                                :title="$t('Settings.AppearanceTab.Tint')"
                                :sub-title="$t('Settings.AppearanceTab.TintDescription')"
                                :mobile-second-row="true">
                                <v-btn
                                    v-if="!isDefault('tint')"
                                    small
                                    text
                                    class="minwidth-0 appearance-reset"
                                    data-token="tint"
                                    :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                    @click="resetToken('tint')">
                                    <v-icon small>{{ mdiRestart }}</v-icon>
                                </v-btn>
                                <v-btn-toggle
                                    :value="tokens.tint"
                                    mandatory
                                    dense
                                    class="appearance-tint"
                                    @change="setToken('tint', $event)">
                                    <v-btn
                                        v-for="option in tintOptions"
                                        :key="option.value"
                                        small
                                        :value="option.value">
                                        {{ option.text }}
                                    </v-btn>
                                </v-btn-toggle>
                            </settings-row>
                        </div>
                    </template>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Font')"
                            :sub-title="$t('Settings.AppearanceTab.FontDescription')">
                            <v-btn
                                v-if="!isDefault('font')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="font"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('font')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <v-select
                                :value="tokens.font"
                                :items="fontOptions"
                                class="mt-0 appearance-font"
                                hide-details
                                outlined
                                dense
                                @change="setToken('font', $event)">
                                <template #item="{ item }">
                                    <span :style="{ fontFamily: item.family }">{{ item.text }}</span>
                                </template>
                            </v-select>
                        </settings-row>
                    </div>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.ChartPalette')"
                            :sub-title="$t('Settings.AppearanceTab.ChartPaletteDescription')">
                            <v-btn
                                v-if="!isDefault('chartPalette')"
                                small
                                text
                                class="minwidth-0 appearance-reset"
                                data-token="chartPalette"
                                :aria-label="$t('Settings.AppearanceTab.ResetToken')"
                                @click="resetToken('chartPalette')">
                                <v-icon small>{{ mdiRestart }}</v-icon>
                            </v-btn>
                            <div class="appearance-chart">
                                <v-select
                                    :value="tokens.chartPalette"
                                    :items="chartPaletteOptions"
                                    class="mt-0 appearance-chart-palette"
                                    hide-details
                                    outlined
                                    dense
                                    @change="setToken('chartPalette', $event)">
                                    <template #item="{ item }">
                                        <div class="d-flex align-center justify-space-between" style="width: 100%">
                                            <span>{{ item.text }}</span>
                                            <span class="appearance-swatches ml-3">
                                                <span
                                                    v-for="color in item.colors"
                                                    :key="color"
                                                    :style="{ background: color }" />
                                            </span>
                                        </div>
                                    </template>
                                </v-select>
                                <div class="appearance-swatches appearance-swatches--current mt-1">
                                    <span
                                        v-for="color in currentChartColors"
                                        :key="color"
                                        :style="{ background: color }" />
                                </div>
                            </div>
                        </settings-row>
                    </div>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.Share')"
                            :sub-title="$t('Settings.AppearanceTab.ShareDescription')"
                            :mobile-second-row="true">
                            <input
                                ref="importInput"
                                type="file"
                                accept=".json,application/json"
                                class="d-none appearance-import-input"
                                @change="importSelectedFile" />
                            <v-btn small outlined class="mr-2 appearance-export" @click="exportTheme">
                                <v-icon small left>{{ mdiDownload }}</v-icon>
                                {{ $t('Settings.AppearanceTab.Export') }}
                            </v-btn>
                            <v-btn small outlined class="appearance-import" @click="openImportDialog">
                                <v-icon small left>{{ mdiUpload }}</v-icon>
                                {{ $t('Settings.AppearanceTab.Import') }}
                            </v-btn>
                        </settings-row>
                        <v-alert
                            v-if="importMessage"
                            dense
                            text
                            dismissible
                            :type="importFailed ? 'error' : 'success'"
                            class="mt-1 mb-2 text-body-2 appearance-import-message"
                            @input="importMessage = ''">
                            {{ importMessage }}
                        </v-alert>
                    </div>
                    <div class="appearance-token">
                        <settings-row
                            :title="$t('Settings.AppearanceTab.ResetTheme')"
                            :sub-title="resetDescription"
                            :dynamic-slot-width="true">
                            <v-btn
                                small
                                outlined
                                color="primary"
                                class="appearance-reset-all"
                                :disabled="activePreset === defaultPresetId"
                                @click="applyPreset(defaultPresetId)">
                                <v-icon small left>{{ mdiRestart }}</v-icon>
                                {{ $t('Settings.AppearanceTab.ResetThemeButton') }}
                            </v-btn>
                        </settings-row>
                    </div>
                </div>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Inject, Mixins, Ref } from 'vue-property-decorator'
import { Debounce } from 'vue-debounce-decorator'
import { mdiDownload, mdiRestart, mdiUpload } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from '@/components/mixins/theme'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import ThemePresetCard from '@/components/settings/Appearance/ThemePresetCard.vue'
import ThemeClassicPreview from '@/components/settings/Appearance/ThemeClassicPreview.vue'
import ThemeShellPreview from '@/components/settings/Appearance/ThemeShellPreview.vue'
import { clearColorObject, ColorPickerValue } from '@/plugins/helpers'
import { InterfaceShell } from '@/plugins/shellNavigation'
import { defaultPrimaryColor } from '@/store/variables'
import { exportThemeFile, MAX_THEME_FILE_SIZE, parseThemeFile, ThemeFileError } from '@/plugins/themeFile'
import {
    defaultShellStoredTokens,
    isDefaultShellAccent,
    isValidShellToken,
    matchingShellPreset,
    MAX_SHELL_RADIUS,
    MIN_SHELL_RADIUS,
    resolveShellTokens,
    shellAccentColors,
    shellPalette,
    ShellStoredTokens,
    ShellThemePreset,
    shellThemePresets,
    ShellTone,
    shellTones,
} from '@/plugins/shellTheme'
import {
    accentContrast,
    chartPaletteColors,
    defaultStoredThemeTokens,
    isValidThemeToken,
    matchingPreset,
    MAX_THEME_RADIUS,
    MIN_ACCENT_CONTRAST,
    MIN_THEME_RADIUS,
    onAccentContrast,
    resolveThemeTokens,
    ThemeChartPalette,
    themeChartPaletteNames,
    themeDensities,
    ThemeDensity,
    ThemeFont,
    themeFontNames,
    themeFonts,
    ThemePreset,
    themePresets,
    ThemeStoredTokens,
    ThemeSurface,
    themeSurfaces,
    ThemeTint,
    themeTints,
} from '@/plugins/themeTokens'

const EXPORT_FILENAME = 'mainsail-theme.json'
const SWATCH_COUNT = 6

type AnyStoredTokens = ThemeStoredTokens | ShellStoredTokens
type EditorTokens = { accent: string } & Partial<ThemeStoredTokens> & Partial<ShellStoredTokens>

interface PresetCard {
    id: string
    name: string
    description: string
    accent: string
    fontFamily: string
    preset: ThemePreset | ShellThemePreset
}

@Component({
    components: { SettingsRow, ThemePresetCard, ThemeClassicPreview, ThemeShellPreview },
})
export default class SettingsAppearanceTab extends Mixins(BaseMixin, ThemeMixin) {
    @Inject({ from: 'settingsInterface', default: 'classic' }) readonly settingsInterface!: InterfaceShell

    @Ref() readonly importInput!: HTMLInputElement

    mdiDownload = mdiDownload
    mdiRestart = mdiRestart
    mdiUpload = mdiUpload

    importMessage = ''
    importFailed = false

    get isShell(): boolean {
        return this.settingsInterface === 'new'
    }

    get defaultAccent(): string {
        return this.theme?.colorPrimary ?? defaultPrimaryColor
    }

    get dark(): boolean {
        return this.$vuetify.theme.dark
    }

    get tokensSetting(): string {
        return this.isShell ? 'uiSettings.shellTokens' : 'uiSettings.tokens'
    }

    get presetsKey(): string {
        return this.isShell ? 'ShellPresets' : 'Presets'
    }

    get tokens(): EditorTokens {
        const uiSettings = this.$store.state.gui.uiSettings
        if (this.isShell) return resolveShellTokens(uiSettings.primary, uiSettings.shellTokens, this.defaultAccent)

        return resolveThemeTokens(uiSettings.primary, uiSettings.tokens, this.defaultAccent)
    }

    get storedTokens(): AnyStoredTokens {
        const stored: Record<string, unknown> = { ...this.tokens }
        delete stored.accent

        return stored as unknown as AnyStoredTokens
    }

    get defaults(): EditorTokens {
        const stored = this.isShell ? defaultShellStoredTokens() : defaultStoredThemeTokens()

        return { accent: this.defaultAccent, ...stored }
    }

    get presets(): (ThemePreset | ShellThemePreset)[] {
        return this.isShell ? shellThemePresets : themePresets
    }

    get defaultPresetId(): string {
        return this.presets[0].id
    }

    get presetCards(): PresetCard[] {
        return this.presets.map((preset) => ({
            id: preset.id,
            name: this.presetName(preset.id),
            description: this.$t(`Settings.AppearanceTab.${this.presetsKey}.${preset.id}.Description`).toString(),
            accent: preset.accent ?? this.defaultAccent,
            fontFamily: themeFonts[preset.tokens.font],
            preset,
        }))
    }

    get activePreset(): string | null {
        const uiSettings = this.$store.state.gui.uiSettings
        if (this.isShell)
            return matchingShellPreset(
                resolveShellTokens(uiSettings.primary, uiSettings.shellTokens, this.defaultAccent),
                this.defaultAccent
            )

        return matchingPreset(
            resolveThemeTokens(uiSettings.primary, uiSettings.tokens, this.defaultAccent),
            this.defaultAccent
        )
    }

    get currentThemeName(): string {
        if (this.activePreset === null) return this.$t('Settings.AppearanceTab.CustomTheme').toString()

        return this.presetName(this.activePreset)
    }

    get resetDescription(): string {
        return this.$t('Settings.AppearanceTab.ResetThemeDescription', {
            name: this.presetName(this.defaultPresetId),
        }).toString()
    }

    get minRadius(): number {
        return this.isShell ? MIN_SHELL_RADIUS : MIN_THEME_RADIUS
    }

    get maxRadius(): number {
        return this.isShell ? MAX_SHELL_RADIUS : MAX_THEME_RADIUS
    }

    get densityOptions(): { text: string; value: ThemeDensity }[] {
        return themeDensities.map((value) => ({ text: this.optionText('Densities', value), value }))
    }

    get surfaceOptions(): { text: string; value: ThemeSurface }[] {
        return themeSurfaces.map((value) => ({ text: this.optionText('Surfaces', value), value }))
    }

    get tintOptions(): { text: string; value: ThemeTint }[] {
        return themeTints.map((value) => ({ text: this.optionText('Tints', value), value }))
    }

    get toneOptions(): { text: string; value: ShellTone; color: string }[] {
        return shellTones.map((value) => ({
            text: this.optionText('Tones', value),
            value,
            color: shellPalette(value, this.dark).bg,
        }))
    }

    get fontOptions(): { text: string; value: ThemeFont; family: string }[] {
        return themeFontNames.map((value) => ({
            text: this.optionText('Fonts', value),
            value,
            family: themeFonts[value],
        }))
    }

    get chartPaletteOptions(): { text: string; value: ThemeChartPalette; colors: string[] }[] {
        return themeChartPaletteNames.map((value) => ({
            text: this.optionText('ChartPalettes', value),
            value,
            colors: this.swatches(value),
        }))
    }

    get currentChartColors(): string[] {
        return this.swatches(this.tokens.chartPalette ?? 'classic')
    }

    get accentNotes(): string[] {
        return this.isShell ? this.shellAccentNotes : this.classicAccentWarnings
    }

    get shellAccentNotes(): string[] {
        const accent = this.tokens.accent
        if (isDefaultShellAccent(accent, this.defaultAccent)) return []

        const shown = shellAccentColors(accent, this.defaultAccent, this.tokens.tone ?? 'slate', this.dark).accent
        if (shown === accent.toLowerCase()) return []

        const key = this.dark ? 'AccentAdjustedDark' : 'AccentAdjustedLight'

        return [this.$t(`Settings.AppearanceTab.${key}`).toString()]
    }

    get classicAccentWarnings(): string[] {
        const warnings: string[] = []
        const theme = {
            accent: this.tokens.accent,
            surface: this.tokens.surface ?? 'standard',
            tint: this.tokens.tint ?? 'neutral',
        }
        const modes = [
            { dark: true, key: 'ContrastDark' },
            { dark: false, key: 'ContrastLight' },
        ]

        modes.forEach((mode) => {
            const contrast = accentContrast(theme, mode.dark)
            if (contrast.readable) return

            warnings.push(
                this.$t(`Settings.AppearanceTab.${mode.key}`, { ratio: contrast.ratio.toFixed(1) }).toString()
            )
        })

        const textContrast = onAccentContrast(this.tokens.accent)
        if (textContrast < MIN_ACCENT_CONTRAST)
            warnings.push(
                this.$t('Settings.AppearanceTab.ContrastOnAccent', { ratio: textContrast.toFixed(1) }).toString()
            )

        return warnings
    }

    presetName(id: string): string {
        return this.$t(`Settings.AppearanceTab.${this.presetsKey}.${id}.Name`).toString()
    }

    optionText(group: string, value: string): string {
        return this.$t(`Settings.AppearanceTab.${group}.${value}`).toString()
    }

    swatches(palette: ThemeChartPalette): string[] {
        const colors = chartPaletteColors(palette, this.dark)

        return [...new Set([colors.series[0], colors.bed, colors.chamber, ...colors.series.slice(1)])].slice(
            0,
            SWATCH_COUNT
        )
    }

    isDefault(name: keyof EditorTokens): boolean {
        return String(this.tokens[name]).toLowerCase() === String(this.defaults[name]).toLowerCase()
    }

    isValidToken(name: string, value: unknown): boolean {
        if (this.isShell) return isValidShellToken(name as keyof ShellStoredTokens, value)

        return isValidThemeToken(name as keyof ThemeStoredTokens, value)
    }

    settingName(name: string): string {
        return name === 'accent' ? 'uiSettings.primary' : `${this.tokensSetting}.${name}`
    }

    setToken(name: keyof EditorTokens, value: unknown): void {
        if (!this.isValidToken(name, value)) return

        this.$store.dispatch('gui/saveSetting', { name: this.settingName(name), value })
    }

    resetToken(name: keyof EditorTokens): void {
        this.setToken(name, this.defaults[name])
    }

    applyTheme(accent: string, tokens: AnyStoredTokens): void {
        this.$store.dispatch('gui/saveSetting', { name: this.tokensSetting, value: { ...tokens } })
        this.$store.dispatch('gui/saveSetting', { name: 'uiSettings.primary', value: accent })
    }

    applyPreset(id: string): void {
        const preset = this.presets.find((candidate) => candidate.id === id)
        if (!preset) return

        this.importMessage = ''
        this.applyTheme(preset.accent ?? this.defaultAccent, preset.tokens)
    }

    previewRadius(value: number): void {
        if (!this.isValidToken('radius', value)) return

        this.$store.commit('gui/saveSetting', { name: this.settingName('radius'), value })
    }

    saveRadius(value: number): void {
        this.setToken('radius', value)
    }

    updateAccent(value: ColorPickerValue): void {
        const accent = clearColorObject(value).toLowerCase()
        if (!this.isValidToken('accent', accent) || accent === this.tokens.accent.toLowerCase()) return

        this.$store.commit('gui/saveSetting', { name: this.settingName('accent'), value: accent })
        this.saveAccent(accent)
    }

    @Debounce(500)
    saveAccent(accent: string): void {
        if (this.tokens.accent.toLowerCase() !== accent) return

        this.setToken('accent', accent)
    }

    exportTheme(): void {
        const name = this.activePreset === null ? undefined : this.currentThemeName
        const text = exportThemeFile(this.settingsInterface, this.tokens.accent, this.storedTokens, name)
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = EXPORT_FILENAME
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
    }

    openImportDialog(): void {
        this.importInput.click()
    }

    async importSelectedFile(): Promise<void> {
        const file = this.importInput.files?.[0]
        this.importInput.value = ''
        if (!file) return

        if (file.size > MAX_THEME_FILE_SIZE) {
            this.showImportError({ code: 'tooLarge' })
            return
        }

        const result = parseThemeFile(await file.text(), this.settingsInterface)
        if (!result.ok) {
            this.showImportError(result.error)
            return
        }

        this.applyTheme(result.accent ?? this.defaultAccent, result.tokens)
        this.importFailed = false
        this.importMessage = this.$t('Settings.AppearanceTab.ImportSuccess', {
            name: result.name ?? file.name,
        }).toString()
    }

    showImportError(error: ThemeFileError): void {
        this.importFailed = true
        this.importMessage = this.$t(`Settings.AppearanceTab.ImportErrors.${error.code}`, {
            key: error.key ?? '',
            value: error.value ?? '',
            max: Math.round(MAX_THEME_FILE_SIZE / 1024),
        }).toString()
    }
}
</script>

<style scoped>
.appearance-presets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.appearance-tab--shell .appearance-presets {
    grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 600px) {
    .appearance-presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.appearance-token {
    padding: 4px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.24);
}

.appearance-token:last-child {
    border-bottom: 0;
}

@media (min-width: 1280px) {
    .appearance-tab--shell .appearance-tokens {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 32px;
    }

    .appearance-tab--shell .appearance-token:nth-last-child(2) {
        border-bottom: 0;
    }
}

.appearance-chart {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    width: 100%;
}

.appearance-swatches {
    display: inline-flex;
    gap: 4px;
}

.appearance-swatches > span {
    width: 14px;
    height: 14px;
    border-radius: 50%;
}

.appearance-swatches--tone > span {
    width: 28px;
    border-radius: 4px;
    border: 1px solid rgba(128, 128, 128, 0.5);
}

.appearance-radius {
    min-width: 160px;
}
</style>
