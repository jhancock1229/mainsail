<template>
    <div class="shell-home-editor">
        <div class="shell-home-editor__bar">
            <div class="shell-home-editor__title text-truncate">
                {{ $t('Shell.Home.Editing', { name: activeHomeLayoutName }) }}
            </div>
            <shell-tabs v-model="editState" :tabs="stateTabs" :label="$t('Shell.Home.Screen')" small />
            <div class="sh-spacer" />
            <button
                type="button"
                class="sh-btn sh-btn--44 sh-btn--quiet shell-home-editor__reset"
                :disabled="isDefault"
                @click="reset">
                {{ $t('Shell.Home.Reset') }}
            </button>
            <button type="button" class="sh-btn sh-btn--44 sh-btn--strong shell-home-editor__done" @click="done">
                {{ $t('Shell.Home.Done') }}
            </button>
        </div>
        <div class="sh-columns" :class="gridClasses">
            <section
                v-for="(column, index) in columns"
                :key="editState + index"
                class="sh-col sh-col--gap-12 shell-edit-col"
                :data-column="index + 1"
                :aria-label="$t('Shell.Home.Column', { number: index + 1 })">
                <div class="sh-row shell-edit-col__head">
                    <h2 class="sh-h2">{{ $t('Shell.Home.Column', { number: index + 1 }) }}</h2>
                    <shell-tabs
                        v-if="column.blocks.length > 1"
                        :value="column.mode"
                        :tabs="modeTabs(index)"
                        :label="$t('Shell.Home.Arrange')"
                        small
                        @input="setMode(index, $event)" />
                </div>
                <draggable
                    :value="column.blocks"
                    class="shell-edit-col__blocks"
                    handle=".shell-edit-block__handle"
                    ghost-class="shell-edit-block--ghost"
                    :animation="150"
                    :force-fallback="true"
                    @input="reorder(index, $event)">
                    <div v-for="id in column.blocks" :key="id" class="shell-edit-block" :data-block="id">
                        <span class="shell-edit-block__handle" :title="$t('Shell.Home.Drag')">
                            <v-icon small>{{ mdiDragVertical }}</v-icon>
                        </span>
                        <v-menu offset-y :max-height="360">
                            <template #activator="{ on, attrs }">
                                <button
                                    type="button"
                                    class="shell-edit-block__name"
                                    v-bind="attrs"
                                    :disabled="isRequired(id)"
                                    v-on="on">
                                    <span class="text-truncate">{{ homeBlockLabel(id) }}</span>
                                    <v-icon v-if="!isRequired(id)" small>{{ mdiChevronDown }}</v-icon>
                                </button>
                            </template>
                            <v-list dense class="shell-edit-menu">
                                <v-subheader>{{ $t('Shell.Home.ShowInstead') }}</v-subheader>
                                <v-list-item
                                    v-for="option in replaceOptions(index, id)"
                                    :key="option.id"
                                    :disabled="!option.fits"
                                    :data-block="option.id"
                                    @click="replace(index, id, option.id)">
                                    <v-list-item-content>
                                        <v-list-item-title>{{ option.label }}</v-list-item-title>
                                        <v-list-item-subtitle v-if="!option.fits">
                                            {{ $t('Shell.Home.NoRoom') }}
                                        </v-list-item-subtitle>
                                    </v-list-item-content>
                                </v-list-item>
                                <v-list-item v-if="replaceOptions(index, id).length === 0" disabled>
                                    <v-list-item-title>{{ $t('Shell.Home.NothingLeft') }}</v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-menu>
                        <span v-if="isRequired(id)" class="shell-edit-block__note">{{ $t('Shell.Home.Always') }}</span>
                        <button
                            v-else
                            type="button"
                            class="shell-edit-block__remove"
                            :disabled="column.blocks.length < 2"
                            :title="$t('Shell.Home.Remove')"
                            :aria-label="$t('Shell.Home.RemoveBlock', { name: homeBlockLabel(id) })"
                            @click="remove(index, id)">
                            <v-icon small>{{ mdiClose }}</v-icon>
                        </button>
                    </div>
                </draggable>
                <v-menu offset-y :max-height="360">
                    <template #activator="{ on, attrs }">
                        <button
                            type="button"
                            class="sh-btn sh-btn--44 shell-edit-col__add"
                            v-bind="attrs"
                            :disabled="addOptions(index).length === 0"
                            v-on="on">
                            {{ $t('Shell.Home.Add') }}
                        </button>
                    </template>
                    <v-list dense class="shell-edit-menu">
                        <v-list-item
                            v-for="option in addOptions(index)"
                            :key="option.id"
                            :disabled="!option.fits"
                            :data-block="option.id"
                            @click="add(index, option.id)">
                            <v-list-item-content>
                                <v-list-item-title>{{ option.label }}</v-list-item-title>
                                <v-list-item-subtitle v-if="!option.fits">
                                    {{ $t('Shell.Home.NoRoom') }}
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </v-menu>
                <div class="sh-spacer" />
                <div class="shell-edit-col__room">
                    <div class="sh-row sh-small sh-muted">
                        <span>{{ roomText(column) }}</span>
                        <span>{{ roomPercent(column) }}%</span>
                    </div>
                    <div class="sh-bar"><div :style="{ width: roomPercent(column) + '%' }" /></div>
                </div>
            </section>
        </div>
        <footer v-if="editState === 'printing'" class="shell-edit-actions" :aria-label="$t('Shell.Print.While')">
            <div class="shell-edit-actions__label">{{ $t('Shell.Print.While') }}</div>
            <v-menu v-for="(action, position) in actions" :key="position" offset-y top>
                <template #activator="{ on, attrs }">
                    <button
                        type="button"
                        class="sh-btn sh-btn--56 shell-edit-actions__action"
                        :data-position="position + 1"
                        v-bind="attrs"
                        v-on="on">
                        <span class="text-truncate">{{ whileActionLabel(action) }}</span>
                        <v-icon small>{{ mdiChevronDown }}</v-icon>
                    </button>
                </template>
                <v-list dense class="shell-edit-menu">
                    <v-list-item
                        v-for="option in allActions"
                        :key="option"
                        :data-action="option"
                        @click="setAction(position, option)">
                        <v-list-item-title>{{ whileActionLabel(option) }}</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </footer>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import draggable from 'vuedraggable'
