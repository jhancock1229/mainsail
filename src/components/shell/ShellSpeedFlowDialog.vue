<template>
    <v-dialog v-model="showDialog" width="480">
        <v-card class="shell-speed-flow">
            <v-card-title class="shell-speed-flow__title">{{ $t('Shell.Print.SpeedAndFlow') }}</v-card-title>
            <v-card-text class="px-3">
                <v-container>
                    <tool-slider
                        :label="$t('Panels.ToolheadControlPanel.SpeedFactor')"
                        :icon="mdiSpeedometer"
                        :target="speedFactor"
                        :min="1"
                        :max="200"
                        :multi="100"
                        :step="5"
                        :dynamic-range="true"
                        :has-input-field="true"
                        command="M220"
                        attribute-name="S" />
                </v-container>
                <extrusion-factor-settings />
            </v-card-text>
            <v-card-actions class="px-6 pb-5">
                <v-spacer />
                <v-btn text @click="showDialog = false">{{ $t('Buttons.Close') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, VModel } from 'vue-property-decorator'
import { mdiSpeedometer } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import ToolSlider from '@/components/inputs/ToolSlider.vue'
import ExtrusionFactorSettings from '@/components/panels/Extruder/ExtrusionFactorSettings.vue'

@Component({ components: { ExtrusionFactorSettings, ToolSlider } })
export default class ShellSpeedFlowDialog extends Mixins(BaseMixin) {
    @VModel({ type: Boolean }) showDialog!: boolean

    mdiSpeedometer = mdiSpeedometer

    get speedFactor(): number {
        return this.$store.state.printer?.gcode_move?.speed_factor ?? 1
    }
}
</script>

<style scoped>
.shell-speed-flow__title {
    font-size: 20px;
    font-weight: 600;
    padding: 22px 24px 8px;
}
</style>
