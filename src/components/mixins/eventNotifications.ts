import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    AlertSettings,
    BrowserNotificationStatus,
    NotificationChannel,
    escapeHtml,
    getBrowserNotificationStatus,
    resolveAlertSettings,
    resolveChannels,
} from '@/plugins/notificationRules'
import { playNotificationSound } from '@/plugins/notificationSound'
import { PrinterEventName, PrinterEventSeverity, printerEventSeverities } from '@/plugins/printerEvents'

// errors stay long enough to be read, hovering a toast pauses its timer
const TOAST_DURATIONS: Record<PrinterEventSeverity, number> = {
    info: 5000,
    success: 6000,
    warning: 9000,
    error: 12000,
}

@Component
export default class EventNotificationsMixin extends Mixins(BaseMixin) {
    get alertSettings(): AlertSettings {
        return resolveAlertSettings(this.$store.state.gui.alerts)
    }

    // a method, because the permission of the browser is not reactive
    readBrowserNotificationStatus(): BrowserNotificationStatus {
        const hasApi = 'Notification' in window

        return getBrowserNotificationStatus({
            hasApi,
            secureContext: window.isSecureContext,
            permission: hasApi ? Notification.permission : '',
        })
    }

    getEventChannels(name: PrinterEventName): NotificationChannel[] {
        return resolveChannels(this.alertSettings, name, this.readBrowserNotificationStatus())
    }

    sendEventNotification(name: PrinterEventName, lines: string[]): void {
        const channels = this.getEventChannels(name)
        if (channels.length === 0) return

        const title = this.$t(`App.PrinterEvents.Events.${name}.Title`).toString()
        const text = lines.filter((line) => line !== '')
        const severity = printerEventSeverities[name]

        let toast = channels.includes('toast')
        // a notification the browser refuses to show becomes a toast, so the event does not get lost
        if (channels.includes('browser') && !this.showBrowserNotification(name, title, text)) toast = true
        if (toast) this.showEventToast(severity, title, text)
        if (channels.includes('sound')) playNotificationSound(severity)
    }

    showEventToast(severity: PrinterEventSeverity, title: string, lines: string[]): void {
        const message = [`<strong>${escapeHtml(title)}</strong>`, ...lines.map(escapeHtml)].join('<br />')

        this.$toast.open({
            message,
            type: severity,
            duration: TOAST_DURATIONS[severity],
            onClick: () => {
                // the explanation of an error is on the dashboard
                if (severity === 'error' && this.$route.path !== '/') this.$router.push('/')
            },
        })
    }

    showBrowserNotification(name: PrinterEventName, title: string, lines: string[]): boolean {
        const printerName = this.$store.state.gui.general.printername ?? ''

        try {
            // the tag makes a new notification replace an older one of the same kind
            const notification = new Notification(printerName !== '' ? `${printerName}: ${title}` : title, {
                body: lines.join('\n'),
                tag: `mainsail-${name}`,
                icon: 'img/icons/icon-192.png',
            })
            notification.onclick = () => {
                window.focus()
                notification.close()
            }

            return true
        } catch {
            // e.g. Chrome on Android only allows notifications from a service worker
            return false
        }
    }
}