import { mdiChevronDown, mdiClose, mdiDragVertical } from '@mdi/js'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import ShellTabs, { ShellTabItem } from '@/components/shell/ShellTabs.vue'
import { shellHomeEdit, stopShellHomeEdit } from '@/plugins/shellHomeEdit'
import {
    HomeArrangement,
    HomeBlockId,
    HomeColumn,
    HomeColumnMode,
    HomeLayoutState,
    WhileActionId,
    addBlock,
    columnBudget,
    columnHeight,
    homeLayoutStates,
    isDefaultArrangement,
    isDefaultWhileActions,
    removeBlock,
    reorderBlocks,
    replaceBlock,
    requiredBlocks,
    setColumnMode,
    unusedBlocks,
    whileActions,
} from '@/plugins/shellHomeLayout'

interface BlockOption {
    id: HomeBlockId
    label: string
    fits: boolean
}

@Component({ components: { draggable, ShellTabs } })
export default class ShellHomeEditor extends Mixins(ShellHomeLayoutsMixin) {
    mdiChevronDown = mdiChevronDown
    mdiClose = mdiClose
    mdiDragVertical = mdiDragVertical

    allActions = whileActions

    get editState(): HomeLayoutState {
        return shellHomeEdit.state
    }

    set editState(state: HomeLayoutState) {
        shellHomeEdit.state = state
    }

    get columns(): HomeArrangement {
        return this.activeHomeLayout.states[this.editState]
    }

    get actions(): WhileActionId[] {
        return this.activeHomeLayout.actions
    }

    get stateTabs(): ShellTabItem[] {
        return homeLayoutStates.map((id) => ({ id, label: this.$t(`Shell.Home.States.${id}`).toString() }))
    }

    get gridClasses(): Record<string, boolean> {
        const jobFirst = ['printing', 'finished'].includes(this.editState)

        return {
            'sh-columns--757': jobFirst,
            'sh-columns--755': !jobFirst,
            'sh-columns--ruled-bottom': this.editState === 'printing',
        }
    }

    get isDefault(): boolean {
        const defaultColumns = isDefaultArrangement(this.editState, this.columns)

        return this.editState === 'printing' ? defaultColumns && isDefaultWhileActions(this.actions) : defaultColumns
    }

    beforeDestroy(): void {
        stopShellHomeEdit()
    }

    isRequired(id: HomeBlockId): boolean {
        return requiredBlocks(this.editState).includes(id)
    }

