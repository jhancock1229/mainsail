<template>
    <v-sheet elevation="12" rounded="lg" class="kiosk-suggestion pa-4">
        <div class="d-flex align-start">
            <v-icon class="mr-3 mt-1" color="primary">{{ mdiGestureTap }}</v-icon>
            <div>
                <div class="text-subtitle-1 font-weight-medium">{{ $t('Kiosk.Suggestion.Title') }}</div>
                <div class="text-body-2 text--secondary">{{ $t('Kiosk.Suggestion.Description') }}</div>
            </div>
        </div>
        <div class="kiosk-suggestion__actions mt-3">
            <v-btn text large class="kiosk-suggestion__decline text-none" @click="decide('off')">
                {{ $t('Kiosk.Suggestion.Decline') }}
            </v-btn>
            <v-btn depressed large color="primary" class="kiosk-suggestion__accept text-none" @click="decide('on')">
                {{ $t('Kiosk.Suggestion.Accept') }}
            </v-btn>
        </div>
    </v-sheet>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { mdiGestureTap } from '@mdi/js'
import { setKioskDeviceMode } from '@/plugins/kioskSession'

@Component
export default class KioskSuggestion extends Vue {
    mdiGestureTap = mdiGestureTap

    decide(mode: 'on' | 'off'): void {
        setKioskDeviceMode(mode)
    }
}
</script>

<style scoped>
.kiosk-suggestion {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    max-width: 480px;
    margin: 0 auto;
    z-index: 7;
}

.kiosk-suggestion__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.kiosk-suggestion__actions .v-btn {
    flex: 1 1 auto;
}
</style>
