import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { hasPin, KioskAction, KioskSettings } from '@/plugins/kiosk'
import { authorizeKioskAction, kioskModeFor, requestKioskPin, setKioskDeviceMode } from '@/plugins/kioskSession'

export interface KioskPage {
    name: string
    path: string
    icon: string
    title: string
}

@Component
export default class KioskMixin extends Mixins(BaseMixin) {
    get kioskSettings(): KioskSettings {
        return this.$store.getters['gui/getKioskSettings']
    }

    get kioskMode(): { active: boolean; suggest: boolean } {
        return kioskModeFor(this.kioskSettings)
    }

    get kioskActive(): boolean {
        return this.kioskMode.active
    }

    get kioskHasPin(): boolean {
        return hasPin(this.kioskSettings.pin)
    }

    kioskBlocked(action: KioskAction): void {
        const name = this.$t(`Kiosk.Actions.${action}`).toString()
        this.$toast.error(this.$t('Kiosk.Blocked', { action: name }).toString())
    }

    kioskAuthorize(action: KioskAction): Promise<boolean> {
        if (!this.kioskActive) return Promise.resolve(true)

        return Promise.resolve(authorizeKioskAction(action, this.kioskSettings, this.kioskBlocked))
    }

    async leaveKiosk(): Promise<boolean> {
        if (this.kioskHasPin && !(await requestKioskPin('exit'))) return false

        setKioskDeviceMode('off')
        return true
    }
}
