<template>
    <v-bottom-navigation app fixed grow :height="barHeight" class="kiosk-bottom-bar">
        <v-btn
            v-for="page in kioskBottomPages"
            :key="page.name"
            :to="page.path"
            active-class=""
            exact-active-class=""
            class="kiosk-bottom-bar__item"
            :class="{ 'kiosk-bottom-bar__item--current': page.name === $route.name }"
            :aria-current="page.name === $route.name ? 'page' : null"
            :data-page="page.name">
            <span class="kiosk-bottom-bar__label">{{ page.title }}</span>
            <v-icon>{{ page.icon }}</v-icon>
        </v-btn>
        <v-btn class="kiosk-bottom-bar__more" :input-value="false" @click="$emit('more')">
            <span class="kiosk-bottom-bar__label">{{ $t('Kiosk.More') }}</span>
            <v-icon>{{ mdiDotsHorizontal }}</v-icon>
        </v-btn>
    </v-bottom-navigation>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import { mdiDotsHorizontal } from '@mdi/js'
import KioskNavigationMixin from '@/components/mixins/kioskNavigation'
import { kioskSession } from '@/plugins/kioskSession'

const BAR_HEIGHT = 64
const BAR_HEIGHT_LOW_SCREEN = 56
const LOW_SCREEN_HEIGHT = 520

@Component
export default class KioskBottomBar extends Mixins(KioskNavigationMixin) {
    mdiDotsHorizontal = mdiDotsHorizontal

    get barHeight(): number {
        return kioskSession.height <= LOW_SCREEN_HEIGHT ? BAR_HEIGHT_LOW_SCREEN : BAR_HEIGHT
    }
}
</script>

<style scoped>
.kiosk-bottom-bar {
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: content-box;
}

.kiosk-bottom-bar ::v-deep .v-btn {
    height: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    padding: 0 4px;
}

.kiosk-bottom-bar__label {
    font-size: 0.75rem;
    letter-spacing: normal;
    text-transform: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.kiosk-bottom-bar ::v-deep .v-btn.kiosk-bottom-bar__item--current {
    color: var(--color-primary) !important;
}

.kiosk-bottom-bar ::v-deep .v-btn.kiosk-bottom-bar__item--current::before {
    opacity: 0.08;
}
</style>
