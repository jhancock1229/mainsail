<template>
    <div class="sh-columns sh-columns--755">
        <section :aria-label="$t('Shell.Idle.Start')" class="sh-col shell-start">
            <div class="sh-row shell-start__head">
                <h2 class="sh-h2">{{ $t('Shell.Idle.Start') }}</h2>
                <button
                    v-if="existGcodesRootDirectory"
                    type="button"
                    class="sh-btn sh-btn--strong sh-btn--44 shell-start__upload"
                    :disabled="uploading"
                    @click="chooseFile">
                    {{ uploading ? $t('Shell.Idle.Uploading', { percent: uploadPercent }) : $t('Shell.Idle.Upload') }}
                </button>
                <input
                    ref="fileInput"
                    type="file"
                    class="shell-start__input"
                    :accept="acceptedExtensions"
                    @change="uploadFile" />
            </div>
            <div class="shell-start__files">
                <button
                    v-for="file in files"
                    :key="file.filename"
                    type="button"
                    class="shell-start__file"
                    @click="askStart(file)">
                    <span class="text-truncate">{{ shortName(file.filename) }}</span>
                    <span class="shell-start__meta">{{ fileMeta(file) }}</span>
                </button>
                <div v-if="files.length === 0" class="sh-box sh-box--dashed shell-start__empty">
                    {{ $t('Shell.Idle.NoFiles') }}
                </div>
            </div>
            <div class="sh-spacer" />
            <router-link to="/print/files" class="sh-link shell-start__all">
                {{ $t('Shell.Idle.AllFiles') }}
            </router-link>
        </section>

        <section :aria-label="$t('Shell.Idle.GetReady')" class="sh-col sh-col--gap-12 shell-ready">
            <h2 class="sh-h2">{{ $t('Shell.Idle.GetReady') }}</h2>
            <template v-if="presets.length">
                <div class="sh-row">
                    <div class="shell-ready__label">{{ $t('Shell.Idle.PreheatFor') }}</div>
                    <button v-if="anyHeaterOn" type="button" class="sh-link shell-ready__cooldown" @click="btnCoolDown">
                        {{ $t('Shell.Idle.CoolDown') }}
                    </button>
                </div>
                <div class="shell-ready__presets">
                    <button
                        v-for="preset in presets"
                        :key="preset.id"
                        type="button"
                        class="sh-btn shell-ready__preset"
                        @click="preheat(preset)">
                        <span class="text-truncate">{{ preset.name }}</span>
                        <span class="shell-ready__preset-values">{{ presetValues(preset) }}</span>
                    </button>
                </div>
            </template>
            <button type="button" class="sh-btn sh-btn--left sh-btn--56" data-action="home" @click="homeAll">
                {{ $t('Shell.Idle.HomeAll') }}
            </button>
            <button
                type="button"
                class="sh-btn sh-btn--left sh-btn--56"
                data-action="filament"
                @click="goTo('tune', 'extruder')">
                {{ $t('Shell.Idle.LoadFilament') }}
            </button>
            <button
                type="button"
                class="sh-btn sh-btn--left sh-btn--56"
                data-action="level"
                @click="goTo('tune', 'bed-level')">
                {{ $t('Shell.Idle.LevelBed') }}
            </button>
            <button
                type="button"
                class="sh-btn sh-btn--left sh-btn--56"
                data-action="move"
                @click="goTo('tune', 'move')">
                {{ $t('Shell.Idle.MoveToolhead') }}
            </button>
        </section>

        <section :aria-label="$t('Shell.Idle.CameraAndLast')" class="sh-col shell-last">
            <h2 class="sh-h2">{{ $t('Shell.Print.Views.camera') }}</h2>
            <shell-camera />
            <shell-spool />
            <template v-if="lastJob">
                <h2 class="sh-h2">{{ $t('Shell.Idle.LastPrint') }}</h2>
                <div class="shell-last__name text-truncate">{{ shortName(lastJob.filename) }}</div>
                <div class="shell-last__meta">{{ lastJobMeta }}</div>
                <button
                    v-if="lastJob.exists"
                    type="button"
                    class="sh-btn sh-btn--48 shell-last__again"
                    @click="askStart({ filename: lastJob.filename })">
                    {{ $t('Shell.Print.PrintAgain') }}
                </button>
            </template>
        </section>

        <start-print-dialog v-if="startFile" v-model="showStartDialog" :file="startFile" current-path="" />
        <confirmation-dialog
            v-model="showCoolDownDialog"
            :icon="mdiSnowflake"
            :title="$t('CoolDownDialog.CoolDown')"
            :text="$t('CoolDownDialog.AreYouSure')"
            :action-button-text="$t('Buttons.Yes')"
            :cancel-button-text="$t('Buttons.No')"
            @action="cooldown" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import axios, { AxiosProgressEvent } from 'axios'
