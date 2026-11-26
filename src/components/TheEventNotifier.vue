<script lang="ts">
import { CreateElement, VNode } from 'vue'
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import EventNotificationsMixin from '@/components/mixins/eventNotifications'
import { explainError, isKlipperFault, settledKlipperMessage } from '@/plugins/errorExplainer'
import {
    PrinterEvent,
    PrinterEventName,
    PrinterSnapshot,
    buildPrinterSnapshot,
    detectPrinterEvents,
    dropFollowUpEvents,
    filamentSensorLabel,
    isEventStillCurrent,
    partitionPendingEvents,
} from '@/plugins/printerEvents'

// These events are told after a short delay, if they still hold then (see isEventStillCurrent): a failed
// print is often followed by the Klipper shutdown that caused it, and a pause can be a timelapse frame.
const DELAYED_EVENTS: PrinterEventName[] = ['printFailed', 'printPaused']
const SETTLE_DELAY_MS = 1500
interface PendingEvent {
    event: PrinterEvent
    timer: number
}

// Klipper's message arrives a moment after the state
const KLIPPER_MESSAGE_POLL_MS = 250
const KLIPPER_MESSAGE_MAX_WAIT_MS = 5000

// Watches the printer state and tells the user about events, according to the notification rules.
// It is only mounted while the GUI is connected and initialized: the state it sees first is the baseline.
@Component
export default class TheEventNotifier extends Mixins(EventNotificationsMixin) {
    previousSnapshot: PrinterSnapshot | null = null
    // when the events were last told (only events with at least one channel)
    lastFired: Partial<Record<PrinterEventName, number>> = {}
    timers: number[] = []
    // delayed events that wait for their confirmation
    pending: PendingEvent[] = []

    get snapshot(): PrinterSnapshot {
        return buildPrinterSnapshot(this.klipperState, this.$store.state.printer)
    }

    get klipperMessage(): string | null {
        return settledKlipperMessage(this.$store.state.server.klippy_message)
    }

    get filename(): string {
        return this.$store.state.printer.print_stats?.filename ?? ''
    }

    @Watch('snapshot', { immediate: true })
    snapshotChanged(current: PrinterSnapshot): void {
        const detected = detectPrinterEvents(this.previousSnapshot, current)
        this.previousSnapshot = current

        // a pending event whose state ended is obsolete, also when the same state comes back later
        const { kept, cancelled } = partitionPendingEvents(this.pending, current)
        cancelled.forEach((entry) => window.clearTimeout(entry.timer))
        this.pending = kept

        // a silent event must not hide the events that follow from it
        const audible = detected.filter((event) => this.getEventChannels(event.name).length > 0)
        const now = Date.now()
        const events = dropFollowUpEvents(audible, this.lastFired, now)

        events.forEach((event) => {
            this.lastFired[event.name] = now

            if (DELAYED_EVENTS.includes(event.name)) this.delayEvent(event)
            else this.tellEvent(event)
        })
    }

    beforeDestroy(): void {
        this.timers.forEach((timer) => window.clearTimeout(timer))
    }

    render(h: CreateElement): VNode {
        return h()
    }

    delayEvent(event: PrinterEvent): void {
        const entry: PendingEvent = { event, timer: 0 }
        entry.timer = this.later(SETTLE_DELAY_MS, () => {
            this.pending = this.pending.filter((other) => other !== entry)
            this.confirmEvent(event)
        })
        this.pending.push(entry)
    }

    confirmEvent(event: PrinterEvent): void {
        if (!isEventStillCurrent(event.name, this.snapshot)) return
        // its cause may have been told in the meantime, e.g. the Klipper shutdown that failed the print
        if (dropFollowUpEvents([event], this.lastFired, Date.now()).length === 0) return

        this.tellEvent(event)
    }

    tellEvent(event: PrinterEvent): void {
        switch (event.name) {
            case 'klipperError':
                this.tellKlipperError(0)
                break

            case 'printFailed':
                this.sendEventNotification(event.name, [
                    this.filename,
                    this.explainInOneLine(this.printFailedMessage()),
                ])
                break

            case 'filamentRunout':
                this.sendEventNotification(event.name, [
                    this.$t('App.PrinterEvents.Sensor', { sensor: filamentSensorLabel(event.sensor ?? '') }).toString(),
                ])
                break

            default:
                this.sendEventNotification(event.name, [this.filename])
        }
    }

    tellKlipperError(waited: number): void {
        if (!isKlipperFault(this.klipperState)) return

        if (this.klipperMessage === null && waited < KLIPPER_MESSAGE_MAX_WAIT_MS) {
            this.later(KLIPPER_MESSAGE_POLL_MS, () => this.tellKlipperError(waited + KLIPPER_MESSAGE_POLL_MS))
            return
        }

        this.sendEventNotification('klipperError', [this.explainInOneLine(this.klipperMessage)])
    }

    // the message of the print, or of Klipper when it stopped the print before the print got a message
    printFailedMessage(): string | null {
        const message: string = this.$store.state.printer.print_stats?.message ?? ''

        return message.trim() !== '' ? message : this.klipperMessage
    }

    explainInOneLine(message: string | null): string {
        const explanation = explainError(message, { klipperState: this.klipperState })
        if (explanation === null) return ''
        if (!explanation.known) return explanation.summary

        return this.$t(`ErrorExplainer.Errors.${explanation.id}.Title`, explanation.params).toString()
    }

    later(delay: number, callback: () => void): number {
        const timer = window.setTimeout(callback, delay)
        this.timers.push(timer)

        return timer
    }
}
</script>
