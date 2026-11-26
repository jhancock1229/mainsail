<template>
    <v-list-item>
        <v-row>
            <v-col class="col-auto px-0">
                <v-icon class="handle pr-2">{{ mdiDragVertical }}</v-icon>
                <v-icon>{{ icon }}</v-icon>
            </v-col>
            <v-col class="pr-0 text-truncate">
                {{ panelname }}
            </v-col>
            <v-col class="col-auto pl-2">
                <v-btn
                    class="sortable-item__density mr-1"
                    icon
                    x-small
                    :title="densityTitle"
                    @click.stop="cyclePanelDensity(name)">
                    <v-icon small :color="density === 'normal' ? 'grey lighten-1' : 'primary'">
                        {{ densityIcon }}
                    </v-icon>
                </v-btn>
                <v-icon
                    :color="checkboxColor"
                    @click.stop="$emit('change-visible', name, !visible)"
                    v-html="checkboxIcon" />
            </v-col>
        </v-row>
    </v-list-item>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import draggable from 'vuedraggable'
import {
    mdiArrowCollapseVertical,
    mdiArrowExpandVertical,
    mdiCheckboxBlankOutline,
    mdiCheckboxMarked,
    mdiDragVertical,
    mdiInformation,
    mdiMinus,
} from '@mdi/js'
import DashboardLayoutsMixin from '@/components/mixins/dashboardLayouts'
import { PanelDensity } from '@/plugins/dashboardNamedLayouts'

@Component({
    components: { draggable },
})
export default class SettingsDashboardSortableItem extends Mixins(DashboardLayoutsMixin) {
    /**
     * Icons
     */
    mdiInformation = mdiInformation
    mdiDragVertical = mdiDragVertical

    @Prop({ type: String, required: true }) declare readonly name: string
    @Prop({ type: Boolean, required: true }) declare readonly visible: boolean

    get panelname() {
        return this.getPanelName(this.name)
    }

    get icon() {
        return this.convertPanelnameToIcon(this.name)
    }

    get density(): PanelDensity {
        return this.getPanelDensity(this.name)
    }

    get densityIcon(): string {
        if (this.density === 'compact') return mdiArrowCollapseVertical
        if (this.density === 'expanded') return mdiArrowExpandVertical

        return mdiMinus
    }

    get densityTitle(): string {
        const density = this.$t(`Dashboard.Layouts.Density.${this.density}`)

        return this.$t('Dashboard.Layouts.DensityTitle', { density }).toString()
    }

    get checkboxColor() {
        if (this.visible) return 'primary'

        return 'grey lighten-1'
    }

    get checkboxIcon() {
        if (this.visible) return mdiCheckboxMarked

        return mdiCheckboxBlankOutline
    }
}
</script>

<style scoped>
.handle {
    cursor: move;
}
</style>
