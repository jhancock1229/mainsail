<template>
    <div class="kiosk-pin-pad" tabindex="0" @keydown="onKeydown">
        <div class="kiosk-pin-pad__dots d-flex justify-center align-center mb-2" :aria-label="dotsLabel">
            <span
                v-for="index in dotCount"
                :key="index"
                class="kiosk-pin-pad__dot"
                :class="{ 'kiosk-pin-pad__dot--filled': index <= entered.length }"></span>
        </div>
        <div class="kiosk-pin-pad__message text-center text-body-2 mb-2" :class="{ 'error--text': !!error }">
            {{ error || hint }}
        </div>
        <div class="kiosk-pin-pad__keys">
            <v-btn
                v-for="digit in digits"
                :key="digit"
                depressed
                class="kiosk-pin-pad__key"
                :class="{ 'kiosk-pin-pad__key--zero': digit === '0' }"
                :data-key="digit"
                :disabled="disabled"
                @click="press(digit)">
                {{ digit }}
            </v-btn>
            <v-btn
                depressed
                class="kiosk-pin-pad__key kiosk-pin-pad__key--back"
                data-key="back"
                :aria-label="$t('Kiosk.Pin.Backspace')"
                :disabled="disabled || entered.length === 0"
                @click="backspace">
                <v-icon>{{ mdiBackspaceOutline }}</v-icon>
            </v-btn>
            <v-btn
                depressed
                color="primary"
                class="kiosk-pin-pad__key kiosk-pin-pad__key--ok"
                data-key="ok"
                :aria-label="$t('Kiosk.Pin.Confirm')"
                :disabled="disabled || !complete"
                @click="submit">
                <v-icon>{{ mdiCheck }}</v-icon>
            </v-btn>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Prop } from 'vue-property-decorator'
import { mdiBackspaceOutline, mdiCheck } from '@mdi/js'
import { isValidPinFormat, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/plugins/kiosk'

@Component
export default class KioskPinPad extends Vue {
    @Prop({ type: String, required: false, default: '' }) readonly error!: string
    @Prop({ type: String, required: false, default: '' }) readonly hint!: string
    @Prop({ type: Boolean, required: false, default: false }) readonly disabled!: boolean

    mdiBackspaceOutline = mdiBackspaceOutline
    mdiCheck = mdiCheck

    digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
    entered = ''

    get dotCount(): number {
        return Math.max(PIN_MIN_LENGTH, this.entered.length)
    }

    get dotsLabel(): string {
        return this.$t('Kiosk.Pin.DigitsEntered', { count: this.entered.length }).toString()
    }

    get complete(): boolean {
        return isValidPinFormat(this.entered)
    }

    mounted(): void {
        ;(this.$el as HTMLElement).focus({ preventScroll: true })
    }

    press(digit: string): void {
        if (this.disabled || this.entered.length >= PIN_MAX_LENGTH) return

        this.entered += digit
        this.$emit('input')
    }

    backspace(): void {
        this.entered = this.entered.slice(0, -1)
        this.$emit('input')
    }

    clear(): void {
        this.entered = ''
    }

    submit(): void {
        if (this.disabled || !this.complete) return

        this.$emit('submit', this.entered)
    }

    onKeydown(event: KeyboardEvent): void {
        if (/^\d$/.test(event.key)) this.press(event.key)
        else if (event.key === 'Backspace') this.backspace()
        else if (event.key === 'Enter') this.submit()
        else return

        event.preventDefault()
    }
}
</script>

<style scoped>
.kiosk-pin-pad {
    outline: none;
}

.kiosk-pin-pad__dots {
    height: 28px;
    gap: 12px;
}

.kiosk-pin-pad__dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid currentColor;
    opacity: 0.45;
    transition:
        background-color 0.12s,
        opacity 0.12s;
}

.kiosk-pin-pad__dot--filled {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    opacity: 1;
}

.kiosk-pin-pad__message {
    min-height: 20px;
}

.kiosk-pin-pad__keys {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.kiosk-pin-pad__key {
    height: 60px !important;
    min-width: 0 !important;
    font-size: 1.4rem;
    border-radius: 12px;
}

.kiosk-pin-pad__key--back {
    grid-column: 1;
    grid-row: 4;
}

.kiosk-pin-pad__key--zero {
    grid-column: 2;
    grid-row: 4;
}

.kiosk-pin-pad__key--ok {
    grid-column: 3;
    grid-row: 4;
}

@media (max-height: 520px) {
    .kiosk-pin-pad__key {
        height: 46px !important;
    }
}
</style>
