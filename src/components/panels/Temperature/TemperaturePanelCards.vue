<template>
    <div>
        <div class="temperature-cards">
            <temperature-panel-card
                v-for="objectName in visibleTemperatureCardObjects"
                :key="objectName"
                :object-name="objectName"
                :is-responsive-mobile="false"
                :window-seconds="sparklineWindow" />
            <div v-if="visibleTemperatureCardObjects.length === 0" class="temperature-cards__empty text--secondary">
                {{ $t('Panels.TemperaturePanel.Cards.AllHidden') }}
            </div>
        </div>
        <!-- these objects have several readings and no history, so they keep their table rows -->
        <v-simple-table v-if="nevermoreObjects.length" class="temperature-cards__table">
            <tbody>
                <temperature-panel-list-item-nevermore
                    v-for="objectName in nevermoreObjects"
                    :key="objectName"
                    :object-name="objectName"
                    :is-responsive-mobile="false" />
            </tbody>
        </v-simple-table>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import TemperatureCardsMixin from '@/components/mixins/temperatureCards'

@Component
export default class TemperaturePanelCards extends Mixins(BaseMixin, TemperatureCardsMixin) {
    get nevermoreObjects(): string[] {
        return Object.keys(this.$store.state.printer ?? {})
            .filter((name) => name.startsWith('nevermore') && !name.split(' ').pop()?.startsWith('_'))
            .sort()
    }
}
</script>

<style scoped>
.temperature-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
}

.temperature-cards__empty {
    flex: 1 1 100%;
    padding: 12px 0;
    font-size: 0.875rem;
    text-align: center;
}

.temperature-cards__table ::v-deep td {
    height: auto !important;
    padding-top: 5px !important;
    padding-bottom: 5px !important;
}

.temperature-cards__table ::v-deep .icon {
    width: 24px;
    padding-right: 0 !important;
    text-align: center;
}
</style>
