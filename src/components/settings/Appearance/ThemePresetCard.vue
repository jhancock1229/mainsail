<template>
    <button
        type="button"
        class="theme-preset-card"
        :class="{ 'theme-preset-card--active': active }"
        :data-preset="preset.id"
        :aria-pressed="active ? 'true' : 'false'"
        :style="cardStyle"
        @click="$emit('select', preset.id)">
        <span class="theme-preset-card__preview" :style="previewStyle">
            <span class="theme-preset-card__panel" :style="panelStyle">
                <span class="theme-preset-card__toolbar" :style="toolbarStyle">
                    <span class="theme-preset-card__dot" :style="{ background: accent }" />
                    <span class="theme-preset-card__line" :style="{ background: mutedColor }" />
                </span>
                <span class="theme-preset-card__body" :style="bodyStyle">
                    <svg class="theme-preset-card__chart" viewBox="0 0 100 30" preserveAspectRatio="none">
                        <path
                            v-for="line in chartLines"
                            :key="line.color"
                            :d="line.path"
                            :stroke="line.color"
                            fill="none"
                            stroke-width="2"
                            stroke-linecap="round"
                            vector-effect="non-scaling-stroke" />
                    </svg>
                    <span class="theme-preset-card__button" :style="buttonStyle">Aa</span>
                </span>
            </span>
        </span>
        <span class="theme-preset-card__label">
            <span class="theme-preset-card__name" :style="{ fontFamily }">{{ name }}</span>
            <v-icon v-if="active" small color="primary" class="theme-preset-card__check">{{ mdiCheckCircle }}</v-icon>
        </span>
        <span class="theme-preset-card__description">{{ description }}</span>
    </button>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiCheckCircle } from '@mdi/js'
import {
    chartPaletteColors,
    surfaceColors,
    textColorOnAccent,
    themeCssVariables,
    themeFonts,
    ThemePreset,
    ThemeSurfaceColors,
} from '@/plugins/themeTokens'

const PREVIEW_RADIUS_SCALE = 0.6
const CHART_LINES = ['M0 22 C 20 20, 30 8, 50 10 S 80 18, 100 6', 'M0 12 C 25 14, 35 24, 55 20 S 85 10, 100 16']

@Component
export default class ThemePresetCard extends Mixins(BaseMixin) {
    mdiCheckCircle = mdiCheckCircle

    @Prop({ type: Object, required: true }) declare readonly preset: ThemePreset
    @Prop({ type: Boolean, default: false }) declare readonly active: boolean
    @Prop({ type: String, required: true }) declare readonly defaultAccent: string

    get dark(): boolean {
        return this.$vuetify.theme.dark
    }

    get accent(): string {
        return this.preset.accent ?? this.defaultAccent
    }

    get name(): string {
        return this.$t(`Settings.AppearanceTab.Presets.${this.preset.id}.Name`).toString()
    }

    get description(): string {
        return this.$t(`Settings.AppearanceTab.Presets.${this.preset.id}.Description`).toString()
    }

    get fontFamily(): string {
        return themeFonts[this.preset.tokens.font]
    }

    get colors(): ThemeSurfaceColors {
        return surfaceColors({ ...this.preset.tokens, accent: this.accent }, this.dark)
    }

    get mutedColor(): string {
        return this.dark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.25)'
    }

    get lineColor(): string {
        return this.dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.24)'
    }

    get previewRadius(): string {
        return Math.round(this.preset.tokens.radius * PREVIEW_RADIUS_SCALE) + 'px'
    }

    get cardStyle(): Record<string, string> {
        return { '--theme-preset-accent': this.accent }
    }

    get previewStyle(): Record<string, string> {
        return { background: this.colors.page }
    }

    get panelStyle(): Record<string, string> {
        const surface = this.preset.tokens.surface
        const style: Record<string, string> = {
            background: this.colors.panel,
            borderRadius: this.previewRadius,
            border: '1px solid transparent',
        }

        if (surface === 'outlined') style.border = `1px solid ${this.lineColor}`
        if (surface === 'standard') style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.4)'
        if (surface === 'elevated') style.boxShadow = '0 6px 14px -3px rgba(0, 0, 0, 0.55)'

        return style
    }

    get toolbarStyle(): Record<string, string> {
        const compact = this.preset.tokens.density === 'compact'
        const style: Record<string, string> = { height: compact ? '11px' : '15px' }

        if (this.preset.tokens.surface === 'outlined') style.borderBottom = `1px solid ${this.lineColor}`
        else style.background = this.dark ? this.colors.toolbar : 'rgba(0, 0, 0, 0.06)'

        return style
    }

    get bodyStyle(): Record<string, string> {
        return { padding: this.preset.tokens.density === 'compact' ? '4px 6px' : '7px 8px' }
    }

    get buttonStyle(): Record<string, string> {
        const controlRadius = parseInt(
            themeCssVariables({ accent: this.accent, ...this.preset.tokens }, this.dark)['--theme-radius-control']
        )

        return {
            background: this.accent,
            color: textColorOnAccent(this.accent),
            borderRadius: Math.round(controlRadius * PREVIEW_RADIUS_SCALE) + 'px',
            fontFamily: this.fontFamily,
        }
    }

    get chartLines(): { path: string; color: string }[] {
        const palette = chartPaletteColors(this.preset.tokens.chartPalette, this.dark)

        return [
            { path: CHART_LINES[0], color: palette.series[0] },
            { path: CHART_LINES[1], color: palette.bed },
        ]
    }
}
</script>

<style scoped>
.theme-preset-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        border-color 0.15s,
        box-shadow 0.15s,
        transform 0.15s;
}

.theme-preset-card:hover,
.theme-preset-card:focus-visible {
    border-color: var(--theme-preset-accent);
    outline: none;
    transform: translateY(-1px);
}

.theme-preset-card:focus-visible,
.theme-preset-card--active {
    border-color: var(--theme-preset-accent);
    box-shadow: 0 0 0 1px var(--theme-preset-accent);
}

.theme-preset-card__preview {
    display: block;
    padding: 10px 12px;
    border-radius: 5px;
    border: 1px solid rgba(128, 128, 128, 0.2);
}

.theme-preset-card__panel {
    display: block;
    overflow: hidden;
}

.theme-preset-card__toolbar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 6px;
    box-sizing: content-box;
}

.theme-preset-card__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.theme-preset-card__line {
    width: 34%;
    height: 3px;
    border-radius: 2px;
}

.theme-preset-card__body {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.theme-preset-card__chart {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
}

.theme-preset-card__button {
    flex: 0 0 auto;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 500;
    line-height: 14px;
}

.theme-preset-card__label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-top: 8px;
}

.theme-preset-card__name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.theme-preset-card__description {
    display: block;
    margin-top: 2px;
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.7;
}

@media (prefers-reduced-motion: reduce) {
    .theme-preset-card {
        transition: none;
    }

    .theme-preset-card:hover,
    .theme-preset-card:focus-visible {
        transform: none;
    }
}
</style>
