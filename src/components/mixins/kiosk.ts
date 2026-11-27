import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { hasPin, KioskAction, KioskSettings } from '@/plugins/kiosk'
import { askKioskPin, authorizeKiosk } from '@/plugins/kioskGuard'
import { kioskModeFor, setKioskDeviceMode } from '@/plugins/kioskSession'

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

    kioskAuthorize(action: KioskAction): Promise<boolean> {
        return Promise.resolve(authorizeKiosk([action]))
    }

    async leaveKiosk(): Promise<boolean> {
        if (this.kioskHasPin && !(await askKioskPin('exit'))) return false

        setKioskDeviceMode('off')
        return true
    }
}
