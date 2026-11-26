<template>
    <div class="sh-columns sh-columns--755">
        <section :aria-label="$t('Shell.Error.Title')" class="sh-col sh-col--scroll shell-error">
            <h2 class="sh-h2">{{ $t('Shell.Error.Title') }}</h2>
            <klippy-state-panel v-if="klipperState !== 'ready'" class="shell-error__klippy" />
            <template v-else>
                <error-explainer
                    v-if="printExplanation"
                    class="shell-error__explainer"
                    :explanation="printExplanation"
                    color="error" />
                <div v-else class="shell-error__plain">{{ $t('Shell.Error.NoDetails') }}</div>
                <div class="sh-spacer" />
                <div class="shell-error__actions">
                    <button type="button" class="sh-btn sh-btn--strong shell-error__reprint" @click="reprintJob">
                        {{ $t('Shell.Print.PrintAgain') }}
                    </button>
                    <button type="button" class="sh-btn shell-error__clear" @click="clearJob">
                        {{ $t('Shell.Print.Done') }}
                    </button>
                </div>
            </template>
            <router-link to="/fix/status" class="sh-link">{{ $t('Shell.Error.More') }}</router-link>
        </section>

        <section :aria-label="viewLabel" class="sh-col">
            <div class="sh-row shell-error__head">
                <h2 class="sh-h2">{{ viewLabel }}</h2>
                <shell-tabs v-model="view" :tabs="views" :label="$t('Shell.Print.View')" small />
            </div>
            <shell-console v-if="view === 'console'" />
            <shell-camera v-else />
        </section>

        <section :aria-label="$t('Shell.Heat.Title')" class="sh-col sh-col--gap-16">
            <shell-heat v-if="klipperState === 'ready'" />
            <div v-if="klipperState === 'ready'" class="sh-rule" />
            <shell-events />
        </section>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import ShellPrintMixin from '@/components/mixins/shellPrint'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import ShellCamera from '@/components/shell/ShellCamera.vue'
import ShellConsole from '@/components/shell/ShellConsole.vue'
import ShellHeat from '@/components/shell/ShellHeat.vue'
import ShellEvents from '@/components/shell/ShellEvents.vue'
import KlippyStatePanel from '@/components/panels/KlippyStatePanel.vue'
import ErrorExplainer from '@/components/ui/ErrorExplainer.vue'
import { ErrorExplanation, explainError } from '@/plugins/errorExplainer'

@Component({
    components: { ErrorExplainer, KlippyStatePanel, ShellCamera, ShellConsole, ShellEvents, ShellHeat, ShellTabs },
})
export default class ShellHomeError extends Mixins(ShellPrintMixin) {
    view = 'console'

    get views(): ShellTabItem[] {
        return ['console', 'camera'].map((id) => ({ id, label: this.$t(`Shell.Print.Views.${id}`).toString() }))
    }

    get viewLabel(): string {
        return this.$t(`Shell.Print.Views.${this.view}`).toString()
    }

    get printExplanation(): ErrorExplanation | null {
        return explainError(String(this.printStats.message ?? ''), { klipperState: this.klipperState })
    }

    clearJob(): void {
        this.$socket.emit('printer.gcode.script', { script: 'SDCARD_RESET_FILE' }, { loading: 'statusPrintClear' })
    }

    reprintJob(): void {
        this.$socket.emit('printer.print.start', { filename: this.printFilename }, { loading: 'statusPrintReprint' })
    }
}
</script>

<style scoped>
.shell-error__head {
    align-items: center;
}

.shell-error__klippy ::v-deep .v-alert {
    margin-bottom: 0 !important;
}

.shell-error__plain {
    font-size: 16px;
    line-height: 1.5;
}

.shell-error__explainer ::v-deep .error-explainer__title {
    font-size: 20px !important;
    font-weight: 600 !important;
    line-height: 1.35;
}

.shell-error__actions {
    display: flex;
    gap: 10px;
}

.shell-error__reprint {
    flex: 2 1 0;
}

.shell-error__clear {
    flex: 1 1 0;
}
</style>
