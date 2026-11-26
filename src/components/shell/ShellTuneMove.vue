<template>
    <div class="sh-columns sh-columns--755">
        <section :aria-label="$t('Shell.Move.Title')" class="sh-col sh-col--gap-16 shell-move">
            <h2 class="sh-h2">{{ $t('Shell.Move.Title') }}</h2>
            <div class="shell-move__position">
                <div v-for="axis in position" :key="axis.name" :class="'shell-move__axis--' + axis.name">
                    <div class="shell-move__axis-label">{{ axis.name }}</div>
                    <div class="shell-move__axis-value">{{ axis.value }}</div>
                </div>
            </div>
            <div class="shell-move__steps">
                <div class="shell-move__steps-label">{{ $t('Shell.Move.Step') }}</div>
                <div role="group" :aria-label="$t('Shell.Move.StepSize')" class="shell-move__step-group">
                    <button
                        v-for="size in steps"
                        :key="size"
                        type="button"
                        class="shell-move__step"
                        :aria-pressed="size === step ? 'true' : 'false'"
                        @click="step = size">
                        {{ size }}
                    </button>
                </div>
                <div class="sh-small sh-muted">mm</div>
            </div>
            <div class="shell-move__pads sh-jog">
                <div class="shell-move__pad">
                    <div role="group" :aria-label="$t('Shell.Move.PadXY')" class="shell-move__circle">
                        <div />
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Back')"
                            :disabled="!canMoveXY"
                            @click="move('Y', 1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>
                        </button>
                        <div />
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Left')"
                            :disabled="!canMoveXY"
                            @click="move('X', -1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
                        </button>
                        <button
                            type="button"
                            class="shell-move__home"
                            :aria-label="$t('Shell.Idle.HomeAll')"
                            :title="$t('Shell.Idle.HomeAll')"
                            :disabled="!canHome"
                            @click="doHome">
                            <svg aria-hidden="true" viewBox="0 0 24 24">
                                <path d="M4 11l8-7 8 7" />
                                <path d="M6 10v9h12v-9" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Right')"
                            :disabled="!canMoveXY"
                            @click="move('X', 1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                        <div />
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Front')"
                            :disabled="!canMoveXY"
                            @click="move('Y', -1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                        <div />
                    </div>
                    <div class="sh-small sh-muted">{{ $t('Shell.Move.PadXYCaption') }}</div>
                </div>
                <div class="shell-move__pad">
                    <div role="group" :aria-label="$t('Shell.Move.PadZ')" class="shell-move__slim">
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Up')"
                            :disabled="!canMoveZ"
                            @click="move('Z', 1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>
                        </button>
                        <div class="shell-move__slim-label">Z</div>
                        <button
                            type="button"
                            :aria-label="$t('Shell.Move.Down')"
                            :disabled="!canMoveZ"
                            @click="move('Z', -1)">
                            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                    </div>
                    <div class="sh-small sh-muted">{{ $t('Shell.Move.PadZCaption') }}</div>
                </div>
            </div>
            <div v-if="hint" class="shell-move__hint">{{ hint }}</div>
        </section>

        <section :aria-label="$t('Shell.Move.GoToLabel')" class="sh-col sh-col--gap-12 shell-goto">
            <h2 class="sh-h2">{{ $t('Shell.Move.GoTo') }}</h2>
            <button
                v-for="place in places"
                :key="place"
                type="button"
                class="sh-btn sh-btn--left"
                :data-place="place"
                :disabled="!canGoTo"
                @click="goToPlace(place)">
                {{ $t(`Shell.Move.Places.${place}`) }}
            </button>
            <div class="sh-rule shell-goto__rule" />
            <h2 class="sh-h2">{{ $t('Shell.Move.Motors') }}</h2>
            <button
                type="button"
                class="sh-btn sh-btn--left"
                data-action="motors-off"
                :disabled="isPrinting"
                @click="doSend('M84')">
                {{ $t('Shell.Move.Release') }}
            </button>
            <div class="sh-spacer" />
            <h2 class="sh-h2">{{ $t('Shell.Move.HomeOne') }}</h2>
            <div class="shell-goto__axes">
                <button type="button" class="sh-btn sh-btn--44" :disabled="!canHome" @click="doHomeX">X</button>
                <button type="button" class="sh-btn sh-btn--44" :disabled="!canHome" @click="doHomeY">Y</button>
                <button type="button" class="sh-btn sh-btn--44" :disabled="!canHome" @click="doHomeZ">Z</button>
            </div>
        </section>

        <section :aria-label="$t('Shell.Move.FirstLayer')" class="sh-col shell-offset">
            <h2 class="sh-h2">{{ $t('Shell.Move.FirstLayer') }}</h2>
            <div class="shell-offset__value">
                {{ offsetText }}
                <span>mm</span>
            </div>
            <div class="shell-offset__help">{{ $t('Shell.Move.FirstLayerHelp') }}</div>
            <div class="shell-offset__buttons">
                <template v-for="amount in offsets">
                    <button
                        :key="'raise-' + amount"
                        type="button"
                        class="sh-btn sh-btn--raised sh-btn--56"
                        :data-offset="'+' + amount"
                        @click="nudge(amount)">
                        {{ $t('Shell.Move.Raise', { amount }) }}
                    </button>
                    <button
                        :key="'lower-' + amount"
                        type="button"
                        class="sh-btn sh-btn--raised sh-btn--56"
                        :data-offset="'-' + amount"
                        @click="nudge(-amount)">
                        {{ $t('Shell.Move.Lower', { amount }) }}
                    </button>
                </template>
            </div>
            <button v-if="z_gcode_offset !== 0" type="button" class="sh-link shell-offset__reset" @click="resetOffset">
                {{ $t('Shell.Move.ResetOffset') }}
            </button>
            <div class="sh-spacer" />
            <button
                type="button"
                class="sh-btn sh-btn--quiet sh-btn--48 shell-offset__save"
                :disabled="!showSaveButton || isPrinting"
                @click="saveOffset">
                {{ $t('Shell.Move.SaveDefault') }}
            </button>
        </section>

        <confirmation-dialog
            v-model="showSaveDialog"
            :title="$t('Shell.Move.SaveDefault')"
            :text="$t('Shell.Move.SaveDefaultText')"
            :action-button-text="$t('Shell.Move.SaveAndRestart')"
            :cancel-button-text="$t('Shell.Move.Later')"
            action-button-color="primary"
            @action="saveConfig" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ControlMixin from '@/components/mixins/control'
