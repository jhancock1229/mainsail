<template>
    <v-dialog :value="open" max-width="340" persistent scrollable content-class="kiosk-pin-dialog">
        <v-card v-if="open">
            <v-card-title class="text-subtitle-1 font-weight-medium d-flex flex-nowrap align-start pb-1">
                <v-icon left class="mt-1">{{ mdiLockOutline }}</v-icon>
                <span class="kiosk-pin-dialog__title">{{ title }}</span>
            </v-card-title>
            <v-card-text class="pb-2">
                <kiosk-pin-pad
                    ref="pad"
                    :error="message"
                    :hint="$t('Kiosk.Pin.EnterHint')"
                    :disabled="lockoutSeconds > 0"
                    @input="wrong = false"
                    @submit="submit" />
                <div class="text-center mt-3">
                    <a class="kiosk-pin-dialog__forgot text-body-2" role="button" @click="showRecovery = !showRecovery">
                        {{ $t('Kiosk.Pin.Forgot') }}
                    </a>
                </div>
                <v-expand-transition>
                    <div v-if="showRecovery" class="kiosk-pin-dialog__recovery text-body-2 mt-2">
                        <template v-if="kioskActive">
                            <p class="mb-2">{{ $t('Kiosk.Pin.RecoveryOtherDevice') }}</p>
                            <p class="mb-2">{{ $t('Kiosk.Pin.RecoveryThisDevice') }}</p>
                        </template>
                        <template v-else>
                            <p class="mb-2">{{ $t('Kiosk.Pin.RecoveryReset') }}</p>
                            <v-btn block outlined color="warning" class="kiosk-pin-dialog__reset mb-2" @click="reset">
                                {{ $t('Kiosk.Pin.ResetPin') }}
                            </v-btn>
                        </template>
                        <p class="mb-0 text--secondary">{{ $t('Kiosk.Pin.Honesty') }}</p>
                    </div>
                </v-expand-transition>
            </v-card-text>
            <v-card-actions class="pt-0">
                <v-btn block text large class="kiosk-pin-dialog__cancel" @click="cancel">
                    {{ $t('Buttons.Cancel') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref, Watch } from 'vue-property-decorator'
import { mdiLockOutline } from '@mdi/js'
import KioskMixin from '@/components/mixins/kiosk'
import KioskPinPad from '@/components/kiosk/KioskPinPad.vue'
import { kioskPinLockout, kioskSession, settleKioskPin, submitKioskPin } from '@/plugins/kioskSession'

const MS_PER_SECOND = 1000

@Component({
    components: { KioskPinPad },
})
export default class KioskPinDialog extends Mixins(KioskMixin) {
    @Ref() readonly pad!: KioskPinPad

    mdiLockOutline = mdiLockOutline

    wrong = false
    showRecovery = false
    now = Date.now()
    clock: number | null = null

    get open(): boolean {
        return kioskSession.pinReason !== null
    }

    get title(): string {
        return this.$t(`Kiosk.Pin.Reasons.${kioskSession.pinReason}`).toString()
    }

    get lockoutSeconds(): number {
        return Math.ceil(kioskPinLockout(this.now) / MS_PER_SECOND)
    }

    get message(): string {
        if (this.lockoutSeconds > 0) return this.$t('Kiosk.Pin.Locked', { seconds: this.lockoutSeconds }).toString()
        if (this.wrong) return this.$t('Kiosk.Pin.Wrong').toString()

        return ''
    }

    @Watch('open', { immediate: true })
    onOpenChanged(open: boolean): void {
        this.wrong = false
        this.showRecovery = false
        this.stopClock()
        if (!open) return

        this.now = Date.now()
        this.clock = window.setInterval(() => (this.now = Date.now()), MS_PER_SECOND)
    }

    beforeDestroy(): void {
        this.stopClock()
    }

    stopClock(): void {
        if (this.clock !== null) window.clearInterval(this.clock)
        this.clock = null
    }

    submit(pin: string): void {
        this.now = Date.now()
        if (submitKioskPin(pin, this.kioskSettings, this.now)) {
            settleKioskPin(true)
            return
        }

        this.wrong = true
        this.pad?.clear()
    }

    cancel(): void {
        settleKioskPin(false)
    }

    reset(): void {
        this.$store.dispatch('gui/removeKioskPin')
        settleKioskPin(true)
    }
}
</script>

<style scoped>
.kiosk-pin-dialog__title {
    word-break: normal;
    line-height: 1.4;
}

.kiosk-pin-dialog__forgot {
    text-decoration: underline;
}
</style>
