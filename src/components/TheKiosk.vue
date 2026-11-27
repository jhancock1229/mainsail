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
    KioskAction,
    KioskActionRule,
    parseKioskUrlParam,
    routeRule,
    shellLocationRule,
    shellLockKey,
} from '@/plugins/kiosk'
import { resolveInterfaceShell, resolveShellLocation } from '@/plugins/shellNavigation'
import { askKioskPin, notifyKioskBlocked } from '@/plugins/kioskGuard'
import {
    kioskSession,
    requestKioskPin,
    setKioskDeviceMode,
    setKioskGrant,
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
    destroyed = false

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
        if (gate.rule === 'block') {
            this.lock()
            this.$router.replace('/')
            return
        }
        if (this.unlockedKey === gate.key) return
        if (kioskSession.localChange && this.allowedPath === this.$route.path) {
            this.unlock(gate)
            return
        }

        this.askAgain(gate)
    }

    @Watch('kioskActive')
    onKioskActiveChanged(): void {
        this.showMore = false
    }

    mounted(): void {
        updateKioskScreen()
        window.addEventListener('resize', updateKioskScreen)
        this.removeRouteGuard = this.$router.beforeEach(this.guardRoute)
        this.applyUrlParameter()
    }

    beforeDestroy(): void {
        this.destroyed = true
        window.removeEventListener('resize', updateKioskScreen)
        this.removeRouteGuard?.()
        this.lock()
    }

    applyUrlParameter(): void {
        if (!kioskSession.urlParameterApplied) {
            kioskSession.urlParameterApplied = true

            const requested = parseKioskUrlParam(window.location.search)
            if (requested === 'on') setKioskDeviceMode('on')
            else if (requested === 'off' && this.kioskActive) kioskSession.urlLeavePending = true
            else if (requested === 'off' && kioskSession.deviceMode === null) setKioskDeviceMode('off')
        }

        if (kioskSession.urlLeavePending) this.leaveAsTheUrlAsks()
    }

    async leaveAsTheUrlAsks(): Promise<void> {
        await this.leaveKiosk()
        if (!this.destroyed) kioskSession.urlLeavePending = false
    }

    unlock(gate: RouteGate): void {
        this.unlockedKey = gate.key
        setKioskGrant('route', gate.action)
    }

    lock(): void {
        this.unlockedKey = null
        setKioskGrant('route', null)
    }

    async askAgain(gate: RouteGate): Promise<void> {
        const allowed = await requestKioskPin(gate.action ?? 'configEdit')
        if (this.destroyed) return

        const current = this.currentGate
        if (allowed && current.key === gate.key) this.unlock(gate)
        else if (current.rule !== 'allow' && current.key !== this.unlockedKey) this.$router.replace('/')
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
        if (!unlocked) this.lock()
        if (gate.rule === 'allow' || unlocked) return next()

        const stay = (): void => next(from.matched.length ? false : '/')
        if (gate.rule === 'block') {
            if (gate.action !== null) notifyKioskBlocked(gate.action)
            return stay()
        }

        if (!(await askKioskPin(gate.action ?? 'configEdit'))) return stay()

        this.unlock(gate)
        next()
    }
}
</script>

<style>
@import '../assets/styles/kiosk.css';
</style>
