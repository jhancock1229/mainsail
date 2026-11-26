<template>
    <div>
        <template v-if="kioskActive">
            <kiosk-bottom-bar @more="showMore = true" />
            <kiosk-more-sheet v-model="showMore" />
        </template>
        <kiosk-suggestion v-else-if="kioskMode.suggest" />
        <kiosk-pin-dialog />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import { NavigationGuardNext, Route } from 'vue-router'
import KioskMixin from '@/components/mixins/kiosk'
import KioskBottomBar from '@/components/kiosk/KioskBottomBar.vue'
import KioskMoreSheet from '@/components/kiosk/KioskMoreSheet.vue'
import KioskPinDialog from '@/components/kiosk/KioskPinDialog.vue'
import KioskSuggestion from '@/components/kiosk/KioskSuggestion.vue'
import { classifyRequest, KIOSK_CONFIG_PAGE, parseKioskUrlParam, routeRule } from '@/plugins/kiosk'
import {
    authorizeKioskAction,
    kioskSession,
    requestKioskPin,
    setKioskDeviceMode,
    updateKioskScreen,
} from '@/plugins/kioskSession'

@Component({
    components: { KioskBottomBar, KioskMoreSheet, KioskPinDialog, KioskSuggestion },
})
export default class TheKiosk extends Mixins(KioskMixin) {
    showMore = false
    removeRouteGuard: (() => void) | null = null
    unlockedRoute: string | null = null

    get currentRouteRule(): string {
        return this.kioskActive ? routeRule(this.$route.name, this.kioskSettings) : 'allow'
    }

    @Watch('currentRouteRule', { immediate: true })
    onCurrentRouteRuleChanged(rule: string): void {
        if (rule === 'allow') return
        if (rule === 'pin' && this.unlockedRoute === this.$route.name) return

        this.$router.replace('/')
    }

    @Watch('kioskActive')
    onKioskActiveChanged(): void {
        this.showMore = false
    }

    mounted(): void {
        updateKioskScreen()
        window.addEventListener('resize', updateKioskScreen)
        this.$socket.setRequestGuard(this.guardRequest)
        this.removeRouteGuard = this.$router.beforeEach(this.guardRoute)
        this.applyUrlParameter()
    }

    beforeDestroy(): void {
        window.removeEventListener('resize', updateKioskScreen)
        this.$socket.setRequestGuard(null)
        this.removeRouteGuard?.()
    }

    applyUrlParameter(): void {
        if (kioskSession.urlParameterApplied) return
        kioskSession.urlParameterApplied = true

        const requested = parseKioskUrlParam(window.location.search)
        if (requested === 'on') setKioskDeviceMode('on')
        else if (requested === 'off' && this.kioskActive) this.leaveKiosk()
        else if (requested === 'off' && kioskSession.deviceMode === null) setKioskDeviceMode('off')
    }

    guardRequest(method: string, params: unknown): true | Promise<boolean> {
        if (!this.kioskActive) return true

        const action = classifyRequest(method, params)
        if (action === null) return true

        return authorizeKioskAction(action, this.kioskSettings, this.kioskBlocked)
    }

    async guardRoute(to: Route, from: Route, next: NavigationGuardNext): Promise<void> {
        const rule = this.kioskActive ? routeRule(to.name, this.kioskSettings) : 'allow'
        if (to.name !== this.unlockedRoute) this.unlockedRoute = null
        if (rule === 'allow') return next()

        const stay = (): void => next(from.name ? false : '/')
        if (rule === 'block') {
            if (to.name === KIOSK_CONFIG_PAGE) this.kioskBlocked('configEdit')
            return stay()
        }

        if (!(await requestKioskPin('configEdit'))) return stay()

        this.unlockedRoute = to.name ?? null
        next()
    }
}
</script>

<style>
@import '../assets/styles/kiosk.css';
</style>
