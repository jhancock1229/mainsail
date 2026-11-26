<script lang="ts">
import { CreateElement, VNode } from 'vue'
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import EventNotificationsMixin from '@/components/mixins/eventNotifications'
import { explainError, isKlipperFault, placeholderMessages } from '@/plugins/errorExplainer'
import {
    PrinterEvent,
    PrinterEventName,
    PrinterSnapshot,
    buildPrinterSnapshot,
    detectPrinterEvents,
    dropFollowUpEvents,
} from '@/plugins/printerEvents'

// a failed print is often followed by a Klipper shutdown, which is then reported instead
const PRINT_FAILED_DELAY_MS = 1500
// Klipper's message arrives a moment after the state
const KLIPPER_MESSAGE_POLL_MS = 250
const KLIPPER_MESSAGE_MAX_WAIT_MS = 5000

// Watches the printer state and tells the user about events, according to the notification rules.
// It is only mounted while the GUI is connected and initialized: the state it sees first is the baseline.
@Component
export default class TheEventNotifier extends Mixins(EventNotificationsMixin) {
    previousSnapshot: PrinterSnapshot | null = null
    lastFired: Partial<Record<PrinterEventName, number>> = {}
    timers: number[] = []

    get snapshot(): PrinterSnapshot {
        return buildPrinterSnapshot(this.klipperState, this.$store.state.printer)
    }

    get klipperMessage(): string | null {
        const message = this.$store.state.server.klippy_message ?? null
        if (message === null || placeholderMessages.includes(message)) return null

        return message
    }

    get filename(): string {
        return this.$store.state.printer.print_stats?.filename ?? ''
    }

    @Watch('snapshot', { immediate: true })
    snapshotChanged(current: PrinterSnapshot): void {
        const detected = detectPrinterEvents(this.previousSnapshot, current)
        this.previousSnapshot = current

        // a silent event must not hide the events that follow from it
        const audible = detected.filter((event) => this.getEventChannels(event.name).length > 0)
        const now = Date.now()
        const events = dropFollowUpEvents(audible, this.lastFired, now)

        events.forEach((event) => {
            this.lastFired[event.name] = now
            this.handleEvent(event)
        })
    }

    beforeDestroy(): void {
        this.timers.forEach((timer) => window.clearTimeout(timer))
    }

    render(h: CreateElement): VNode {
        return h()
    }

    handleEvent(event: PrinterEvent): void {
        switch (event.name) {
            case 'printFailed':
                this.later(PRINT_FAILED_DELAY_MS, () => this.notifyPrintFailed())
                break

            case 'klipperError':
                this.notifyKlipperError(0)
                break

            case 'filamentRunout':
                this.sendEventNotification(event.name, [
                    this.$t('App.PrinterEvents.Sensor', { sensor: event.sensor ?? '' }).toString(),
                ])
                break

            default:
                this.sendEventNotification(event.name, [this.filename])
        }
    }

    notifyPrintFailed(): void {
        if (isKlipperFault(this.klipperState)) return

        const message = this.$store.state.printer.print_stats?.message ?? ''
        this.sendEventNotification('printFailed', [this.filename, this.explainInOneLine(message)])
    }

    notifyKlipperError(waited: number): void {
        if (!isKlipperFault(this.klipperState)) return

        if (this.klipperMessage === null && waited < KLIPPER_MESSAGE_MAX_WAIT_MS) {
            this.later(KLIPPER_MESSAGE_POLL_MS, () => this.notifyKlipperError(waited + KLIPPER_MESSAGE_POLL_MS))
            return
        }

        this.sendEventNotification('klipperError', [this.explainInOneLine(this.klipperMessage)])
    }

    explainInOneLine(message: string | null): string {
        const explanation = explainError(message, { klipperState: this.klipperState })
        if (explanation === null) return ''
        if (!explanation.known) return explanation.summary

        return this.$t(`ErrorExplainer.Errors.${explanation.id}.Title`, explanation.params).toString()
    }

    later(delay: number, callback: () => void): void {
        this.timers.push(window.setTimeout(callback, delay))
    }
}
</script>
