<template>
    <div class="dashboard-layouts">
        <div class="d-flex align-center flex-wrap mb-1">
            <div class="dashboard-layouts__intro">
                <div class="settings-row-title">{{ $t('Dashboard.Layouts.Layouts') }}</div>
                <div class="settings-row-subtitle">{{ $t('Dashboard.Layouts.Description') }}</div>
            </div>
            <v-spacer />
            <input ref="importFile" type="file" accept=".json,application/json" class="d-none" @change="onImport" />
            <v-btn class="dashboard-layouts__import" small text :disabled="!canAddDashboardLayout" @click="pickFile">
                <v-icon small left>{{ mdiUpload }}</v-icon>
                {{ $t('Dashboard.Layouts.Import') }}
            </v-btn>
            <v-btn
                class="dashboard-layouts__new"
                small
                text
                color="primary"
                :disabled="!canAddDashboardLayout"
                @click="openDialog('new', activeDashboardLayout)">
                <v-icon small left>{{ mdiPlus }}</v-icon>
                {{ $t('Dashboard.Layouts.SaveAs') }}
            </v-btn>
        </div>
        <div
            v-for="layout in dashboardLayouts"
            :key="layout.id"
            class="dashboard-layouts__item"
            :class="{ 'dashboard-layouts__item--active': layout.active }">
            <v-btn
                class="dashboard-layouts__select"
                text
                :title="$t('Dashboard.Layouts.Switch')"
                @click="switchDashboardLayout(layout.id)">
                <v-icon small left :color="layout.active ? 'primary' : ''">
                    {{ layout.active ? mdiRadioboxMarked : mdiRadioboxBlank }}
                </v-icon>
                <span class="text-truncate">{{ layout.name }}</span>
                <v-chip v-if="layout.active" x-small label color="primary" class="ml-2">
                    {{ $t('Dashboard.Layouts.Active') }}
                </v-chip>
            </v-btn>
            <v-spacer />
            <v-btn
                class="dashboard-layouts__rename"
                icon
                small
                :title="$t('Dashboard.Layouts.Rename')"
                @click="openDialog('rename', layout)">
                <v-icon small>{{ mdiPencil }}</v-icon>
            </v-btn>
            <v-btn
                class="dashboard-layouts__duplicate"
                icon
                small
                :disabled="!canAddDashboardLayout"
                :title="$t('Dashboard.Layouts.Duplicate')"
                @click="openDialog('duplicate', layout)">
                <v-icon small>{{ mdiContentCopy }}</v-icon>
            </v-btn>
            <v-btn
                class="dashboard-layouts__export"
                icon
                small
                :title="$t('Dashboard.Layouts.Export')"
                @click="exportDashboardLayout(layout)">
                <v-icon small>{{ mdiDownload }}</v-icon>
            </v-btn>
            <v-btn
                class="dashboard-layouts__delete"
                icon
                small
                :disabled="dashboardLayouts.length < 2"
                :title="$t('Dashboard.Layouts.Delete')"
                @click="deleteTarget = layout">
                <v-icon small>{{ mdiDelete }}</v-icon>
            </v-btn>
        </div>
        <dashboard-layout-name-dialog
            :show="dialogMode !== null"
            :title="dialogTitle"
            :hint="dialogHint"
            :confirm-text="$t('Buttons.Save')"
            :initial-name="dialogInitialName"
            @confirm="confirmDialog"
            @close="dialogMode = null" />
        <v-dialog :value="deleteTarget !== null" max-width="420" @click:outside="deleteTarget = null">
            <v-card v-if="deleteTarget !== null" class="dashboard-layouts__delete-dialog">
                <v-card-title class="text-h6">{{ $t('Dashboard.Layouts.Delete') }}</v-card-title>
                <v-card-text>{{ $t('Dashboard.Layouts.DeleteQuestion', { name: deleteTarget.name }) }}</v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="deleteTarget = null">{{ $t('Buttons.Cancel') }}</v-btn>
                    <v-btn text color="error" @click="confirmDelete">{{ $t('Buttons.Delete') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref } from 'vue-property-decorator'
import DashboardLayoutsMixin, { DashboardLayoutListItem } from '@/components/mixins/dashboardLayouts'
import DashboardLayoutNameDialog from '@/components/dashboard/DashboardLayoutNameDialog.vue'
import {
    mdiContentCopy,
    mdiDelete,
    mdiDownload,
    mdiPencil,
    mdiPlus,
    mdiRadioboxBlank,
    mdiRadioboxMarked,
    mdiUpload,
} from '@mdi/js'
import { TranslateResult } from 'vue-i18n'

type DialogMode = 'new' | 'rename' | 'duplicate'

@Component({
    components: { DashboardLayoutNameDialog },
})
export default class SettingsDashboardLayouts extends Mixins(DashboardLayoutsMixin) {
    @Ref() readonly importFile!: HTMLInputElement

    mdiContentCopy = mdiContentCopy
    mdiDelete = mdiDelete
    mdiDownload = mdiDownload
    mdiPencil = mdiPencil
    mdiPlus = mdiPlus
    mdiRadioboxBlank = mdiRadioboxBlank
    mdiRadioboxMarked = mdiRadioboxMarked
    mdiUpload = mdiUpload

    dialogMode: DialogMode | null = null
    dialogTarget: DashboardLayoutListItem | null = null
    deleteTarget: DashboardLayoutListItem | null = null

    get dialogTitle(): string | TranslateResult {
        if (this.dialogMode === 'rename') return this.$t('Dashboard.Layouts.Rename')
        if (this.dialogMode === 'duplicate') return this.$t('Dashboard.Layouts.Duplicate')

        return this.$t('Dashboard.Layouts.SaveAs')
    }

    get dialogHint(): string | TranslateResult {
        return this.dialogMode === 'new' ? this.$t('Dashboard.Layouts.SaveAsHint') : ''
    }

    get dialogInitialName(): string {
        const name = this.dialogTarget?.name ?? ''
        if (this.dialogMode === 'rename') return name
        if (this.dialogMode === 'duplicate') return this.$t('Dashboard.Layouts.CopyName', { name }).toString()

        return ''
    }

    openDialog(mode: DialogMode, layout: DashboardLayoutListItem): void {
        this.dialogTarget = layout
        this.dialogMode = mode
    }

    confirmDialog(name: string): void {
        const target = this.dialogTarget
        if (target === null) return

        if (this.dialogMode === 'rename') {
            this.$store.dispatch('gui/renameDashboardLayout', { id: target.id, name })
            return
        }

        this.createDashboardLayout({
            name,
            sourceId: target.id,
            activate: this.dialogMode === 'new',
        })
    }

    confirmDelete(): void {
        if (this.deleteTarget !== null) this.$store.dispatch('gui/deleteDashboardLayout', this.deleteTarget.id)
        this.deleteTarget = null
    }

    pickFile(): void {
        this.importFile.click()
    }

    async onImport(): Promise<void> {
        const file = this.importFile.files?.[0]
        if (file) await this.importDashboardLayout(file)
        this.importFile.value = ''
    }
}
</script>

<style scoped>
.dashboard-layouts__intro {
    flex: 1 1 260px;
    min-width: 0;
}

.dashboard-layouts__item {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding-right: 4px;
    border-radius: 4px;
}

.dashboard-layouts__item + .dashboard-layouts__item {
    margin-top: 2px;
}

.dashboard-layouts__item--active {
    background: rgba(128, 128, 128, 0.12);
}

.dashboard-layouts__select {
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 130px);
    text-transform: none;
    letter-spacing: normal;
    justify-content: flex-start;
}

.dashboard-layouts__select ::v-deep .v-btn__content {
    min-width: 0;
    max-width: 100%;
}
</style>
