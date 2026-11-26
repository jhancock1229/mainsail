<template>
    <v-dialog v-model="showDialog" width="440">
        <v-card class="shell-spool-dialog">
            <v-card-title class="shell-spool-dialog__title">{{ $t('Shell.Spool.Dialog.Title') }}</v-card-title>
            <v-card-text>
                <p class="mb-5">{{ $t('Shell.Spool.Dialog.Intro') }}</p>
                <v-text-field
                    v-model="name"
                    class="shell-spool-dialog__name"
                    :label="$t('Shell.Spool.Dialog.Name')"
                    :placeholder="$t('Shell.Spool.Dialog.NamePlaceholder')"
                    persistent-placeholder
                    outlined
                    dense
                    hide-details
                    @keyup.enter="save" />
                <v-select
                    v-model="material"
                    class="mt-4 shell-spool-dialog__material"
                    :items="materials"
                    :label="$t('Shell.Spool.Dialog.Material')"
                    outlined
                    dense
                    hide-details />
                <v-text-field
                    v-model.number="sizeGrams"
                    class="mt-4 shell-spool-dialog__size"
                    type="number"
                    min="1"
                    step="50"
                    suffix="g"
                    :label="$t('Shell.Spool.Dialog.Size')"
                    :hint="$t('Shell.Spool.Dialog.SizeHint')"
                    persistent-hint
                    outlined
                    dense
                    @keyup.enter="save" />
            </v-card-text>
            <v-card-actions class="px-6 pb-5">
                <v-spacer />
                <v-btn text @click="showDialog = false">{{ $t('Buttons.Cancel') }}</v-btn>
                <v-btn depressed class="shell-spool-dialog__save" :disabled="!valid" @click="save">
                    {{ $t('Shell.Spool.Dialog.Save') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, VModel, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { ServerHistoryStateJob } from '@/store/server/history/types'
import {
    DEFAULT_SPOOL_SIZE_GRAMS,
    latestFinishedJobId,
    resolveSpoolTrackerSettings,
    spoolMaterials,
    SpoolTrackerSettings,
} from '@/plugins/spoolTracker'

const MS_PER_SECOND = 1000

@Component
export default class ShellSpoolDialog extends Mixins(BaseMixin) {
    @VModel({ type: Boolean }) showDialog!: boolean

    materials = spoolMaterials
    name = ''
    material = 'PLA'
    sizeGrams = DEFAULT_SPOOL_SIZE_GRAMS

    get valid(): boolean {
        return Number.isFinite(this.sizeGrams) && this.sizeGrams > 0
    }

    @Watch('showDialog')
    onShowDialogChanged(show: boolean): void {
        if (!show) return

        const settings = resolveSpoolTrackerSettings(this.$store.state.gui.spoolTracker)
        this.name = ''
        this.material = spoolMaterials.includes(settings.material) ? settings.material : spoolMaterials[0]
        this.sizeGrams = DEFAULT_SPOOL_SIZE_GRAMS
    }

    save(): void {
        if (!this.valid) return

        const printStats = this.$store.state.printer.print_stats ?? {}
        const jobs: ServerHistoryStateJob[] = this.$store.state.server.history?.jobs ?? []
        const value: SpoolTrackerSettings = {
            enabled: true,
            name: this.name.trim(),
            material: this.material,
            sizeGrams: this.sizeGrams,
            loadedAt: Date.now() / MS_PER_SECOND,
            usedLength: 0,
            lastJobId: latestFinishedJobId(
                jobs.map((job) => ({ id: job.job_id, filamentUsed: job.filament_used, status: job.status }))
            ),
            baselineLength: this.printerIsPrinting ? (printStats.filament_used ?? 0) : 0,
        }

        this.$store.dispatch('gui/saveSetting', { name: 'spoolTracker', value })
        this.showDialog = false
    }
}
</script>

<style scoped>
.shell-spool-dialog__title {
    font-size: 20px;
    font-weight: 600;
    padding: 22px 24px 8px;
}

.shell-spool-dialog__save:not(.v-btn--disabled) {
    background-color: var(--shell-strong-bg) !important;
    color: var(--shell-strong-text) !important;
}
</style>
