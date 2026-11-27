<template>
    <v-card flat class="home-settings">
        <v-card-text>
            <named-layout-list
                :layouts="homeLayouts"
                :can-add="canAddHomeLayout"
                :title="$t('Shell.Home.Layouts')"
                :description="$t('Shell.Home.LayoutsDescription')"
                @switch="switchHomeLayout"
                @rename="renameLayout"
                @create="createHomeLayout"
                @delete="deleteLayout"
                @export="exportHomeLayout"
                @import="importHomeLayout" />
            <v-divider class="my-2" />
            <settings-row
                :title="$t('Shell.Home.Edit')"
                :sub-title="$t('Shell.Home.EditDescription')"
                :dynamic-slot-width="true">
                <v-btn class="home-settings__edit" small outlined @click="editHome">{{ $t('Shell.Home.Edit') }}</v-btn>
            </settings-row>
            <v-divider class="my-2" />
            <settings-row
                :title="$t('Shell.Print.While')"
                :sub-title="$t('Shell.Home.WhileDescription')"
                :mobile-second-row="true">
                <div class="home-settings__actions">
                    <v-select
                        v-for="(action, position) in activeHomeLayout.actions"
                        :key="position"
                        class="home-settings__action"
                        :value="action"
                        :items="actionItems"
                        :data-position="position + 1"
                        dense
                        outlined
                        hide-details
                        @change="setAction(position, $event)" />
                </div>
            </settings-row>
            <v-divider class="my-2" />
            <settings-row
                :title="$t('Shell.Home.CustomizeOnHome')"
                :sub-title="$t('Shell.Home.CustomizeOnHomeDescription')"
                :dynamic-slot-width="true">
                <v-checkbox v-model="showMenu" hide-details class="mt-0 pt-0 home-settings__show-menu" />
            </settings-row>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'
import NamedLayoutList from '@/components/layouts/NamedLayoutList.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import { WhileActionId, whileActions } from '@/plugins/shellHomeLayout'

@Component({
    components: { NamedLayoutList, SettingsRow },
})
export default class SettingsHomeTab extends Mixins(ShellHomeLayoutsMixin) {
    get actionItems(): { value: WhileActionId; text: string }[] {
        return whileActions.map((id) => ({ value: id, text: this.whileActionLabel(id) }))
    }

    get showMenu(): boolean {
        return this.showHomeLayoutMenu
    }

    set showMenu(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'shellHome.showMenu', value: newVal })
    }

    renameLayout(payload: { id: string; name: string }): void {
        this.$store.dispatch('gui/renameHomeLayout', payload)
    }

    deleteLayout(id: string): void {
        this.$store.dispatch('gui/deleteHomeLayout', id)
    }

    setAction(position: number, action: WhileActionId): void {
        const actions = [...this.activeHomeLayout.actions]
        const swapWith = actions.indexOf(action)
        if (swapWith !== -1) actions[swapWith] = actions[position]
        actions[position] = action

        this.$store.dispatch('gui/saveHomeActions', actions)
    }
}
</script>

<style scoped>
.home-settings__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    max-width: 420px;
}
</style>
