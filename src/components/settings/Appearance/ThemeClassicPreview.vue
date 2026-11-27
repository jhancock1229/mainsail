<template>
    <span class="theme-classic-preview" :style="{ background: colors.page }">
        <span class="theme-classic-preview__panel" :style="panelStyle">
            <span class="theme-classic-preview__toolbar" :style="toolbarStyle">
                <span class="theme-classic-preview__dot" :style="{ background: accent }" />
                <span class="theme-classic-preview__line" :style="{ background: mutedColor }" />
            </span>
            <span class="theme-classic-preview__body" :style="bodyStyle">
                <svg class="theme-classic-preview__chart" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <path
                        v-for="line in chartLines"
                        :key="line.path"
                        :d="line.path"
                        :stroke="line.color"
                        fill="none"
                        stroke-width="2"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke" />
                </svg>
                <span class="theme-classic-preview__button" :style="buttonStyle" />
            </span>
        </span>
    </span>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    chartPaletteColors,
    surfaceColors,
    themeCssVariables,
    ThemePreset,
    ThemeSurfaceColors,
} from '@/plugins/themeTokens'

const PREVIEW_RADIUS_SCALE = 0.6
const CHART_LINES = ['M0 22 C 20 20, 30 8, 50 10 S 80 18, 100 6', 'M0 12 C 25 14, 35 24, 55 20 S 85 10, 100 16']

@Component
export default class ThemeClassicPreview extends Mixins(BaseMixin) {
    @Prop({ type: Object, required: true }) declare readonly preset: ThemePreset
    @Prop({ type: String, required: true }) declare readonly accent: string

    get dark(): boolean {
        return this.$vuetify.theme.dark
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

    get panelStyle(): Record<string, string> {
        const surface = this.preset.tokens.surface
        const style: Record<string, string> = {
            background: this.colors.panel,
            borderRadius: Math.round(this.preset.tokens.radius * PREVIEW_RADIUS_SCALE) + 'px',
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
        const variables = themeCssVariables({ accent: this.accent, ...this.preset.tokens }, this.dark)

        return {
            background: this.accent,
            borderRadius: Math.round(parseInt(variables['--theme-radius-control']) * PREVIEW_RADIUS_SCALE) + 'px',
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
.theme-classic-preview {
    display: block;
    padding: 10px 12px;
}

.theme-classic-preview__panel {
    display: block;
    overflow: hidden;
}

.theme-classic-preview__toolbar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 6px;
    box-sizing: content-box;
}

.theme-classic-preview__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.theme-classic-preview__line {
    width: 34%;
    height: 3px;
    border-radius: 2px;
}

.theme-classic-preview__body {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.theme-classic-preview__chart {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
}

.theme-classic-preview__button {
    flex: 0 0 auto;
    width: 26px;
    height: 14px;
}
</style>
