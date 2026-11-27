<template>
    <span class="theme-shell-preview" :style="rootStyle">
        <span class="theme-shell-preview__rail">
            <span class="theme-shell-preview__nav theme-shell-preview__nav--active" :style="controlStyle" />
            <span class="theme-shell-preview__nav" />
            <span class="theme-shell-preview__nav" />
        </span>
        <span class="theme-shell-preview__column">
            <span class="theme-shell-preview__title" />
            <span class="theme-shell-preview__bar"><span /></span>
            <span class="theme-shell-preview__button" :style="controlStyle" />
        </span>
        <span class="theme-shell-preview__column">
            <span class="theme-shell-preview__text" />
            <span class="theme-shell-preview__outline" :style="controlStyle" />
            <span class="theme-shell-preview__outline" :style="controlStyle" />
        </span>
    </span>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { shellAccentColors, shellPalette, ShellThemePreset } from '@/plugins/shellTheme'

const PREVIEW_RADIUS_SCALE = 0.4

@Component
export default class ThemeShellPreview extends Mixins(BaseMixin) {
    @Prop({ type: Object, required: true }) declare readonly preset: ShellThemePreset

    get rootStyle(): Record<string, string> {
        const dark = this.$vuetify.theme.dark
        const palette = shellPalette(this.preset.tokens.tone, dark)
        const compact = this.preset.tokens.density === 'compact'

        return {
            '--preview-bg': palette.bg,
            '--preview-raised': dark ? palette.active : palette.hover,
            '--preview-line': palette.line,
            '--preview-border': palette.border,
            '--preview-text': palette.text,
            '--preview-muted': palette.muted,
            '--preview-strong': palette['strong-bg'],
            '--preview-accent': shellAccentColors(this.preset.tokens.accent, this.preset.tokens.tone, dark).accent,
            '--preview-gap': compact ? '3px' : '5px',
            '--preview-pad': compact ? '5px' : '7px',
        }
    }

    get controlStyle(): Record<string, string> {
        return { borderRadius: Math.round(this.preset.tokens.radius * PREVIEW_RADIUS_SCALE) + 'px' }
    }
}
</script>

<style scoped>
.theme-shell-preview {
    display: grid;
    grid-template-columns: 26% 1fr 1fr;
    gap: 1px;
    height: 64px;
    background: var(--preview-line);
}

.theme-shell-preview__rail,
.theme-shell-preview__column {
    display: flex;
    flex-direction: column;
    gap: var(--preview-gap);
    padding: var(--preview-pad);
    min-width: 0;
    background: var(--preview-bg);
}

.theme-shell-preview__nav {
    height: 4px;
    width: 70%;
    margin: 2px 3px;
    border-radius: 2px;
    background: var(--preview-muted);
    opacity: 0.6;
}

.theme-shell-preview__nav--active {
    height: 10px;
    width: 100%;
    margin: 0;
    background: var(--preview-raised);
    opacity: 1;
}

.theme-shell-preview__title {
    height: 5px;
    width: 55%;
    border-radius: 2px;
    background: var(--preview-text);
}

.theme-shell-preview__text {
    height: 4px;
    width: 40%;
    border-radius: 2px;
    background: var(--preview-muted);
}

.theme-shell-preview__bar {
    height: 4px;
    border-radius: 2px;
    background: var(--preview-line);
    overflow: hidden;
}

.theme-shell-preview__bar > span {
    display: block;
    width: 45%;
    height: 100%;
    background: var(--preview-accent);
}

.theme-shell-preview__button {
    height: 13px;
    margin-top: auto;
    background: var(--preview-strong);
}

.theme-shell-preview__outline {
    flex: 1 1 0;
    max-height: 13px;
    border: 1px solid var(--preview-border);
}
</style>