import { mdiSnowflake } from '@mdi/js'
import ShellMixin from '@/components/mixins/shell'
import ShellCamera from '@/components/shell/ShellCamera.vue'
import ShellSpool from '@/components/shell/ShellSpool.vue'
import StartPrintDialog from '@/components/dialogs/StartPrintDialog.vue'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import { FileStateGcodefile } from '@/store/files/types'
import { GuiPresetsStatePreset } from '@/store/gui/presets/types'
import { ServerHistoryStateJob } from '@/store/server/history/types'
import { validGcodeExtensions } from '@/store/variables'
import { formatShellDuration } from '@/plugins/shellStatus'
import {
    DEFAULT_FILAMENT_DIAMETER,
    filamentLengthToWeight,
    formatSpoolWeight,
    materialDensity,
} from '@/plugins/spoolTracker'

const MAX_FILES = 5
const MAX_PRESETS = 6
const MS_PER_SECOND = 1000

@Component({ components: { ConfirmationDialog, ShellCamera, ShellSpool, StartPrintDialog } })
export default class ShellHomeIdle extends Mixins(ShellMixin) {
    mdiSnowflake = mdiSnowflake

    showStartDialog = false
    startFile: Partial<FileStateGcodefile> | null = null
    showCoolDownDialog = false
    uploading = false
    uploadPercent = 0

    @Ref() readonly fileInput!: HTMLInputElement

    get acceptedExtensions(): string {
        return this.isIOS ? '' : validGcodeExtensions.join(', ')
    }

    get files(): FileStateGcodefile[] {
        const gcodes: FileStateGcodefile[] = [...(this.$store.getters['files/getAllGcodes'] ?? [])]
        const recent = gcodes.sort((a, b) => b.modified.getTime() - a.modified.getTime()).slice(0, MAX_FILES)
        const missing = recent.filter((file) => !file.metadataRequested && !file.metadataPulled)
        if (missing.length) {
            this.$store.dispatch(
                'files/requestMetadata',
                missing.map((file) => ({ filename: 'gcodes/' + file.filename }))
            )
        }

        return recent
    }

    get presets(): GuiPresetsStatePreset[] {
        const presets: GuiPresetsStatePreset[] = this.$store.getters['gui/presets/getPresets'] ?? []

        return presets.slice(0, MAX_PRESETS)
    }

    get anyHeaterOn(): boolean {
        const heaters: string[] = this.$store.state.printer.heaters?.available_heaters ?? []

        return heaters.some((name) => (this.$store.state.printer[name]?.target ?? 0) > 0)
    }

    get lastJob(): ServerHistoryStateJob | null {
        const jobs: ServerHistoryStateJob[] = this.$store.state.server.history?.jobs ?? []
        const ended = jobs.filter((job) => job.status !== 'in_progress' && job.end_time > 0)
        if (ended.length === 0) return null

        return ended.reduce((latest, job) => (job.end_time > latest.end_time ? job : latest))
    }

    get lastJobMeta(): string {
        const job = this.lastJob
        if (job === null) return ''

        const key = job.status === 'completed' ? 'Shell.Idle.Finished' : 'Shell.Idle.Stopped'
        const end = job.end_time * MS_PER_SECOND
        const sameDay = new Date(end).toDateString() === new Date().toDateString()
        const time = sameDay ? this.formatTime(end) : `${this.formatDate(end)} ${this.formatTime(end)}`

        return [this.$t(key, { time }).toString(), formatShellDuration(job.total_duration)].join(' · ')
    }

    shortName(filename: string): string {
        return filename.slice(filename.lastIndexOf('/') + 1)
    }