    modeTabs(index: number): ShellTabItem[] {
        const splitFits = setColumnMode(this.editState, this.columns, index, 'split') !== null
        const tabs: ShellTabItem[] = [{ id: 'tabs', label: this.$t('Shell.Home.Modes.tabs').toString() }]
        if (splitFits) tabs.push({ id: 'split', label: this.$t('Shell.Home.Modes.split').toString() })

        return tabs
    }

    addOptions(index: number): BlockOption[] {
        return unusedBlocks(this.editState, this.columns).map((id) => ({
            id,
            label: this.homeBlockLabel(id),
            fits: addBlock(this.editState, this.columns, index, id) !== null,
        }))
    }

    replaceOptions(index: number, from: HomeBlockId): BlockOption[] {
        return unusedBlocks(this.editState, this.columns).map((id) => ({
            id,
            label: this.homeBlockLabel(id),
            fits: replaceBlock(this.editState, this.columns, index, from, id) !== null,
        }))
    }

    roomPercent(column: HomeColumn): number {
        return Math.min(100, Math.round((columnHeight(column) / columnBudget(this.editState)) * 100))
    }

    roomText(column: HomeColumn): string {
        const tabbed = column.mode === 'tabs' && column.blocks.length > 1

        return this.$t(tabbed ? 'Shell.Home.RoomTabs' : 'Shell.Home.Room').toString()
    }

    add(index: number, id: HomeBlockId): void {
        this.saveHomeArrangement(this.editState, addBlock(this.editState, this.columns, index, id))
    }

    remove(index: number, id: HomeBlockId): void {
        this.saveHomeArrangement(this.editState, removeBlock(this.editState, this.columns, index, id))
    }

    replace(index: number, from: HomeBlockId, to: HomeBlockId): void {
        this.saveHomeArrangement(this.editState, replaceBlock(this.editState, this.columns, index, from, to))
    }

    reorder(index: number, blocks: HomeBlockId[]): void {
        this.saveHomeArrangement(this.editState, reorderBlocks(this.editState, this.columns, index, blocks))
    }

    setMode(index: number, mode: HomeColumnMode): void {
        this.saveHomeArrangement(this.editState, setColumnMode(this.editState, this.columns, index, mode))
    }

    setAction(position: number, action: WhileActionId): void {
        const actions = [...this.actions]
        const swapWith = actions.indexOf(action)
        if (swapWith !== -1) actions[swapWith] = actions[position]
        actions[position] = action

        this.$store.dispatch('gui/saveHomeActions', actions)
    }

    reset(): void {
        this.$store.dispatch('gui/resetHomeArrangement', this.editState)
    }

    done(): void {
        stopShellHomeEdit()
    }
}
</script>

<style scoped>
.shell-home-editor {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
}

.shell-home-editor__bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 28px 14px;
    min-width: 0;
}

.shell-home-editor__title {
    font-size: 14px;
    font-weight: 600;
    min-width: 0;
}

.shell-home-editor__done {
    padding: 0 24px;
}

.shell-edit-col__head {
    align-items: center;
    min-height: 44px;
}

.shell-edit-col__blocks {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shell-edit-block {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    min-height: 52px;
    border: 1px solid var(--shell-border);
    border-radius: 8px;
    background: var(--shell-surface);
}

.shell-edit-block--ghost {
    opacity: 0.4;
}

.shell-edit-block__handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 100%;
    cursor: grab;
    touch-action: none;
}

.shell-edit-block__name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--shell-text);
    font: 500 15px var(--shell-font);
    text-align: left;
    cursor: pointer;
}

.shell-edit-block__name:disabled {
    cursor: default;
}

.shell-edit-block__name:focus-visible,
.shell-edit-block__remove:focus-visible {
    outline: 2px solid var(--shell-accent);
    outline-offset: -2px;
}

.shell-edit-block__note {
    padding: 0 14px;
    font-size: 13px;
    color: var(--shell-muted);
    white-space: nowrap;
}

.shell-edit-block__remove {
    width: 44px;
    height: 100%;
    border: 0;
    background: none;
    cursor: pointer;
}

.shell-edit-block__remove:disabled {
    opacity: 0.3;
    cursor: default;
}

.shell-edit-col__add {
    border-style: dashed;
    color: var(--shell-text-2);
}

.shell-edit-col__room {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shell-edit-actions {
    display: grid;
    grid-template-columns: auto repeat(4, minmax(0, 1fr));
    gap: 12px;
    align-items: center;
    padding: 16px 28px;
}

.shell-edit-actions__label {
    font-size: 13px;
    color: var(--shell-muted);
    padding-right: 8px;
}

.shell-edit-actions__action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    border-style: dashed;
}
</style>
