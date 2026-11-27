<template>
    <div>
        <template v-if="classicShell">
            <template v-if="kioskActive">
                <kiosk-bottom-bar @more="showMore = true" />
                <kiosk-more-sheet v-model="showMore" />
            </template>
            <kiosk-suggestion v-else-if="kioskMode.suggest" />
        </template>
        <kiosk-pin-dialog />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import { NavigationGuardNext, Route } from 'vue-router'
import KioskMixin from '@/components/mixins/kiosk'
import ShellMixin from '@/components/mixins/shell'
import KioskBottomBar from '@/components/kiosk/KioskBottomBar.vue'
import KioskMoreSheet from '@/components/kiosk/KioskMoreSheet.vue'
import KioskPinDialog from '@/components/kiosk/KioskPinDialog.vue'
import KioskSuggestion from '@/components/kiosk/KioskSuggestion.vue'
import {
    classifyRequest,
    KioskAction,
    KioskActionRule,
    parseKioskUrlParam,
    routeRule,
    shellLocationRule,
    shellLockKey,
} from '@/plugins/kiosk'
import { resolveInterfaceShell, resolveShellLocation } from '@/plugins/shellNavigation'
import {
    authorizeKioskAction,
    kioskSession,
    requestKioskPin,
    setKioskDeviceMode,
    updateKioskScreen,
} from '@/plugins/kioskSession'

interface RouteGate {
    rule: KioskActionRule
    key: string | null
    action: KioskAction | null
}

const CLASSIC_CONFIG_ROUTE = 'machine'
const SHELL_ACTIONS: Record<string, KioskAction> = { settings: 'settings', 'machine/config': 'configEdit' }

@Component({
    components: { KioskBottomBar, KioskMoreSheet, KioskPinDialog, KioskSuggestion },
})
export default class TheKiosk extends Mixins(KioskMixin, ShellMixin) {
    showMore = false
    removeRouteGuard: (() => void) | null = null
    unlockedKey: string | null = null
    allowedPath: string | null = null

    get classicShell(): boolean {
        return resolveInterfaceShell(this.$store.state.gui.uiSettings.interfaceShell) === 'classic'
    }

    get currentGate(): RouteGate {
        return this.gateFor(this.$route)
    }

    @Watch('currentGate', { immediate: true })
    onCurrentGateChanged(gate: RouteGate): void {
        if (gate.rule === 'allow') {
            this.allowedPath = this.$route.path
            return
        }
        if (gate.rule === 'pin' && this.allowedPath === this.$route.path) this.unlockedKey = gate.key
        if (gate.rule === 'pin' && this.unlockedKey === gate.key) return

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

    gateFor(route: Route): RouteGate {
        const open: RouteGate = { rule: 'allow', key: null, action: null }
        if (!this.kioskActive) return open

        if (this.classicShell) {
            const rule = routeRule(route.name, this.kioskSettings)

            return { rule, key: route.name ?? null, action: route.name === CLASSIC_CONFIG_ROUTE ? 'configEdit' : null }
        }

        const location = resolveShellLocation(route.path, this.shellAvailability)
        const action = SHELL_ACTIONS[shellLockKey(location)] ?? null

        return { rule: shellLocationRule(location, this.kioskSettings), key: shellLockKey(location), action }
    }

    async guardRoute(to: Route, from: Route, next: NavigationGuardNext): Promise<void> {
        const gate = this.gateFor(to)
        const unlocked = gate.rule === 'pin' && gate.key === this.unlockedKey
        if (!unlocked) this.unlockedKey = null
        if (gate.rule === 'allow' || unlocked) return next()

        const stay = (): void => next(from.matched.length ? false : '/')
        if (gate.rule === 'block') {
            if (gate.action !== null) this.kioskBlocked(gate.action)
            return stay()
        }

        if (!(await requestKioskPin(gate.action ?? 'configEdit'))) return stay()

        this.unlockedKey = gate.key
        next()
    }
}
</script>

<style>
@import '../assets/styles/kiosk.css';
</style>
