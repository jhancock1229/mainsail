import Vue from 'vue'

export type ShellHomeView = 'camera' | 'console'

export const shellCompactState = Vue.observable({
    homeView: null as ShellHomeView | null,
})
