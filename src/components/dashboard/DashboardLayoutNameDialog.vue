<template>
    <v-dialog :value="show" max-width="420" @click:outside="close" @keydown.esc="close">
        <v-card class="dashboard-layout-name-dialog">
            <v-card-title class="text-h6">{{ title }}</v-card-title>
            <v-card-text class="pb-0">
                <v-text-field
                    ref="field"
                    v-model="name"
                    :label="$t('Dashboard.Layouts.Name')"
                    :hint="hint"
                    :persistent-hint="hint !== ''"
                    :counter="maxLength"
                    :maxlength="maxLength"
                    outlined
                    dense
                    autofocus
                    @keydown.enter="confirm" />
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn text @click="close">{{ $t('Buttons.Cancel') }}</v-btn>
                <v-btn text color="primary" :disabled="!isValid" @click="confirm">{{ confirmText }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { MAX_LAYOUT_NAME_LENGTH, sanitizeLayoutName } from '@/plugins/dashboardNamedLayouts'
import { TranslateResult } from 'vue-i18n'

@Component
export default class DashboardLayoutNameDialog extends Mixins(BaseMixin) {
    @Prop({ type: Boolean, required: true }) declare readonly show: boolean
    @Prop({ type: String, required: true }) declare readonly title: string | TranslateResult
    @Prop({ type: String, required: true }) declare readonly confirmText: string | TranslateResult
    @Prop({ type: String, required: false, default: '' }) declare readonly hint: string | TranslateResult
    @Prop({ type: String, required: false, default: '' }) declare readonly initialName: string

    maxLength = MAX_LAYOUT_NAME_LENGTH
    name = ''

    get isValid(): boolean {
        return sanitizeLayoutName(this.name) !== ''
    }

    @Watch('show')
    onShowChanged(show: boolean): void {
        if (show) this.name = this.initialName
    }

    confirm(): void {
        if (!this.isValid) return

        this.$emit('confirm', sanitizeLayoutName(this.name))
        this.close()
    }

    close(): void {
        this.$emit('close')
    }
}
</script>