import ZoffsetMixin from '@/components/mixins/zoffset'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import { buildGoToScript, GoToTarget, resolveGoToTargets } from '@/plugins/shellStatus'

const STEPS = [0.1, 1, 10, 100]
const DEFAULT_STEP = 10
const OFFSETS = [0.01, 0.05]

@Component({ components: { ConfirmationDialog } })
export default class ShellTuneMove extends Mixins(BaseMixin, ControlMixin, ZoffsetMixin) {
    steps = STEPS
    step = DEFAULT_STEP
    offsets = OFFSETS
    places = ['centre', 'front', 'back']
    showSaveDialog = false

    get isPrinting(): boolean {
        return this.printer_state === 'printing'
    }

    get ready(): boolean {
        return this.klipperReadyForGui && !this.isPrinting
    }

    get canHome(): boolean {
        return this.ready
    }

    get canMoveXY(): boolean {
        return this.ready && this.xAxisHomed && this.yAxisHomed
    }

    get canMoveZ(): boolean {
        return this.ready && this.zAxisHomed
    }

    get targets(): Record<string, GoToTarget> | null {
        const toolhead = this.$store.state.printer.toolhead ?? {}

        return resolveGoToTargets(toolhead.axis_minimum ?? [], toolhead.axis_maximum ?? [])
    }

    get canGoTo(): boolean {
        return this.canMoveXY && this.canMoveZ && this.targets !== null
    }

    get rawPosition(): number[] {
        return (
            this.$store.state.printer.gcode_move?.gcode_position ?? this.$store.state.printer.toolhead?.position ?? []
        )
    }

    get position(): { name: string; value: string }[] {
        const [x = 0, y = 0, z = 0] = this.rawPosition

        return [
            { name: 'X', value: x.toFixed(2) },
            { name: 'Y', value: y.toFixed(2) },
            { name: 'Z', value: z.toFixed(3) },
        ]
    }

    get hint(): string {
        if (!this.klipperReadyForGui) return this.$t('Shell.Move.HintNotReady').toString()
        if (this.isPrinting) return this.$t('Shell.Move.HintPrinting').toString()
        if (!this.canMoveXY || !this.canMoveZ) return this.$t('Shell.Move.HintHome').toString()

        return ''
    }

    get offsetText(): string {
        const offset = this.z_gcode_offset

        return `${offset < 0 ? '−' : '+'}${Math.abs(offset).toFixed(3)}`
    }

