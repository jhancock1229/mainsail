<template>
    <div class="temperature-settings-cards">
        <v-divider class="my-1" />
        <v-list-item class="minHeight36 temperature-settings-cards__row">
            <span class="text-body-2 mr-4">{{ $t('Panels.TemperaturePanel.Cards.SparklineWindow') }}</span>
            <v-spacer />
            <v-btn-toggle v-model="windowSeconds" class="temperature-settings-cards__window" dense mandatory>
                <v-btn v-for="option in windowOptions" :key="option.seconds" :value="option.seconds" small>
                    {{ option.label }}
                </v-btn>
            </v-btn-toggle>
        </v-list-item>
        <v-list-item
            v-for="(card, index) in cards"
            :key="card.objectName"
            class="minHeight36 temperature-settings-cards__card"
            :data-object="card.objectName">
            <v-checkbox
                :input-value="card.visible"
                class="mt-0 temperature-settings-cards__checkbox"
                hide-details
                :label="card.label"
                @change="setVisible(card.objectName, $event)" />
            <v-spacer />
            <v-btn
                icon
                small
                :disabled="index === 0"
                :title="$t('Panels.TemperaturePanel.Cards.MoveUp')"
                @click="move(card.objectName, -1)">
                <v-icon small>{{ mdiArrowUp }}</v-icon>
            </v-btn>
            <v-btn
                icon
                small
                :disabled="index === cards.length - 1"
                :title="$t('Panels.TemperaturePanel.Cards.MoveDown')"
                @click="move(card.objectName, 1)">
                <v-icon small>{{ mdiArrowDown }}</v-icon>
            </v-btn>
        </v-list-item>
        <v-list-item v-if="isCustomized" class="minHeight36">
            <v-spacer />
            <v-btn text small color="primary" @click="reset">
                <v-icon small left>{{ mdiRestore }}</v-icon>
                {{ $t('Panels.TemperaturePanel.Cards.Reset') }}
            </v-btn>
        </v-list-item>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import { mdiArrowDown, mdiArrowUp, mdiRestore } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import TemperatureCardsMixin from '@/components/mixins/temperatureCards'
import { convertName } from '@/plugins/helpers'
import { getSparklineWindowOptions, moveTemperatureCard } from '@/plugins/temperatureCards'

const SECONDS_PER_MINUTE = 60

interface CardOption {
    objectName: string
    label: string
    visible: boolean
}

@Component
export default class TemperaturePanelSettingsCards extends Mixins(BaseMixin, TemperatureCardsMixin) {
    mdiArrowDown = mdiArrowDown
    mdiArrowUp = mdiArrowUp
    mdiRestore = mdiRestore

    get windowSeconds(): number {
        return this.sparklineWindow
    }

    set windowSeconds(newVal: number) {
        this.saveTemperatureCardSetting('sparklineWindow', newVal)
    }

    get windowOptions(): { seconds: number; label: string }[] {
        return getSparklineWindowOptions(this.temperatureStoreSize).map((seconds) => ({
            seconds,
            label: this.$t('Panels.TemperaturePanel.Cards.Minutes', {
                minutes: seconds / SECONDS_PER_MINUTE,
            }).toString(),
        }))
    }

    get cards(): CardOption[] {
        const hidden = this.temperatureCardSettings.hidden

        return this.temperatureCardObjects.map((objectName) => ({
            objectName,
            label: convertName(objectName.split(' ').pop() ?? objectName),
            visible: !hidden.includes(objectName),
        }))
    }

    get isCustomized(): boolean {
        return this.temperatureCardSettings.order.length > 0 || this.temperatureCardSettings.hidden.length > 0
    }

    setVisible(objectName: string, visible: boolean): void {
        const hidden = this.temperatureCardSettings.hidden.filter((name) => name !== objectName)
        if (!visible) hidden.push(objectName)

        this.saveTemperatureCardSetting('hidden', hidden)
    }

    move(objectName: string, offset: -1 | 1): void {
        const order = moveTemperatureCard(
            this.temperatureCardObjects,
            this.temperatureCardSettings.order,
            objectName,
            offset
        )

        this.saveTemperatureCardSetting('order', order)
    }

    reset(): void {
        this.saveTemperatureCardSetting('order', [])
        this.saveTemperatureCardSetting('hidden', [])
    }
}
</script>

<style scoped>
/* the buttons move below the label when the menu is too narrow for both (phones, longer translations) */
.temperature-settings-cards__row {
    flex-wrap: wrap;
    row-gap: 4px;
    padding-top: 4px;
    padding-bottom: 4px;
}

.temperature-settings-cards__checkbox {
    min-width: 0;
}

.temperature-settings-cards__window .v-btn {
    text-transform: none;
}
</style>
