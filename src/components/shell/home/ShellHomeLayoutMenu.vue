<template>
    <v-menu offset-y left :max-height="420">
        <template #activator="{ on, attrs }">
            <button type="button" class="shell-home-menu" v-bind="attrs" v-on="on">
                <span class="text-truncate">{{ label }}</span>
                <v-icon small>{{ mdiChevronDown }}</v-icon>
            </button>
        </template>
        <v-list dense class="shell-home-menu__list">
            <v-subheader>{{ $t('Shell.Home.Layouts') }}</v-subheader>
            <v-list-item
                v-for="layout in homeLayouts"
                :key="layout.id"
                class="shell-home-menu__layout"
                :aria-current="layout.active ? 'true' : 'false'"
                @click="switchHomeLayout(layout.id)">
                <v-list-item-icon class="mr-2">
                    <v-icon v-if="layout.active" small>{{ mdiCheck }}</v-icon>
                </v-list-item-icon>
                <v-list-item-title>{{ layout.name }}</v-list-item-title>
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item class="shell-home-menu__edit" @click="editHome">
                <v-list-item-icon class="mr-2" />
                <v-list-item-title>{{ $t('Shell.Home.Edit') }}</v-list-item-title>
            </v-list-item>
            <v-list-item class="shell-home-menu__manage" @click="goTo('settings', 'home')">
                <v-list-item-icon class="mr-2" />
                <v-list-item-title>{{ $t('Shell.Home.Manage') }}</v-list-item-title>
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import { mdiCheck, mdiChevronDown } from '@mdi/js'
import ShellHomeLayoutsMixin from '@/components/mixins/shellHomeLayouts'

@Component
export default class ShellHomeLayoutMenu extends Mixins(ShellHomeLayoutsMixin) {
    mdiCheck = mdiCheck
    mdiChevronDown = mdiChevronDown

    get label(): string {
        return this.homeLayouts.length > 1 ? this.activeHomeLayoutName : this.$t('Shell.Home.Customize').toString()
    }
}
</script>

<style scoped>
.shell-home-menu {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 220px;
    min-width: 0;
    padding: 6px 0;
    border: 0;
    background: none;
    color: var(--shell-muted);
    font: 500 14px var(--shell-font);
    cursor: pointer;
}

.shell-home-menu:hover,
.shell-home-menu[aria-expanded='true'] {
    color: var(--shell-text);
}

.shell-home-menu:focus-visible {
    outline: 2px solid var(--shell-accent);
    outline-offset: 2px;
}

.shell-home-menu .v-icon {
    color: inherit;
}
</style>