    move(axis: 'X' | 'Y' | 'Z', direction: 1 | -1): void {
        const control = this.$store.state.gui.control
        const reversed = { X: control.reverseX, Y: control.reverseY, Z: control.reverseZ }[axis]
        const distance = this.step * direction * (reversed ? -1 : 1)

        this.doSendMove(`${axis}${distance}`, axis === 'Z' ? this.feedrateZ : this.feedrateXY)
    }

    goToPlace(place: string): void {
        const target = this.targets?.[place]
        if (!target) return

        this.doSend(
            buildGoToScript({
                target,
                currentZ: this.rawPosition[2] ?? 0,
                feedrateXY: this.feedrateXY,
                feedrateZ: this.feedrateZ,
            })
        )
    }

    nudge(amount: number): void {
        const sign = amount < 0 ? '-' : '+'
        const move = this.homedAxes === 'xyz' ? ' MOVE=1' : ''

        this.doSend(`SET_GCODE_OFFSET Z_ADJUST=${sign}${Math.abs(amount)}${move}`)
    }

    resetOffset(): void {
        this.doSend('SET_GCODE_OFFSET Z=0' + (this.homedAxes === 'xyz' ? ' MOVE=1' : ''))
    }

    saveOffset(): void {
        this.doSend(this.$store.state.gui.control.offsetZSaveOption ?? this.autoSaveZOffsetOption)
        this.showSaveDialog = true
    }

    saveConfig(): void {
        this.$store.dispatch('server/addEvent', { message: 'SAVE_CONFIG', type: 'command' })
        this.$socket.emit('printer.gcode.script', { script: 'SAVE_CONFIG' }, { loading: 'topbarSaveConfig' })
    }
}
</script>

<style scoped>
.shell-move__position {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.shell-move__axis-label {
    font-size: 13px;
    color: var(--shell-muted);
}

.shell-move__axis-value {
    font-size: 30px;
    line-height: 1.5;
    font-weight: 500;
}

.shell-move__steps {
    display: flex;
    align-items: center;
    gap: 12px;
}

.shell-move__steps-label {
    font-size: 14px;
    color: var(--shell-muted);
}

.shell-move__step-group {
    display: flex;
    gap: 4px;
}

.shell-move__step {
    min-height: 44px;
    min-width: 56px;
    border-radius: 8px;
    border: 1px solid var(--shell-border);
    background: transparent;
    color: var(--shell-text);
    font: 500 14px var(--shell-font);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
}

.shell-move__step[aria-pressed='true'] {
    border-color: var(--shell-accent);
    background: var(--shell-accent);
    color: var(--shell-on-accent);
    font-weight: 600;
}

.shell-move__pads {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 56px;
}

.shell-move__pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.shell-move__circle {
    width: 204px;
    height: 204px;
    border-radius: 50%;
    border: 1px solid var(--shell-border);
    display: grid;
    grid-template-columns: repeat(3, 68px);
    grid-template-rows: repeat(3, 68px);
    margin: -1px;
    box-sizing: content-box;
}

.shell-move__slim {
    width: 68px;
    height: 204px;
    border-radius: 34px;
    border: 1px solid var(--shell-border);
    display: grid;
    grid-template-rows: repeat(3, 68px);
    box-sizing: content-box;
    margin: -1px;
}

.shell-move__pads button {
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--shell-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.12s ease;
}

.shell-move__pads button:hover:not(:disabled) {
    background: var(--shell-hover);
}

.shell-move__pads button:active:not(:disabled) {
    background: var(--shell-active);
}

.shell-move__pads button:disabled {
    opacity: 0.35;
    cursor: default;
}

.shell-move__pads svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.shell-move__pads .shell-move__home {
    border: 1px solid var(--shell-border);
    margin: 8px;
    color: var(--shell-accent);
}

.shell-move__slim-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: var(--shell-muted);
}

.shell-move__hint {
    text-align: center;
    font-size: 13px;
    color: var(--shell-muted);
}

.shell-goto__rule {
    margin: 4px 0;
}

.shell-goto__axes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.shell-offset__value {
    font-size: 40px;
    line-height: 1.5;
    font-weight: 500;
}

.shell-offset__value span {
    font-size: 16px;
    font-weight: 400;
    color: var(--shell-muted);
}

.shell-offset__help {
    font-size: 14px;
    line-height: 1.5;
    color: var(--shell-text-2);
}

.shell-offset__buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.shell-offset__reset {
    padding: 4px 0;
}
</style>
