<template>
    <div class="appearance-tab">
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
                        v-for="preset in presets"
                        :key="preset.id"
                        :preset="preset"
                        :active="preset.id === activePreset"
                        :default-accent="defaultAccent"
                        @select="applyPreset" />
                </div>

                <div class="text-subtitle-1 font-weight-medium mt-6">
                    {{ $t('Settings.AppearanceTab.CustomizeTitle') }}
                </div>
                <p class="text-body-2 text--secondary mb-1">{{ $t('Settings.AppearanceTab.CustomizeDescription') }}</p>

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
                    v-if="contrastWarnings.length"
                    dense
                    text
                    type="warning"
                    class="mt-1 mb-2 text-body-2 appearance-contrast-warning">
                    <div v-for="warning in contrastWarnings" :key="warning">{{ warning }}</div>
                </v-alert>
                <v-divider class="my-2" />
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
                <v-divider class="my-2" />
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
                    <v-btn-toggle v-model="density" mandatory dense class="appearance-density">
                        <v-btn v-for="option in densityOptions" :key="option.value" small :value="option.value">
                            {{ option.text }}
                        </v-btn>
                    </v-btn-toggle>
                </settings-row>
                <v-divider class="my-2" />
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
                        v-model="surface"
                        :items="surfaceOptions"
                        class="mt-0 appearance-surface"
                        hide-details
                        outlined
                        dense />
                </settings-row>
                <v-divider class="my-2" />
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
                    <v-btn-toggle v-model="tint" mandatory dense class="appearance-tint">
                        <v-btn v-for="option in tintOptions" :key="option.value" small :value="option.value">
                            {{ option.text }}
                        </v-btn>
                    </v-btn-toggle>
                </settings-row>
                <v-divider class="my-2" />
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
                        v-model="font"
                        :items="fontOptions"
                        class="mt-0 appearance-font"
                        hide-details
                        outlined
                        dense>
                        <template #item="{ item }">
                            <span :style="{ fontFamily: item.family }">{{ item.text }}</span>
                        </template>
                    </v-select>
                </settings-row>
                <v-divider class="my-2" />
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
                    <v-select
                        v-model="chartPalette"
                        :items="chartPaletteOptions"
                        class="mt-0 appearance-chart-palette"
                        hide-details
                        outlined
                        dense>
                        <template #item="{ item }">
                            <div class="d-flex align-center justify-space-between" style="width: 100%">
                                <span>{{ item.text }}</span>
                                <span class="appearance-swatches ml-3">
                                    <span v-for="color in item.colors" :key="color" :style="{ background: color }" />
                                </span>
                            </div>
                        </template>
                    </v-select>
                </settings-row>
                <div class="appearance-swatches appearance-swatches--current d-flex justify-end mt-1">
                    <span v-for="color in currentChartColors" :key="color" :style="{ background: color }" />
                </div>
                <v-divider class="my-2" />
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
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.AppearanceTab.ResetTheme')"
                    :sub-title="$t('Settings.AppearanceTab.ResetThemeDescription')"
                    :dynamic-slot-width="true">
                    <v-btn
                        small
                        outlined
                        color="primary"
                        class="appearance-reset-all"
                        :disabled="activePreset === classicPresetId"
                        @click="applyPreset(classicPresetId)">
                        <v-icon small left>{{ mdiRestart }}</v-icon>
                        {{ $t('Settings.AppearanceTab.ResetThemeButton') }}
                    </v-btn>
                </settings-row>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import { Debounce } from 'vue-debounce-decorator'
import { mdiDownload, mdiRestart, mdiUpload } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from '@/components/mixins/theme'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import ThemePresetCard from '@/components/settings/Appearance/ThemePresetCard.vue'
import { clearColorObject, ColorPickerValue } from '@/plugins/helpers'
import { defaultPrimaryColor } from '@/store/variables'
import {
    accentContrast,
    chartPaletteColors,
    defaultThemeTokens,
    exportThemeFile,
    isValidThemeToken,
    matchingPreset,
    MAX_THEME_FILE_SIZE,
    MAX_THEME_RADIUS,
    MIN_ACCENT_CONTRAST,
    MIN_THEME_RADIUS,
    onAccentContrast,
    parseThemeFile,
    resolveThemeTokens,
    ThemeChartPalette,
    themeChartPaletteNames,
    themeDensities,
    ThemeDensity,
    ThemeFileError,
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
    ThemeTokenName,
    ThemeTokens,
} from '@/plugins/themeTokens'

const CLASSIC_PRESET_ID = 'classic'
const EXPORT_FILENAME = 'mainsail-theme.json'
const SWATCH_COUNT = 6

@Component({
    components: { SettingsRow, ThemePresetCard },
})
export default class SettingsAppearanceTab extends Mixins(BaseMixin, ThemeMixin) {
    @Ref() readonly importInput!: HTMLInputElement

    mdiDownload = mdiDownload
    mdiRestart = mdiRestart
    mdiUpload = mdiUpload

    presets: ThemePreset[] = themePresets
    classicPresetId = CLASSIC_PRESET_ID
    minRadius = MIN_THEME_RADIUS
    maxRadius = MAX_THEME_RADIUS

    importMessage = ''
    importFailed = false

    get defaultAccent(): string {
        return this.theme?.colorPrimary ?? defaultPrimaryColor
    }

    get tokens(): ThemeTokens {
        const uiSettings = this.$store.state.gui.uiSettings

        return resolveThemeTokens(uiSettings.primary, uiSettings.tokens, this.defaultAccent)
    }

