<template>
    <div class="layout-list">
        <div class="d-flex align-center flex-wrap mb-1">
            <div class="layout-list__intro">
                <div class="settings-row-title">{{ title }}</div>
                <div class="settings-row-subtitle">{{ description }}</div>
            </div>
            <v-spacer />
            <input ref="importFile" type="file" accept=".json,application/json" class="d-none" @change="onImport" />
            <v-btn class="layout-list__import" small text :disabled="!canAdd" @click="pickFile">
                <v-icon small left>{{ mdiUpload }}</v-icon>
                {{ $t('Dashboard.Layouts.Import') }}
            </v-btn>
            <v-btn
                class="layout-list__new"
                small
                text
                color="primary"
                :disabled="!canAdd"
                @click="openDialog('new', activeLayout)">
                <v-icon small left>{{ mdiPlus }}</v-icon>
                {{ $t('Dashboard.Layouts.SaveAs') }}
            </v-btn>
        </div>
        <div
            v-for="layout in layouts"
            :key="layout.id"
            class="layout-list__item"
            :class="{ 'layout-list__item--active': layout.active }">
            <v-btn
                class="layout-list__select"
                text
                :title="$t('Dashboard.Layouts.Switch')"
                @click="$emit('switch', layout.id)">
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
                class="layout-list__rename"
                icon
                small
                :title="$t('Dashboard.Layouts.Rename')"
                @click="openDialog('rename', layout)">
                <v-icon small>{{ mdiPencil }}</v-icon>
            </v-btn>
            <v-btn
                class="layout-list__duplicate"
                icon
                small
                :disabled="!canAdd"
                :title="$t('Dashboard.Layouts.Duplicate')"
                @click="openDialog('duplicate', layout)">
                <v-icon small>{{ mdiContentCopy }}</v-icon>
            </v-btn>
            <v-btn
                class="layout-list__export"
                icon
                small
                :title="$t('Dashboard.Layouts.Export')"
                @click="$emit('export', layout.id)">
                <v-icon small>{{ mdiDownload }}</v-icon>
            </v-btn>
            <v-btn
                class="layout-list__delete"
                icon
                small
                :disabled="layouts.length < 2"
                :title="$t('Dashboard.Layouts.Delete')"
                @click="deleteTarget = layout">
                <v-icon small>{{ mdiDelete }}</v-icon>
            </v-btn>
        </div>
        <layout-name-dialog
            :show="dialogMode !== null"
            :title="dialogTitle"
            :hint="dialogHint"
            :confirm-text="$t('Buttons.Save')"
            :initial-name="dialogInitialName"
            @confirm="confirmDialog"
            @close="dialogMode = null" />
        <v-dialog :value="deleteTarget !== null" max-width="420" @click:outside="deleteTarget = null">
            <v-card v-if="deleteTarget !== null" class="layout-list__delete-dialog">
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
import { Mixins, Prop, Ref } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import LayoutNameDialog from '@/components/layouts/LayoutNameDialog.vue'
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

export interface NamedLayoutListItem {
    id: string
    name: string
    active: boolean
}

@Component({
    components: { LayoutNameDialog },
})
export default class NamedLayoutList extends Mixins(BaseMixin) {
    @Prop({ type: Array, required: true }) declare readonly layouts: NamedLayoutListItem[]
    @Prop({ type: Boolean, required: true }) declare readonly canAdd: boolean
    @Prop({ type: String, required: true }) declare readonly title: string | TranslateResult
    @Prop({ type: String, required: true }) declare readonly description: string | TranslateResult

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
    dialogTarget: NamedLayoutListItem | null = null
    deleteTarget: NamedLayoutListItem | null = null

    get activeLayout(): NamedLayoutListItem {
        return this.layouts.find((layout) => layout.active) ?? this.layouts[0]
    }

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

    openDialog(mode: DialogMode, layout: NamedLayoutListItem): void {
        this.dialogTarget = layout
        this.dialogMode = mode
    }

    confirmDialog(name: string): void {
        const target = this.dialogTarget
        if (target === null) return

        if (this.dialogMode === 'rename') {
            this.$emit('rename', { id: target.id, name })
            return
        }

        this.$emit('create', { name, sourceId: target.id, activate: this.dialogMode === 'new' })
    }

    confirmDelete(): void {
        if (this.deleteTarget !== null) this.$emit('delete', this.deleteTarget.id)
        this.deleteTarget = null
    }

    pickFile(): void {
        this.importFile.click()
    }

    onImport(): void {
        const file = this.importFile.files?.[0]
        this.importFile.value = ''
        if (file) this.$emit('import', file)
    }
}
</script>

<style scoped>
.layout-list__intro {
    flex: 1 1 260px;
    min-width: 0;
}

.layout-list__item {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding-right: 4px;
    border-radius: 4px;
}

.layout-list__item + .layout-list__item {
    margin-top: 2px;
}

.layout-list__item--active {
    background: rgba(128, 128, 128, 0.12);
}

.layout-list__select {
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 130px);
    text-transform: none;
    letter-spacing: normal;
    justify-content: flex-start;
}

.layout-list__select ::v-deep .v-btn__content {
    min-width: 0;
    max-width: 100%;
}
</style>
