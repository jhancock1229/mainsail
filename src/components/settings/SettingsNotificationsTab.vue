<template>
    <div>
        <v-card flat>
            <v-card-text>
                <settings-row
                    :title="$t('Settings.NotificationsTab.NotifyEnabled')"
                    :sub-title="$t('Settings.NotificationsTab.NotifyEnabledDescription')"
                    :dynamic-slot-width="true">
                    <v-switch v-model="notifyEnabled" hide-details class="mt-0" data-setting="notifyEnabled" />
                </settings-row>
                <v-alert
                    v-if="browserHint"
                    dense
                    text
                    color="info"
                    class="notification-rules__hint text-body-2 mt-3 mb-1"
                    :icon="mdiInformationOutline">
                    <div class="d-flex flex-wrap align-center">
                        <span class="flex-grow-1">{{ browserHint }}</span>
                        <v-btn
                            v-if="browserStatus === 'default'"
                            small
                            outlined
                            color="info"
                            class="ml-auto mt-1"
                            data-action="allowBrowser"
                            @click="requestBrowserPermission">
                            {{ $t('Settings.NotificationsTab.AllowBrowser') }}
                        </v-btn>
                    </div>
                </v-alert>
                <v-simple-table
                    class="notification-rules mt-2"
                    :class="{ 'notification-rules--disabled': !notifyEnabled }">
                    <thead>
                        <tr>
                            <th class="pl-0">{{ $t('Settings.NotificationsTab.Event') }}</th>
                            <th
                                v-for="channel in channels"
                                :key="channel.name"
                                class="notification-rules__channel text-center px-1"
                                :title="channel.description">
                                <v-icon small class="d-block mx-auto">{{ channel.icon }}</v-icon>
                                {{ channel.title }}
                            </th>
                            <th class="notification-rules__channel text-center px-1">
                                {{ $t('Settings.NotificationsTab.Test') }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="event in events" :key="event.name" :data-event="event.name">
                            <td class="pl-0 py-2">
                                <div class="d-flex align-center">
                                    <v-icon :color="event.color" class="mr-3 d-none d-sm-flex">{{ event.icon }}</v-icon>
                                    <div>
                                        <div class="notification-rules__title d-flex flex-wrap align-center">
                                            <span class="font-weight-bold mr-2">{{ event.title }}</span>
                                            <v-chip v-if="event.silent" x-small label outlined class="px-1">
                                                <v-icon x-small left class="mr-1">{{ mdiBellOffOutline }}</v-icon>
                                                {{ $t('Settings.NotificationsTab.Silent') }}
                                            </v-chip>
                                        </div>
                                        <div class="notification-rules__description">{{ event.description }}</div>
                                    </div>
                                </div>
                            </td>
                            <td
                                v-for="channel in channels"
                                :key="channel.name"
                                class="text-center px-1"
                                :data-channel="channel.name">
                                <v-checkbox
                                    :input-value="event.rule[channel.name]"
                                    :disabled="!notifyEnabled"
                                    :aria-label="`${event.title}: ${channel.description}`"
                                    hide-details
                                    class="d-inline-flex ma-0 pa-0"
                                    @change="setChannel(event.name, channel.name, $event)" />
                            </td>
                            <td class="text-center px-1">
                                <v-btn
                                    icon
                                    small
                                    :disabled="!notifyEnabled || event.silent"
                                    :title="$t('Settings.NotificationsTab.TestDescription')"
                                    :aria-label="`${event.title}: ${$t('Settings.NotificationsTab.TestDescription')}`"
                                    data-action="test"
                                    @click="testEvent(event.name)">
                                    <v-icon>{{ mdiPlay }}</v-icon>
                                </v-btn>
                            </td>
                        </tr>
                    </tbody>
                </v-simple-table>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.NotificationsTab.ExplainErrors')"
                    :sub-title="$t('Settings.NotificationsTab.ExplainErrorsDescription')"
                    :dynamic-slot-width="true">
                    <v-switch v-model="explainErrors" hide-details class="mt-0" data-setting="explainErrors" />
                </settings-row>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import EventNotificationsMixin from '@/components/mixins/eventNotifications'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import {
    BrowserNotificationStatus,
    NotificationChannel,
    NotificationRule,
    notificationChannels,
} from '@/plugins/notificationRules'
import { PrinterEventName, printerEventNames, printerEventSeverities } from '@/plugins/printerEvents'
import {
    mdiAlertCircleOutline,
    mdiAlertOctagonOutline,
    mdiBellOffOutline,
    mdiBellRingOutline,
    mdiCheckCircleOutline,
    mdiInformationOutline,
    mdiMessageTextOutline,
    mdiPauseCircleOutline,
    mdiPlay,
    mdiPlayCircleOutline,
    mdiPrinter3dNozzleAlertOutline,
    mdiVolumeHigh,
} from '@mdi/js'

interface ChannelColumn {
    name: NotificationChannel
    icon: string
    title: string
    description: string
}

interface EventRow {
    name: PrinterEventName
    icon: string
    color: string
    title: string
    description: string
    rule: NotificationRule
    silent: boolean
}

const channelIcons: Record<NotificationChannel, string> = {
    toast: mdiMessageTextOutline,
    sound: mdiVolumeHigh,
    browser: mdiBellRingOutline,
}

const channelLabels: Record<NotificationChannel, string> = {
    toast: 'Toast',
    sound: 'Sound',
    browser: 'Browser',
}

const eventIcons: Record<PrinterEventName, string> = {
    printStarted: mdiPlayCircleOutline,
    printFinished: mdiCheckCircleOutline,
    printFailed: mdiAlertCircleOutline,
    printPaused: mdiPauseCircleOutline,
    klipperError: mdiAlertOctagonOutline,
    filamentRunout: mdiPrinter3dNozzleAlertOutline,
}

const browserHints: Record<Exclude<BrowserNotificationStatus, 'granted'>, string> = {
    default: 'BrowserDefault',
    denied: 'BrowserDenied',
    insecure: 'BrowserInsecure',
    unsupported: 'BrowserUnsupported',
}

@Component({
    components: { SettingsRow },
})
export default class SettingsNotificationsTab extends Mixins(EventNotificationsMixin) {
    mdiBellOffOutline = mdiBellOffOutline
    mdiInformationOutline = mdiInformationOutline
    mdiPlay = mdiPlay

    browserStatus: BrowserNotificationStatus = 'default'

    get notifyEnabled(): boolean {
        return this.alertSettings.notifyEnabled
    }

    set notifyEnabled(value: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'alerts.notifyEnabled', value })
    }

    get explainErrors(): boolean {
        return this.alertSettings.explainErrors
    }

    set explainErrors(value: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'alerts.explainErrors', value })
    }

    get channels(): ChannelColumn[] {
        return notificationChannels.map((name) => ({
            name,
            icon: channelIcons[name],
            title: this.$t(`Settings.NotificationsTab.${channelLabels[name]}`).toString(),
            description: this.$t(`Settings.NotificationsTab.${channelLabels[name]}Description`).toString(),
        }))
    }

    get events(): EventRow[] {
        return printerEventNames.map((name) => {
            const rule = this.alertSettings.events[name]

            return {
                name,
                icon: eventIcons[name],
                color: printerEventSeverities[name],
                title: this.$t(`Settings.NotificationsTab.Events.${name}.Title`).toString(),
                description: this.$t(`Settings.NotificationsTab.Events.${name}.Description`).toString(),
                rule,
                silent: notificationChannels.every((channel) => !rule[channel]),
            }
        })
    }

    // explains what happens to browser notifications this browser cannot show
    get browserHint(): string | null {
        if (this.browserStatus === 'granted') return null
        if (!this.events.some((event) => event.rule.browser)) return null

        return this.$t(`Settings.NotificationsTab.${browserHints[this.browserStatus]}`).toString()
    }

    mounted(): void {
        this.browserStatus = this.readBrowserNotificationStatus()
    }

    setChannel(name: PrinterEventName, channel: NotificationChannel, value: boolean | null): void {
        const enabled = value === true
        this.$store.dispatch('gui/saveSetting', { name: `alerts.events.${name}.${channel}`, value: enabled })

        // the permission is only asked for when the user wants browser notifications
        if (channel === 'browser' && enabled) this.requestBrowserPermission()
    }

    async requestBrowserPermission(): Promise<void> {
        if (this.readBrowserNotificationStatus() === 'default') {
            try {
                // old Safari versions only know the callback
                await new Promise<void>((resolve) => {
                    const result = Notification.requestPermission(() => resolve()) as Promise<unknown> | undefined
                    result?.then(
                        () => resolve(),
                        () => resolve()
                    )
                })
            } catch {
                // the status below tells what happened
            }
        }

        this.browserStatus = this.readBrowserNotificationStatus()
    }

    testEvent(name: PrinterEventName): void {
        this.sendEventNotification(name, [this.$t('App.PrinterEvents.TestNotification').toString()])
    }
}
</script>

<style scoped>
.notification-rules {
    background: transparent !important;
}

.notification-rules--disabled tbody {
    opacity: 0.5;
}

.notification-rules__channel {
    width: 58px;
    line-height: 1.2;
    white-space: nowrap;
}

.notification-rules__title {
    row-gap: 2px;
}

.notification-rules__description {
    font-size: 0.8em;
    line-height: 1.3;
    margin-top: 3px;
}

.notification-rules tbody tr:hover {
    background: transparent !important;
}

.notification-rules__hint ::v-deep .v-alert__icon {
    align-self: center;
}
</style>
