<template>
    <header class="shell-header" :class="{ 'shell-header--tabs': tabs }">
        <h1 class="shell-header__title">{{ title }}</h1>
        <div class="shell-header__side">
            <button
                v-if="showSaveConfig"
                type="button"
                class="sh-btn sh-btn--44 shell-header__save save-config-button"
                :disabled="printerIsPrinting"
                @click="saveConfig">
                {{ $t('Shell.SaveConfig') }}
            </button>
            <div class="shell-header__status">{{ status }}</div>
        </div>
    </header>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import ShellMixin from '@/components/mixins/shell'

@Component
export default class ShellHeader extends Mixins(ShellMixin) {
    @Prop({ type: String, required: true }) declare readonly title: string
    @Prop({ type: String, default: '' }) declare readonly status: string
    @Prop({ type: Boolean, default: false }) declare readonly tabs: boolean

    get showSaveConfig(): boolean {
        if (!this.klipperReadyForGui) return false

        const configfile = this.$store.state.printer.configfile ?? {}
        if (!(this.$store.state.gui.uiSettings.hideSaveConfigForBedMash ?? false)) {
            return configfile.save_config_pending ?? false
        }

        return Object.keys(configfile.save_config_pending_items ?? {}).some((key) => !key.startsWith('bed_mesh '))
    }

    saveConfig(): void {
        this.sendGcode('SAVE_CONFIG', 'topbarSaveConfig')
    }
}
</script>

<style scoped>
.shell-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    padding: 22px 28px 18px;
    min-width: 0;
}

.shell-header--tabs {
    padding-bottom: 14px;
}

.shell-header__title {
    margin: 0;
    font-size: 28px;
    line-height: 1.25;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.shell-header__side {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-width: 0;
}

.shell-header__status {
    font-size: 14px;
    color: var(--shell-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.shell-header__save {
    min-height: 36px;
    flex: 0 0 auto;
    color: var(--shell-accent);
    border-color: var(--shell-accent);
}
</style>
