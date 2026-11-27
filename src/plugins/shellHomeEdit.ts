import Vue from 'vue'
import type { HomeLayoutState } from '@/plugins/shellHomeLayout'

export const shellHomeEdit = Vue.observable({
    editing: false,
    state: 'idle' as HomeLayoutState,
})

export const startShellHomeEdit = (state: HomeLayoutState): void => {
    shellHomeEdit.state = state
    shellHomeEdit.editing = true
}

export const stopShellHomeEdit = (): void => {
    shellHomeEdit.editing = false
}
