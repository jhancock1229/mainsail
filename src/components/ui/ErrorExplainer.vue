<template>
    <div class="error-explainer" :data-error-id="explanation.id">
        <div class="error-explainer__title text-subtitle-1 font-weight-medium d-flex align-start mb-1">
            <v-icon v-if="icon" :color="color" class="mr-2">{{ icon }}</v-icon>
            <span>{{ title }}</span>
        </div>
        <p class="error-explainer__cause text-body-2 text--secondary mb-2">{{ cause }}</p>
        <pre v-if="!explanation.known" class="error-explainer__raw text-body-2 text--secondary mb-2">{{
            explanation.raw
        }}</pre>
        <p class="error-explainer__fix text-body-2 text--primary d-flex align-start mb-3">
            <v-icon small :color="color" class="mr-2 mt-1">{{ mdiLightbulbOnOutline }}</v-icon>
            <span>{{ fix }}</span>
        </p>
        <div v-if="actions.length" class="error-explainer__actions d-flex flex-wrap mb-1">
            <v-btn
                v-for="action in actions"
                :key="action.id"
                small
                depressed
                :color="color"
                :href="action.href"
                :target="action.href ? '_blank' : undefined"
                :loading="action.loading !== undefined && loadings.includes(action.loading)"
                :data-action="action.id"
                class="mr-2 mb-2"
                @click="action.click">
                <v-icon small left>{{ action.icon }}</v-icon>
                {{ action.text }}
            </v-btn>
        </div>
        <template v-if="explanation.known && explanation.raw !== ''">
            <v-btn
                text
                small
                :color="color"
                class="error-explainer__toggle px-1 ml-n1"
                :aria-expanded="showRaw ? 'true' : 'false'"
                @click="showRaw = !showRaw">
                <v-icon small left :class="{ 'error-explainer__chevron--open': showRaw }">
                    {{ mdiChevronRight }}
                </v-icon>
                {{ showRaw ? $t('ErrorExplainer.HideOriginalMessage') : $t('ErrorExplainer.ShowOriginalMessage') }}
            </v-btn>
            <v-expand-transition>
                <pre v-show="showRaw" class="error-explainer__raw text-body-2 text--secondary mt-2">{{
                    explanation.raw
                }}</pre>
            </v-expand-transition>
        </template>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { ErrorActionId, ErrorExplanation, resolveReheatTarget } from '@/plugins/errorExplainer'
import {
    mdiChevronRight,
    mdiDownload,
    mdiFileDocumentEditOutline,
    mdiFire,
    mdiHome,
    mdiLightbulbOnOutline,
    mdiRestart,
} from '@mdi/js'

interface ErrorExplainerAction {
    id: ErrorActionId
    text: string
    icon: string
    href?: string
    loading?: string
    click: () => void
}

// Shows an error of Klipper or of a print in plain language, with the suggested actions as buttons.
@Component
export default class ErrorExplainer extends Mixins(BaseMixin) {
    @Prop({ type: Object, required: true }) declare readonly explanation: ErrorExplanation
    @Prop({ type: String, required: false, default: 'warning' }) declare readonly color: string
    @Prop({ type: String, required: false, default: '' }) declare readonly icon: string

    mdiChevronRight = mdiChevronRight
    mdiLightbulbOnOutline = mdiLightbulbOnOutline

    showRaw = false

    get title(): string {
        return this.text('Title')
    }

    get cause(): string {
        return this.text('Cause')
    }

    get fix(): string {
        return this.text('Fix')
    }

    get reheatTarget(): { heater: string; temperature: number } | null {
        return resolveReheatTarget({
            heater: this.explanation.params.heater,
            activeExtruder: this.$store.state.printer.toolhead?.extruder,
            heaters: this.$store.state.printer.heaters?.available_heaters ?? [],
            file: this.$store.state.printer.current_file,
        })
    }

    get reheatAction(): ErrorExplainerAction | null {
        const target = this.reheatTarget
        if (target === null) return null

        return {
            id: 'reheat',
            text: this.$t('ErrorExplainer.Actions.Reheat', target).toString(),
            icon: mdiFire,
            click: () => this.sendGcode(`SET_HEATER_TEMPERATURE HEATER=${target.heater} TARGET=${target.temperature}`),
        }
    }

    get availableActions(): Record<ErrorActionId, ErrorExplainerAction | null> {
        return {
            firmwareRestart: {
                id: 'firmwareRestart',
                text: this.$t('Panels.KlippyStatePanel.FirmwareRestart').toString(),
                icon: mdiRestart,
                loading: 'firmwareRestart',
                click: () => this.$socket.emit('printer.firmware_restart', {}, { loading: 'firmwareRestart' }),
            },
            restart: {
                id: 'restart',
                text: this.$t('Panels.KlippyStatePanel.Restart').toString(),
                icon: mdiRestart,
                loading: 'restart',
                click: () => this.$socket.emit('printer.restart', {}, { loading: 'restart' }),
            },
            klipperLog: {
                id: 'klipperLog',
                text: this.$t('Panels.KlippyStatePanel.KlipperLog').toString(),
                icon: mdiDownload,
                href: this.apiUrl + '/server/files/klippy.log',
                click: () => undefined,
            },
            home: {
                id: 'home',
                text: this.$t('ErrorExplainer.Actions.Home').toString(),
                icon: mdiHome,
                loading: 'homeAll',
                click: () => this.sendGcode('G28', 'homeAll'),
            },
            reheat: this.reheatAction,
            openConfig: {
                id: 'openConfig',
                text: this.$t('ErrorExplainer.Actions.OpenConfig').toString(),
                icon: mdiFileDocumentEditOutline,
                click: () =>
                    this.$store.dispatch('editor/openFile', {
                        root: 'config',
                        path: '',
                        filename: 'printer.cfg',
                        size: 0,
                        permissions: 'rw',
                    }),
            },
        }
    }

    get actions(): ErrorExplainerAction[] {
        return this.explanation.actions
            .map((id) => this.availableActions[id])
            .filter((action): action is ErrorExplainerAction => action !== null)
    }

    @Watch('explanation.raw')
    rawChanged(): void {
        this.showRaw = false
    }

    text(part: 'Title' | 'Cause' | 'Fix'): string {
        return this.$t(`ErrorExplainer.Errors.${this.explanation.id}.${part}`, this.explanation.params).toString()
    }

    sendGcode(script: string, loading?: string): void {
        this.$store.dispatch('server/addEvent', { message: script, type: 'command' })
        this.$socket.emit('printer.gcode.script', { script }, loading === undefined ? {} : { loading })
    }
}
</script>

<style scoped>
.error-explainer__title {
    line-height: 1.3;
}

.error-explainer__raw {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    opacity: 0.85;
}

.error-explainer__toggle {
    text-transform: none;
    letter-spacing: normal;
}

.error-explainer__toggle .v-icon {
    transition: transform 0.2s;
}

.error-explainer__chevron--open {
    transform: rotate(90deg);
}
</style>