    get defaults(): ThemeTokens {
        return defaultThemeTokens(this.defaultAccent)
    }

    get activePreset(): string | null {
        return matchingPreset(this.tokens, this.defaultAccent)
    }

    get currentThemeName(): string {
        if (this.activePreset === null) return this.$t('Settings.AppearanceTab.CustomTheme').toString()

        return this.$t(`Settings.AppearanceTab.Presets.${this.activePreset}.Name`).toString()
    }

    get density(): ThemeDensity {
        return this.tokens.density
    }

    set density(newVal: ThemeDensity) {
        this.setToken('density', newVal)
    }

    get surface(): ThemeSurface {
        return this.tokens.surface
    }

    set surface(newVal: ThemeSurface) {
        this.setToken('surface', newVal)
    }

    get tint(): ThemeTint {
        return this.tokens.tint
    }

    set tint(newVal: ThemeTint) {
        this.setToken('tint', newVal)
    }

    get tintOptions(): { text: string; value: ThemeTint }[] {
        return themeTints.map((value) => ({
            text: this.$t(`Settings.AppearanceTab.Tints.${value}`).toString(),
            value,
        }))
    }

    get font(): ThemeFont {
        return this.tokens.font
    }

    set font(newVal: ThemeFont) {
        this.setToken('font', newVal)
    }

    get chartPalette(): ThemeChartPalette {
        return this.tokens.chartPalette
    }

    set chartPalette(newVal: ThemeChartPalette) {
        this.setToken('chartPalette', newVal)
    }

    get densityOptions(): { text: string; value: ThemeDensity }[] {
        return themeDensities.map((value) => ({
            text: this.$t(`Settings.AppearanceTab.Densities.${value}`).toString(),
            value,
        }))
    }

    get surfaceOptions(): { text: string; value: ThemeSurface }[] {
        return themeSurfaces.map((value) => ({
            text: this.$t(`Settings.AppearanceTab.Surfaces.${value}`).toString(),
            value,
        }))
    }

    get fontOptions(): { text: string; value: ThemeFont; family: string }[] {
        return themeFontNames.map((value) => ({
            text: this.$t(`Settings.AppearanceTab.Fonts.${value}`).toString(),
            value,
            family: themeFonts[value],
        }))
    }

    get chartPaletteOptions(): { text: string; value: ThemeChartPalette; colors: string[] }[] {
        return themeChartPaletteNames.map((value) => ({
            text: this.$t(`Settings.AppearanceTab.ChartPalettes.${value}`).toString(),
            value,
            colors: this.swatches(value),
        }))
    }

    get currentChartColors(): string[] {
        return this.swatches(this.tokens.chartPalette)
    }

    get contrastWarnings(): string[] {
        const warnings: string[] = []
        const modes = [
            { dark: true, key: 'ContrastDark' },
            { dark: false, key: 'ContrastLight' },
        ]

        modes.forEach((mode) => {
            const contrast = accentContrast(this.tokens, mode.dark)
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

    swatches(palette: ThemeChartPalette): string[] {
        const colors = chartPaletteColors(palette, this.$vuetify.theme.dark)

        return [...new Set([colors.series[0], colors.bed, colors.chamber, ...colors.series.slice(1)])].slice(
            0,
            SWATCH_COUNT
        )
    }

    isDefault(name: ThemeTokenName): boolean {
        return String(this.tokens[name]).toLowerCase() === String(this.defaults[name]).toLowerCase()
    }

    settingName(name: ThemeTokenName): string {
        return name === 'accent' ? 'uiSettings.primary' : `uiSettings.tokens.${name}`
    }

    setToken<K extends ThemeTokenName>(name: K, value: ThemeTokens[K]): void {
        if (!isValidThemeToken(name, value)) return

        this.$store.dispatch('gui/saveSetting', { name: this.settingName(name), value })
    }

    resetToken(name: ThemeTokenName): void {
        this.setToken(name, this.defaults[name])
    }

    applyTheme(accent: string, tokens: ThemeStoredTokens): void {
        this.$store.dispatch('gui/saveSetting', { name: 'uiSettings.tokens', value: { ...tokens } })
        this.$store.dispatch('gui/saveSetting', { name: 'uiSettings.primary', value: accent })
    }

    applyPreset(id: string): void {
        const preset = themePresets.find((candidate) => candidate.id === id)
        if (!preset) return

        this.importMessage = ''
        this.applyTheme(preset.accent ?? this.defaultAccent, preset.tokens)
    }

    previewRadius(value: number): void {
        if (!isValidThemeToken('radius', value)) return

        this.$store.commit('gui/saveSetting', { name: this.settingName('radius'), value })
    }

    saveRadius(value: number): void {
        this.setToken('radius', value)
    }

    updateAccent(value: ColorPickerValue): void {
        const accent = clearColorObject(value).toLowerCase()
        if (!isValidThemeToken('accent', accent) || accent === this.tokens.accent.toLowerCase()) return

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
        const blob = new Blob([exportThemeFile(this.tokens, name)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
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

        const result = parseThemeFile(await file.text())
        if (!result.ok) {
            this.showImportError(result.error)
            return
        }

        const { accent, ...tokens } = result.tokens
        this.applyTheme(accent ?? this.defaultAccent, tokens)
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

@media (max-width: 600px) {
    .appearance-presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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

.appearance-radius {
    min-width: 160px;
}
</style>