    fileMeta(file: FileStateGcodefile): string {
        const parts: string[] = []
        if (file.estimated_time > 0) parts.push(formatShellDuration(file.estimated_time))

        const diameter =
            this.$store.state.printer.configfile?.settings?.extruder?.filament_diameter ?? DEFAULT_FILAMENT_DIAMETER
        const weight =
            file.filament_weight_total > 0
                ? file.filament_weight_total
                : filamentLengthToWeight(file.filament_total ?? 0, diameter, materialDensity(file.filament_type))
        if (weight > 0) parts.push(formatSpoolWeight(weight))

        return parts.join(' · ')
    }

    presetValues(preset: GuiPresetsStatePreset): string {
        return Object.values(preset.values ?? {})
            .filter((attributes) => attributes.bool)
            .map((attributes) => attributes.value)
            .join(' / ')
    }

    askStart(file: Partial<FileStateGcodefile>): void {
        this.startFile = file
        this.showStartDialog = true
    }

    preheat(preset: GuiPresetsStatePreset): void {
        for (const [name, attributes] of Object.entries(preset.values ?? {})) {
            if (!attributes.bool) continue

            const [printerObject, printerObjectName = printerObject] = name.split(' ')
            const isFan = printerObject === 'temperature_fan'
            const command = isFan ? 'SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN' : 'SET_HEATER_TEMPERATURE HEATER'
            this.sendGcode(`${command}=${printerObjectName} TARGET=${attributes.value}`)
        }

        if (preset.gcode) this.sendGcode(preset.gcode)
    }

    btnCoolDown(): void {
        if (this.$store.state.gui.uiSettings.confirmOnCoolDown) {
            this.showCoolDownDialog = true
            return
        }

        this.cooldown()
    }

    cooldown(): void {
        this.sendGcode(this.$store.getters['gui/presets/getCooldownGcode'])
    }

    homeAll(): void {
        this.sendGcode('G28', 'homeAll')
    }

    chooseFile(): void {
        this.fileInput.click()
    }

    async uploadFile(): Promise<void> {
        const file = this.fileInput.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file, file.name)
        this.uploading = true
        this.uploadPercent = 0

        try {
            const result = await axios.post(this.apiUrl + '/server/files/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (event: AxiosProgressEvent) => {
                    this.uploadPercent = Math.round((event.progress ?? 0) * 100)
                },
            })
            const filename: string = result.data?.result?.item?.path ?? result.data?.item?.path ?? file.name
            this.$toast.success(this.$t('App.TopBar.UploadOfFileSuccessful', { file: filename }).toString())
            this.askStart({ filename })
        } catch {
            this.$toast.error(this.$t('App.TopBar.CannotUploadTheFile').toString())
        } finally {
            this.uploading = false
            this.fileInput.value = ''
        }
    }
}
</script>

<style scoped>
.shell-start__head {
    align-items: center;
}

.shell-start__upload {
    font-weight: 600;
}

.shell-start__input {
    display: none;
}

.shell-start__files {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
}

.shell-start__file {
    min-height: 64px;
    flex: 0 0 64px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border-radius: 8px;
    border: 1px solid var(--shell-line);
    background: var(--shell-surface);
    color: var(--shell-text);
    text-align: left;
    font: 500 16px var(--shell-font);
    cursor: pointer;
}

.shell-start__file:hover {
    background: var(--shell-hover);
    border-color: var(--shell-border);
}

.shell-start__file:focus-visible {
    outline: 2px solid var(--shell-accent);
    outline-offset: 2px;
}

.shell-start__meta {
    font: 400 14px var(--shell-font);
    color: var(--shell-muted);
    white-space: nowrap;
}

.shell-start__empty {
    min-height: 120px;
}

.shell-ready__label {
    font-size: 14px;
    color: var(--shell-muted);
}

.shell-ready__cooldown {
    padding: 0;
    font-size: 13px;
}

.shell-ready__presets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.shell-ready__preset {
    min-height: 60px;
    padding: 0 8px;
    font-weight: 600;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
}

.shell-ready__preset > span {
    max-width: 100%;
}

.shell-ready__preset-values {
    font: 400 12px var(--shell-font);
    color: var(--shell-muted);
}

.shell-last__name {
    font-size: 16px;
    font-weight: 500;
}

.shell-last__meta {
    font-size: 14px;
    color: var(--shell-muted);
}

@media (max-height: 760px) {
    .shell-ready .sh-btn--56 {
        min-height: 48px;
    }

    .shell-last {
        gap: 10px;
    }
}
</style>
